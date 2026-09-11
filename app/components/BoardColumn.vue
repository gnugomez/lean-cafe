<script setup lang="ts">
import type { ColumnItem } from '~/composables/useRoom'

const props = defineProps<{ column: ColumnItem }>()
const store = useRoomStore()
const { dragOverColumn, isOwner } = store

const displayCards = computed(() => store.cardsForColumn(props.column.id))
const isTarget = computed(() => dragOverColumn.value === props.column.id)
// while one of this column's notes is dragged, the canvas unclips so the
// note stays visible on its way to another column
const isDragSource = computed(() =>
  !!store.draggingCardId.value && displayCards.value.some(c => c.id === store.draggingCardId.value))

// this viewer's window into the column's infinite canvas (pan px + zoom)
const view = store.columnView(props.column.id)
const viewMoved = computed(() => view.zoom !== 1 || view.x !== 0 || view.y !== 0)
function resetView() {
  view.zoom = 1
  view.x = 0
  view.y = 0
}

// screen point -> column-content coordinates
function toContent(e: MouseEvent, el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return {
    x: (e.clientX - r.left - view.x) / view.zoom,
    y: (e.clientY - r.top - view.y) / view.zoom,
  }
}

// the dot grid is the zoom reference: it scales with zoom and slides with pan
const gridStyle = computed(() => ({
  backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px`,
  backgroundPosition: `${view.x}px ${view.y}px`,
}))

// hand tool (or ctrl/cmd) + wheel zooms toward the cursor; plain wheel pans
function onCanvasWheel(e: WheelEvent) {
  e.preventDefault()
  if (e.ctrlKey || e.metaKey || store.tool.value === 'hand') {
    const old = view.zoom
    const next = Math.min(2, Math.max(0.25, old * Math.exp(-e.deltaY * 0.005)))
    if (next === old) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const cx = e.clientX - r.left
    const cy = e.clientY - r.top
    view.x = cx - ((cx - view.x) / old) * next
    view.y = cy - ((cy - view.y) / old) * next
    view.zoom = next
  } else {
    view.x -= e.deltaX
    view.y -= e.deltaY
  }
}

// hand tool: drag to pan within the column
function onCanvasPointerDown(e: PointerEvent) {
  if (store.tool.value !== 'hand' || e.button !== 0) return
  e.preventDefault()
  const canvas = e.currentTarget as HTMLElement
  canvas.setPointerCapture(e.pointerId)
  const sx = e.clientX
  const sy = e.clientY
  const ox = view.x
  const oy = view.y
  const onMove = (ev: PointerEvent) => {
    view.x = ox + ev.clientX - sx
    view.y = oy + ev.clientY - sy
  }
  const onUp = () => {
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
}

// live cursor broadcast in column-content coordinates
function onCanvasPointerMove(e: PointerEvent) {
  const p = toContent(e, e.currentTarget as HTMLElement)
  store.setPointer(props.column.id, p.x, p.y)
}

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

// clicks on notes are theirs — only the canvas or its surface spawns
function onEmptySpace(e: MouseEvent) {
  const t = e.target as HTMLElement
  return t.classList.contains('col-canvas') || t.classList.contains('canvas-surface')
}

function spawnAt(e: MouseEvent) {
  const p = toContent(e, e.currentTarget as HTMLElement)
  store.addCard(props.column.id, p.x - 8, p.y - 8)
}

// the note tool places one card, then hands back to the select tool
function onCanvasClick(e: MouseEvent) {
  if (store.tool.value !== 'note' || !onEmptySpace(e)) return
  spawnAt(e)
  store.tool.value = 'select'
}

function onCanvasDblClick(e: MouseEvent) {
  if (store.tool.value !== 'select' || !onEmptySpace(e)) return
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
    :class="{ 'drop-target': isTarget, resizing, 'drag-source': isDragSource }"
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
      <button
        v-if="viewMoved"
        class="view-reset"
        title="Reset this column's view"
        @click="resetView"
      >{{ Math.round(view.zoom * 100) }}%</button>
      <span class="col-count">{{ displayCards.length }}</span>
      <button v-if="isOwner" class="icon-btn" title="Delete column" @click="removeColumn"><Icon name="lucide:x" /></button>
    </header>

    <div
      class="col-canvas"
      title="Double-click to add a card"
      :style="gridStyle"
      @click="onCanvasClick"
      @dblclick="onCanvasDblClick"
      @wheel="onCanvasWheel"
      @pointerdown="onCanvasPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerleave="store.setPointer(null)"
    >
      <div class="canvas-surface" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }">
        <RemoteCursors :column-id="column.id" :zoom="view.zoom" />
        <BoardCard v-for="card in displayCards" :key="card.id" :card="card" />
      </div>
    </div>

    <div
      v-if="isOwner"
      class="col-resize"
      title="Drag to resize column"
      @pointerdown="onResizeStart"
    />
  </section>
</template>
