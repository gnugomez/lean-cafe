<script setup lang="ts">
import type { ColumnItem } from '~/composables/useRoom'

const props = defineProps<{ column: ColumnItem }>()
const store = useRoomStore()
const { dragOverColumn, isOwner } = store

const displayCards = computed(() => store.cardsForColumn(props.column.id))
const isTarget = computed(() => dragOverColumn.value === props.column.id)
// while one of this column's notes is dragged, the canvas unclips so the
// note stays visible on its way to another column
const isDragSource = computed(() => {
  const ids = store.dragging.value?.ids
  const remote = store.remoteDrags.value
  return displayCards.value.some(c => ids?.includes(c.id) || remote.has(c.id))
})

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
  // an armed sticker owns the wheel: resize it (shift: rotate), never pan/zoom.
  // Browsers turn shift+wheel into horizontal scrolling, so the value lands in
  // deltaX — take whichever axis moved.
  if (store.armedSticker.value) {
    store.adjustArmedSticker(e.deltaY || e.deltaX, e.shiftKey)
    return
  }
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

// select tool: drag on empty space draws a marquee (canvas px); hand tool and
// middle-click pan
const marquee = ref<{ x: number, y: number, w: number, h: number } | null>(null)
const panning = ref(false)

function onCanvasPointerDown(e: PointerEvent) {
  // middle-click drags the canvas around whatever tool is active
  if (e.button === 1) return startPan(e)
  if (e.button !== 0) return
  if (store.tool.value === 'hand') return startPan(e)
  if (!onEmptySpace(e)) return
  if (store.tool.value === 'select') startMarquee(e)
  else if (store.tool.value === 'note') startNoteDraw(e)
}

function startPan(e: PointerEvent) {
  e.preventDefault() // also suppresses the browser's middle-click autoscroll
  panning.value = true
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
    panning.value = false
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
}

function startMarquee(e: PointerEvent) {
  const canvas = e.currentTarget as HTMLElement
  const r = canvas.getBoundingClientRect()
  const sx = e.clientX - r.left
  const sy = e.clientY - r.top
  const additive = e.shiftKey
  let dragged = false
  canvas.setPointerCapture(e.pointerId)
  const onMove = (ev: PointerEvent) => {
    const cx = ev.clientX - r.left
    const cy = ev.clientY - r.top
    if (!dragged && Math.hypot(cx - sx, cy - sy) < 4) return
    dragged = true
    const m = {
      x: Math.min(sx, cx),
      y: Math.min(sy, cy),
      w: Math.abs(cx - sx),
      h: Math.abs(cy - sy),
    }
    marquee.value = m
    // peers see the rectangle too, in content coordinates
    store.setMarquee(
      props.column.id,
      (m.x - view.x) / view.zoom,
      (m.y - view.y) / view.zoom,
      m.w / view.zoom,
      m.h / view.zoom,
    )
  }
  const onUp = () => {
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    const m = marquee.value
    if (dragged && m) {
      // screen-space intersection against the rendered notes
      const left = r.left + m.x
      const top = r.top + m.y
      const hits: string[] = []
      canvas.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => {
        const b = el.getBoundingClientRect()
        if (b.left < left + m.w && b.right > left && b.top < top + m.h && b.bottom > top) {
          hits.push(el.dataset.cardId!)
        }
      })
      store.setSelection(additive ? [...store.selectedCardIds.value, ...hits] : hits)
    } else if (!additive) {
      store.clearSelection() // plain click on empty space
    }
    marquee.value = null
    store.setMarquee(null)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
}

// note tool: drag draws the new card's rectangle (canvas px, like the marquee);
// a plain click places a default-size card
const noteDraw = ref<{ x: number, y: number, w: number, h: number } | null>(null)

function startNoteDraw(e: PointerEvent) {
  const canvas = e.currentTarget as HTMLElement
  const r = canvas.getBoundingClientRect()
  const sx = e.clientX - r.left
  const sy = e.clientY - r.top
  let dragged = false
  canvas.setPointerCapture(e.pointerId)
  const onMove = (ev: PointerEvent) => {
    const cx = ev.clientX - r.left
    const cy = ev.clientY - r.top
    if (!dragged && Math.hypot(cx - sx, cy - sy) < 4) return
    dragged = true
    noteDraw.value = {
      x: Math.min(sx, cx),
      y: Math.min(sy, cy),
      w: Math.abs(cx - sx),
      h: Math.abs(cy - sy),
    }
  }
  const onUp = (ev: PointerEvent) => {
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    const m = noteDraw.value
    noteDraw.value = null
    if (ev.type !== 'pointerup') return // cancelled — keep the tool, place nothing
    if (dragged && m) {
      // rectangle -> content units; addCard clamps the size to the shared
      // bounds, the 90 floor keeps a tiny scribble tall enough to type in
      store.addCard(
        props.column.id,
        (m.x - view.x) / view.zoom,
        (m.y - view.y) / view.zoom,
        m.w / view.zoom,
        Math.max(90, m.h / view.zoom),
      )
    } else {
      spawnAt(ev) // plain click: default-size card at the pointer
    }
    store.tool.value = 'select' // one-shot, as before
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

/** stamp the armed sticker: onto the card under the cursor, else onto the
 * canvas — centered on the click, and the tool stays armed for the next one */
function stampAt(e: MouseEvent) {
  const armed = store.armedSticker.value
  if (!armed) return
  // stickers are sized by width; the rendered height follows the aspect ratio,
  // so centering needs both halves (the ghost centers the same way)
  const half = armed.size / 2
  const halfH = (armed.size * store.armedAspect.value) / 2
  const cardEl = (e.target as HTMLElement).closest<HTMLElement>('[data-card-id]')
  if (cardEl?.dataset.cardId) {
    // offset from the card's top-left in content px — negative is fine, a
    // sticker may hang off the edge
    const r = cardEl.getBoundingClientRect()
    store.addSticker({
      url: armed.url,
      size: armed.size,
      rot: armed.rot,
      cardId: cardEl.dataset.cardId,
      x: (e.clientX - r.left) / view.zoom - half,
      y: (e.clientY - r.top) / view.zoom - halfH,
    })
    return
  }
  const p = toContent(e, e.currentTarget as HTMLElement)
  store.addSticker({
    url: armed.url,
    size: armed.size,
    rot: armed.rot,
    columnId: props.column.id,
    x: p.x - half,
    y: p.y - halfH,
  })
}

// the sticker tool stamps on click; the note tool draws in pointerdown/up
function onCanvasClick(e: MouseEvent) {
  if (store.tool.value === 'sticker') stampAt(e)
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
      :class="{ panning }"
      title="Double-click to add a card"
      :style="gridStyle"
      @auxclick.prevent
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
        <BoardSticker
          v-for="sticker in store.stickersForColumn(column.id)"
          :key="sticker.id"
          :sticker="sticker"
        />
      </div>
      <div class="edge-hint" />
      <div
        v-if="marquee"
        class="marquee"
        :style="{ left: `${marquee.x}px`, top: `${marquee.y}px`, width: `${marquee.w}px`, height: `${marquee.h}px` }"
      />
      <div
        v-if="noteDraw"
        class="marquee draw"
        :style="{ left: `${noteDraw.x}px`, top: `${noteDraw.y}px`, width: `${noteDraw.w}px`, height: `${noteDraw.h}px` }"
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
