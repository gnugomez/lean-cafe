<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import Document from '@tiptap/extension-document'
import type { ColumnItem } from '~/composables/useRoom'

// first node is always the title heading, the rest is the description
const ColumnDoc = Document.extend({ content: 'heading block*' })

const props = defineProps<{ column: ColumnItem }>()
const store = useRoomStore()
const { dragOverColumn, isOwner } = store

const displayCards = computed(() => store.cardsForColumn(props.column.id))
const isTarget = computed(() => dragOverColumn.value === props.column.id)

// canvas bounds for display-clamping notes (width is shared, height is local)
const canvasEl = ref<HTMLElement | null>(null)
const { height: canvasHeight } = useElementSize(canvasEl)
const canvasWidth = computed(() => props.column.width - 24) // column padding

// ---- column description (host-editable collaborative rich text) ----
const {
  editor: descEditor,
  editing: descEditing,
  init: initDescEditor,
  beginEditing: beginDescEdit,
  endEditing: endDescEdit,
} = useCollabEditor({
  // null until the header doc exists in the heading-first shape the ColumnDoc
  // schema requires (the store's isHeaderDoc guard) — plain title until then
  getFragment: () => store.columnDescFragment(props.column.id),
  document: ColumnDoc,
  placeholder: {
    showOnlyWhenEditable: false,
    showOnlyCurrent: false,
    placeholder: ({ node }) => node.type.name === 'heading'
      ? 'Column title'
      : (isOwner.value ? 'Add a description…' : ''),
  },
  canEdit: () => isOwner.value,
  // keep the plain-string title mirrored from the heading (dialogs, fallbacks);
  // debounced only to coalesce Y.Map writes — endDescEdit() flushes synchronously
  onSync: (ed) => {
    if (!isOwner.value) return
    const title = ed.state.doc.firstChild?.textContent.trim()
    if (title && title !== props.column.title) store.renameColumn(props.column.id, title)
  },
  // drop trailing empty lines left behind while editing (keep the title node)
  beforeEnd: (ed) => {
    const doc = ed.state.doc
    let cut = doc.content.size
    for (let i = doc.childCount - 1; i > 0; i--) {
      const child = doc.child(i)
      if (child.isTextblock && child.content.size === 0) cut -= child.nodeSize
      else break
    }
    if (cut < doc.content.size) ed.commands.deleteRange({ from: cut, to: doc.content.size })
  },
})
onMounted(initDescEditor)
// non-hosts bind lazily once the host creates (or normalizes) the header doc
watch(() => props.column.hasDesc, has => { if (has) initDescEditor() })

// double-click on empty board space spawns a note right there
function onCanvasDblClick(e: MouseEvent) {
  if (e.target !== e.currentTarget) return // clicks on notes are theirs
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = Math.max(4, Math.min(e.clientX - rect.left - 8, rect.width - 224))
  const y = Math.max(4, Math.min(e.clientY - rect.top - 8, rect.height - 90))
  store.addCard(props.column.id, x, y)
}

function removeColumn() {
  const n = displayCards.value.length
  if (!n || window.confirm(`Delete “${props.column.title}” and its ${n} card${n === 1 ? '' : 's'}?`)) {
    store.removeColumn(props.column.id)
  }
}

// column resizing (host only) — width is shared so every peer sees the layout
const resizing = ref(false)
function onResizeStart(e: PointerEvent) {
  if (!isOwner.value) return
  e.preventDefault()
  resizing.value = true
  const startX = e.clientX
  const startWidth = props.column.width
  const handle = e.currentTarget as HTMLElement
  handle.setPointerCapture(e.pointerId)
  const onMove = (ev: PointerEvent) => {
    store.resizeColumn(props.column.id, startWidth + (ev.clientX - startX))
  }
  const onUp = () => {
    resizing.value = false
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onUp)
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onUp)
}
</script>

<template>
  <section
    class="panel column"
    :class="{ 'drop-target': isTarget, resizing }"
    :style="{ flex: `0 0 ${column.width}px`, width: `${column.width}px` }"
    :data-column-id="column.id"
  >
    <header class="col-head">
      <div
        v-if="descEditor"
        class="col-desc"
        :class="{ editing: descEditing, editable: isOwner }"
        :title="isOwner && !descEditing ? 'Click to edit title & description' : undefined"
        @click="beginDescEdit"
      >
        <EditorContent :editor="descEditor" />
      </div>
      <h2 v-else class="col-title">{{ column.title }}</h2>
      <span class="col-count">{{ displayCards.length }}</span>
      <button v-if="isOwner" class="icon-btn" title="Delete column" @click="removeColumn"><Icon name="lucide:x" /></button>
    </header>

    <div
      ref="canvasEl"
      class="col-canvas"
      title="Double-click to add a card"
      @dblclick="onCanvasDblClick"
    >
      <BoardCard
        v-for="card in displayCards"
        :key="card.id"
        :card="card"
        :canvas-width="canvasWidth"
        :canvas-height="canvasHeight"
      />
    </div>

    <button class="btn add-card-btn" @click="store.addCard(column.id)"><Icon name="lucide:plus" /> Add a card</button>

    <div
      v-if="isOwner"
      class="col-resize"
      title="Drag to resize column"
      @pointerdown="onResizeStart"
    />
  </section>
</template>
