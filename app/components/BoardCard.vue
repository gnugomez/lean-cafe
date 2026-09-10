<script setup lang="ts">
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { Placeholder } from '@tiptap/extensions'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import type { CardItem } from '~/composables/useRoom'

const props = defineProps<{ card: CardItem, canvasWidth: number, canvasHeight: number }>()
const store = useRoomStore()
const { voting, myVotes, votesLeft, cardVotes, people, hideAuthors, draggingCardId, dragOverColumn } = store

const isMine = computed(() => props.card.authorId === store.uid)
// When the host hides authors, other people's names never reach the DOM —
// a blurred name-like placeholder is rendered instead.
const authorHidden = computed(() => hideAuthors.value && !isMine.value)
const authorName = computed(() =>
  people.value[props.card.authorId]?.name || props.card.authorName || 'Anonymous')
const authorColor = computed(() => authorHidden.value ? '#c9c9cf' : colorFor(props.card.authorId))
const fakeAuthor = computed(() => fakeNameFor(props.card.id, authorName.value.length))

// ---- collaborative rich-text body (Tiptap bound to the card's Y.XmlFragment) ----
const editing = ref(false)
const editor = shallowRef<Editor | undefined>(undefined)
let mirrorTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  const fragment = store.bodyFragment(props.card.id)
  if (!fragment) return
  editor.value = new Editor({
    editable: false,
    extensions: [
      // Collaboration provides Yjs-based undo/redo, so the default is off.
      StarterKit.configure({
        undoRedo: false,
        // clicking a link navigates only in read-only mode
        link: { openOnClick: 'whenNotEditable', autolink: true, linkOnPaste: true },
      }),
      MarkdownLink,
      Placeholder.configure({ placeholder: 'What should we talk about?' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Collaboration.configure({ fragment }),
    ],
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
          endEditing()
          return true
        }
        return false
      },
    },
    onUpdate: () => {
      if (mirrorTimer) clearTimeout(mirrorTimer)
      mirrorTimer = setTimeout(syncMirror, 400)
    },
    onBlur: () => endEditing(),
  })
  // a card just created by this client opens ready to type
  if (store.autoEditCardId.value === props.card.id) {
    store.autoEditCardId.value = null
    beginEditing()
  }
})

onBeforeUnmount(() => {
  stopDrag() // e.g. the card was deleted by another peer mid-drag
  if (mirrorTimer) clearTimeout(mirrorTimer)
  editor.value?.destroy()
})

function syncMirror() {
  if (mirrorTimer) {
    clearTimeout(mirrorTimer)
    mirrorTimer = null
  }
  const ed = editor.value
  if (ed && !ed.isDestroyed) store.updateCardText(props.card.id, ed.getText().trim())
}

// cards are frozen while a voting round is live
const votingLive = computed(() => voting.value.phase === 'voting')
watch(votingLive, (live) => {
  if (live && editing.value) endEditing()
})

function beginEditing() {
  const ed = editor.value
  if (!ed || editing.value || votingLive.value) return
  editing.value = true
  ed.setEditable(true)
  nextTick(() => ed.commands.focus('end'))
}

function endEditing() {
  const ed = editor.value
  if (!ed || !editing.value) return
  editing.value = false
  ed.setEditable(false)
  syncMirror()
  // abandoning an empty card removes it
  if (ed.isEmpty) store.removeCard(props.card.id)
}

// ---- free positioning on the whiteboard ----
const noteEl = ref<HTMLElement | null>(null)
const dragging = ref(false)
const dx = ref(0)
const dy = ref(0)
let startX = 0
let startY = 0
let moved = false

// subtle per-note tilt for the sticky-note feel
const tilt = computed(() => {
  let h = 0
  for (let i = 0; i < props.card.id.length; i++) h = (h * 31 + props.card.id.charCodeAt(i)) >>> 0
  return ((h % 7) - 3) * 0.5
})

// clamp to the current canvas at render time only — the stored position is
// untouched, so re-widening a column restores where notes really are
const noteSize = useElementSize(noteEl)
const shownX = computed(() => {
  const maxX = props.canvasWidth - (noteSize.width.value || 220) - 4
  return Math.max(4, Math.min(props.card.x, Math.max(4, maxX)))
})
const shownY = computed(() => {
  if (props.canvasHeight < 60) return props.card.y // not measured yet
  const maxY = props.canvasHeight - (noteSize.height.value || 100) - 4
  return Math.max(4, Math.min(props.card.y, Math.max(4, maxY)))
})

const noteStyle = computed(() => ({
  left: `${shownX.value}px`,
  top: `${shownY.value}px`,
  zIndex: dragging.value ? 1000 : props.card.z || 1,
  transform: dragging.value
    ? `translate(${dx.value}px, ${dy.value}px) rotate(${tilt.value}deg)`
    : `rotate(${tilt.value}deg)`,
}))

function columnAt(x: number, y: number): HTMLElement | null {
  // the dragged note has pointer-events: none, so this sees what's under it
  return (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-column-id]') ?? null
}

// Drag listeners live on window, NOT on the note: the dragging note goes
// pointer-events: none (for hit-testing), which makes some browsers silently
// drop pointer capture on it — element-level listeners then never see
// pointerup and the note stays stuck in drag state forever.
let activePointerId: number | null = null

function stopDrag() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('blur', onWindowBlur)
  activePointerId = null
  dragging.value = false
  dx.value = 0
  dy.value = 0
  if (draggingCardId.value === props.card.id) draggingCardId.value = null
  dragOverColumn.value = null
}

function onWindowBlur() {
  stopDrag()
}

function onCardDblClick(e: MouseEvent) {
  if (editing.value) return // inside the editor, double-click selects words
  if ((e.target as HTMLElement).closest('button, input, a')) return
  beginEditing()
}

function onPointerDown(e: PointerEvent) {
  if (editing.value || e.button !== 0 || activePointerId !== null) return
  if ((e.target as HTMLElement).closest('button, input, a')) return
  activePointerId = e.pointerId
  startX = e.clientX
  startY = e.clientY
  moved = false
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('blur', onWindowBlur)
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerId !== activePointerId) return
  const mx = e.clientX - startX
  const my = e.clientY - startY
  if (!moved && Math.hypot(mx, my) < 4) return
  if (!moved) {
    // capture only once a real drag starts, so plain clicks and double-clicks
    // keep their natural event targets; it's a best-effort bonus that tracks
    // the pointer outside the window — correctness never depends on it
    try {
      noteEl.value?.setPointerCapture(e.pointerId)
    } catch { /* fine without */ }
  }
  moved = true
  e.preventDefault()
  if (!dragging.value) {
    dragging.value = true
    draggingCardId.value = props.card.id
  }
  dx.value = mx
  dy.value = my
  dragOverColumn.value = columnAt(e.clientX, e.clientY)?.dataset.columnId ?? null
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== activePointerId) return
  const el = noteEl.value
  const wasDragging = dragging.value && moved
  const targetCol = wasDragging ? columnAt(e.clientX, e.clientY) : null
  const noteRect = el?.getBoundingClientRect() // includes the drag transform
  stopDrag()
  if (!wasDragging || !el || !noteRect) return

  const colId = targetCol?.dataset.columnId || props.card.columnId
  const canvas = (targetCol || el.closest('[data-column-id]'))?.querySelector('.col-canvas')
  if (!canvas) return
  const cRect = canvas.getBoundingClientRect()
  const x = Math.max(4, Math.min(noteRect.left - cRect.left, cRect.width - noteRect.width - 4))
  const y = Math.max(4, Math.min(noteRect.top - cRect.top, cRect.height - noteRect.height - 4))
  store.moveNote(props.card.id, colId, x, y)
}
</script>

<template>
  <article
    ref="noteEl"
    class="card"
    :class="{ dragging, editing }"
    :style="noteStyle"
    @pointerdown="onPointerDown"
    @dblclick="onCardDblClick"
  >
    <div class="card-body">
      <EditorContent :editor="editor" />
    </div>
    <footer class="card-foot">
      <span class="card-author">
        <i class="author-dot" :style="{ background: authorColor }" />
        <span v-if="authorHidden" class="author-hidden" aria-label="hidden author">{{ fakeAuthor }}</span>
        <template v-else>{{ authorName }}</template>
      </span>
      <!-- mousedown.prevent keeps these controls from blurring the editor -->
      <span class="card-tools" @mousedown.prevent>
        <span v-if="voting.phase === 'voting'" class="vote-stepper">
          <button
            class="vote-btn"
            :disabled="!((myVotes[card.id] ?? 0) > 0)"
            title="Remove a vote"
            @click="store.adjustVote(card.id, -1)"
          ><Icon name="lucide:minus" /></button>
          <b>{{ myVotes[card.id] || 0 }}</b>
          <button
            class="vote-btn"
            :disabled="votesLeft <= 0"
            title="Vote for this"
            @click="store.adjustVote(card.id, 1)"
          ><Icon name="lucide:plus" /></button>
        </span>
        <span
          v-else-if="(cardVotes[card.id] || 0) > 0"
          class="vote-badge"
          :class="{ hot: voting.phase === 'results' }"
        ><Icon name="lucide:arrow-big-up" /> {{ cardVotes[card.id] }}</span>
        <span v-if="!votingLive" class="card-actions">
          <button
            class="icon-btn"
            :title="editing ? 'Done editing' : 'Edit card'"
            @click="editing ? endEditing() : beginEditing()"
          ><Icon :name="editing ? 'lucide:check' : 'lucide:pencil'" /></button>
          <button class="icon-btn" title="Delete card" @click="store.removeCard(card.id)"><Icon name="lucide:x" /></button>
        </span>
      </span>
    </footer>
  </article>
</template>
