<script setup lang="ts">
import type { SessionPreview } from '~/composables/sessionPreview'
import { THUMB_HEAD } from '~/composables/sessionPreview'

const props = defineProps<{ preview: SessionPreview | null }>()

// Board geometry mirrored from main.css so the thumbnail reads like the real
// thing: the gap between columns and the column's own padding.
const GAP = 14
const PAD = 12
/** crop ratio — keep in sync with .session-thumb's aspect-ratio */
const ASPECT = 2.4
/** a board with no notes still shows this much of its columns */
const MIN_H = 360
/** ...and a sprawling one is cropped rather than shrunk to nothing */
const MAX_H = 1400
const TITLE_SIZE = 24

const board = computed(() => {
  const cols = props.preview?.columns
  if (!cols?.length) return null

  let x = 0
  const columns = cols.map((c) => {
    const laid = {
      id: c.id,
      title: fitTitle(c.title, c.width),
      x,
      width: c.width,
      // notes carry column-canvas coordinates; place them on the board
      notes: c.notes.map(n => ({ ...n, x: x + PAD + n.x, y: THUMB_HEAD + n.y })),
    }
    x += c.width + GAP
    return laid
  })

  // columns run the full height of the board; the notes decide how much of it
  // is worth showing
  let top = 0
  let bottom = MIN_H
  for (const col of columns) {
    for (const n of col.notes) {
      top = Math.min(top, n.y - PAD)
      bottom = Math.max(bottom, n.y + n.h + PAD)
    }
  }
  bottom = Math.min(bottom, top + MAX_H)

  // fit the board to the thumbnail's ratio: pad a narrow board with paper on
  // both sides, crop a tall one — its columns just carry on below the frame
  let left = -GAP / 2
  let width = x - GAP + GAP // half a gap of paper either side
  let height = bottom - top
  if (width / height < ASPECT) {
    const wide = height * ASPECT
    left -= (wide - width) / 2
    width = wide
  } else {
    height = width / ASPECT
  }

  return { columns, top, height, viewBox: `${left} ${top} ${width} ${height}` }
})

/** titles are drawn at a fixed size in board units, so cut them to the column */
function fitTitle(title: string, width: number) {
  const max = Math.max(3, Math.floor((width - PAD * 2) / (TITLE_SIZE * 0.56)))
  return title.length > max ? `${title.slice(0, max - 1)}…` : title
}
</script>

<template>
  <svg
    v-if="board"
    class="session-thumb"
    :viewBox="board.viewBox"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    <g v-for="col in board.columns" :key="col.id">
      <rect class="thumb-col" :x="col.x" y="0" :width="col.width" :height="board.top + board.height" rx="10" />
      <text class="thumb-col-title" :x="col.x + PAD" :y="TITLE_SIZE + 4" :font-size="TITLE_SIZE">{{ col.title }}</text>
      <rect
        class="thumb-canvas"
        :x="col.x + PAD"
        :y="THUMB_HEAD"
        :width="col.width - PAD * 2"
        :height="Math.max(0, board.top + board.height - THUMB_HEAD)"
        rx="8"
      />
      <g v-for="(n, i) in col.notes" :key="i">
        <rect class="thumb-note" :x="n.x" :y="n.y" :width="n.w" :height="n.h" rx="7" />
        <rect
          v-for="line in n.lines"
          :key="line"
          class="thumb-line"
          :x="n.x + 12"
          :y="n.y + 14 + (line - 1) * 21"
          :width="(n.w - 24) * (line === n.lines ? 0.6 : 1)"
          height="8"
          rx="4"
        />
        <circle class="thumb-dot" :cx="n.x + 16" :cy="n.y + n.h - 15" r="6" :fill="n.color" />
      </g>
    </g>
  </svg>
  <div v-else class="session-thumb thumb-empty">
    <span v-if="preview && !preview.cached">No copy in this browser</span>
    <span v-else-if="preview">Empty board</span>
  </div>
</template>
