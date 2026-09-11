import type { Ref } from 'vue'
import type { CardItem } from '~/composables/useRoom'

export function useNoteDrag(opts: {
  noteEl: Ref<HTMLElement | null>
  card: () => CardItem
  canDrag?: () => boolean
}) {
  const store = useRoomStore()
  const { draggingCardId, dragOverColumn } = store

  const dragging = ref(false)
  const dx = ref(0)
  const dy = ref(0)
  let startX = 0
  let startY = 0
  let moved = false

  function columnAt(x: number, y: number): HTMLElement | null {
    // the dragged note has pointer-events: none, so this sees what's under it
    return (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-column-id]') ?? null
  }

  // Drag listeners live on window, NOT on the note: the dragging note goes
  // pointer-events: none (for hit-testing), and some browsers then silently drop
  // pointer capture — element-level listeners would miss pointerup and leave the
  // note stuck in drag state.
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
    if (draggingCardId.value === opts.card().id) draggingCardId.value = null
    dragOverColumn.value = null
  }

  function onWindowBlur() {
    stopDrag()
  }

  function onPointerDown(e: PointerEvent) {
    if (!(opts.canDrag?.() ?? true) || e.button !== 0 || activePointerId !== null) return
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
        opts.noteEl.value?.setPointerCapture(e.pointerId)
      } catch { /* fine without */ }
    }
    moved = true
    e.preventDefault()
    if (!dragging.value) {
      dragging.value = true
      draggingCardId.value = opts.card().id
    }
    // pointer deltas are screen px; the note translates inside its column's zoomed canvas
    const z = store.columnView(opts.card().columnId).zoom
    dx.value = mx / z
    dy.value = my / z
    // highlight only a column the card would move into, not its own
    const overId = columnAt(e.clientX, e.clientY)?.dataset.columnId ?? null
    dragOverColumn.value = overId !== opts.card().columnId ? overId : null
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return
    const el = opts.noteEl.value
    const wasDragging = dragging.value && moved
    const targetCol = wasDragging ? columnAt(e.clientX, e.clientY) : null
    const noteRect = el?.getBoundingClientRect() // includes the drag transform
    stopDrag()
    if (!wasDragging || !el || !noteRect) return

    const card = opts.card()
    const colId = targetCol?.dataset.columnId || card.columnId
    const canvas = (targetCol || el.closest('[data-column-id]'))?.querySelector('.col-canvas')
    if (!canvas) return
    // rects are screen px; convert through the TARGET column's view into its
    // content coordinates — the canvas is infinite, so no clamping
    const v = store.columnView(colId)
    const cRect = canvas.getBoundingClientRect()
    const x = (noteRect.left - cRect.left - v.x) / v.zoom
    const y = (noteRect.top - cRect.top - v.y) / v.zoom
    store.moveNote(card.id, colId, x, y)
  }

  onBeforeUnmount(() => {
    stopDrag() // e.g. the card was deleted by another peer mid-drag
  })

  return { dragging, dx, dy, onPointerDown }
}
