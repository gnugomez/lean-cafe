<script setup lang="ts">
import type { ColumnItem } from '~/composables/useRoom'

const props = defineProps<{ column: ColumnItem }>()
const store = useRoomStore()
const { dragOverColumn, isOwner } = store

const displayCards = computed(() => store.cardsForColumn(props.column.id))
const isTarget = computed(() => dragOverColumn.value === props.column.id)

// canvas bounds for display-clamping notes (width is shared, height is local)
const canvasEl = ref<HTMLElement | null>(null)
const { height: canvasHeight } = useElementSize(canvasEl)
const canvasWidth = computed(() => props.column.width - 24) // column padding

// title editing (host only)
const editingTitle = ref(false)
const titleDraft = ref('')
function beginTitle() {
  if (!isOwner.value) return
  titleDraft.value = props.column.title
  editingTitle.value = true
}
function commitTitle() {
  const clean = titleDraft.value.trim()
  if (clean && clean !== props.column.title) store.renameColumn(props.column.id, clean)
  editingTitle.value = false
}

// spawn a note at a canvas point (rect is screen px, positions are content px)
function spawnAt(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const z = store.zoom.value
  const x = Math.max(4, Math.min((e.clientX - rect.left) / z - 8, rect.width / z - 224))
  const y = Math.max(4, Math.min((e.clientY - rect.top) / z - 8, rect.height / z - 90))
  store.addCard(props.column.id, x, y)
}

// the note tool places one card, then hands back to the select tool
function onCanvasClick(e: MouseEvent) {
  if (store.tool.value !== 'note') return
  if (e.target !== e.currentTarget) return // clicks on notes are theirs
  spawnAt(e)
  store.tool.value = 'select'
}

function onCanvasDblClick(e: MouseEvent) {
  if (store.tool.value !== 'select') return
  if (e.target !== e.currentTarget) return
  spawnAt(e)
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
    // pointer deltas are screen px; column widths are board-content px
    store.resizeColumn(props.column.id, startWidth + (ev.clientX - startX) / store.zoom.value)
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
      <input
        v-if="editingTitle"
        :ref="el => (el as HTMLInputElement)?.focus()"
        v-model="titleDraft"
        class="input col-title-input"
        maxlength="40"
        @blur="commitTitle"
        @keydown.enter.prevent="commitTitle"
        @keydown.esc="editingTitle = false"
      >
      <h2
        v-else
        class="col-title"
        :class="{ editable: isOwner }"
        :title="isOwner ? 'Click to rename' : undefined"
        @click="beginTitle"
      >{{ column.title }}</h2>
      <span class="col-count">{{ displayCards.length }}</span>
      <button v-if="isOwner" class="icon-btn" title="Delete column" @click="removeColumn"><Icon name="lucide:x" /></button>
    </header>

    <div
      ref="canvasEl"
      class="col-canvas"
      title="Double-click to add a card"
      @click="onCanvasClick"
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

    <div
      v-if="isOwner"
      class="col-resize"
      title="Drag to resize column"
      @pointerdown="onResizeStart"
    />
  </section>
</template>
