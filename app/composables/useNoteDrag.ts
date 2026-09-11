import type { Ref } from 'vue'
import type { CardItem } from '~/composables/useRoom'

export function useNoteDrag(opts: {
  noteEl: Ref<HTMLElement | null>
  card: () => CardItem
  canDrag?: () => boolean
  /** pointerdown that may become a drag — adjust the selection here */
  onPress?: (e: PointerEvent) => void
  /** pointerup without movement (a plain click) */
  onTap?: (e: PointerEvent) => void
}) {
  const store = useRoomStore()
  const { dragging, dragOverColumn, selectedCardIds } = store

  let startX = 0
  let startY = 0
  let moved = false

  function columnAt(x: number, y: number): HTMLElement | null {
    // dragged notes have pointer-events: none, so this sees what's under them
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
    if (dragging.value?.anchor === opts.card().id) dragging.value = null
    dragOverColumn.value = null
  }

  function onWindowBlur() {
    stopDrag()
  }

  function onPointerDown(e: PointerEvent) {
    if (!(opts.canDrag?.() ?? true) || e.button !== 0 || activePointerId !== null) return
    if ((e.target as HTMLElement).closest('button, input, a')) return
    opts.onPress?.(e)
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
      // a selected anchor drags the whole selection, an unselected one just itself
      const card = opts.card()
      const ids = selectedCardIds.value.has(card.id) ? [...selectedCardIds.value] : [card.id]
      dragging.value = { anchor: card.id, ids, dx: 0, dy: 0 }
    }
    moved = true
    e.preventDefault()
    if (dragging.value) {
      dragging.value.dx = mx
      dragging.value.dy = my
    }
    // highlight only a column the anchor card would move into, not its own
    const overId = columnAt(e.clientX, e.clientY)?.dataset.columnId ?? null
    dragOverColumn.value = overId !== opts.card().columnId ? overId : null
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return
    const drag = dragging.value
    const wasDragging = moved && drag?.anchor === opts.card().id

    // capture rects and per-card targets BEFORE stopDrag: clearing the drag
    // state reverts the translate transforms
    const drops: { id: string, rect: DOMRect, colId: string }[] = []
    if (wasDragging && drag) {
      for (const id of drag.ids) {
        const el = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)
        const current = store.cards.value.find(c => c.id === id)
        if (!el || !current) continue
        const rect = el.getBoundingClientRect() // includes the drag transform
        // each card lands in the column under its own center (falls back to its own)
        const colId = columnAt(rect.left + rect.width / 2, rect.top + rect.height / 2)
          ?.dataset.columnId || current.columnId
        drops.push({ id, rect, colId })
      }
    }
    stopDrag()
    if (!wasDragging) {
      opts.onTap?.(e)
      return
    }

    for (const drop of drops) {
      const canvas = document.querySelector(`[data-column-id="${CSS.escape(drop.colId)}"] .col-canvas`)
      if (!canvas) continue
      // rects are screen px; convert through the TARGET column's view into its
      // content coordinates — the canvas is infinite, so no clamping
      const v = store.columnView(drop.colId)
      const cRect = canvas.getBoundingClientRect()
      const x = (drop.rect.left - cRect.left - v.x) / v.zoom
      const y = (drop.rect.top - cRect.top - v.y) / v.zoom
      store.moveNote(drop.id, drop.colId, x, y)
    }
  }

  onBeforeUnmount(() => {
    stopDrag() // e.g. the card was deleted by another peer mid-drag
  })

  return { onPointerDown }
}
