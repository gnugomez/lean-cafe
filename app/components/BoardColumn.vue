<script setup lang="ts">
import type { ColumnItem } from '~/composables/useRoom'

const props = defineProps<{ column: ColumnItem }>()
const store = useRoomStore()
const { draggingCardId, dragOverColumn, isOwner } = store

const displayCards = computed(() => store.cardsForColumn(props.column.id))

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

// scroll-overflow hints: fade gradients while there is more content above/below
const listEl = ref<HTMLElement | null>(null)
const { arrivedState, measure } = useScroll(listEl, { offset: { top: 4, bottom: 4 } })
const overflowing = ref(false)
function checkOverflow() {
  const el = listEl.value
  overflowing.value = !!el && el.scrollHeight > el.clientHeight + 1
  measure()
}
useResizeObserver(listEl, checkOverflow)
watch(displayCards, () => nextTick(checkOverflow))
onMounted(checkOverflow)
const showTopFade = computed(() => overflowing.value && !arrivedState.top)
const showBottomFade = computed(() => overflowing.value && !arrivedState.bottom)

// drag & drop
const dropIndex = ref(0)
const isTarget = computed(() => dragOverColumn.value === props.column.id && !!draggingCardId.value)

// grid-aware: a card comes before the pointer if the pointer is above its row,
// or on the same row but left of its midpoint
function computeIndex(x: number, y: number): number {
  const els = listEl.value ? [...listEl.value.querySelectorAll<HTMLElement>('[data-card-id]')] : []
  for (let i = 0; i < els.length; i++) {
    const r = els[i]!.getBoundingClientRect()
    if (y < r.top) return i
    if (y <= r.bottom && x < r.left + r.width / 2) return i
  }
  return els.length
}
function onDragOver(e: DragEvent) {
  if (!draggingCardId.value) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverColumn.value = props.column.id
  dropIndex.value = computeIndex(e.clientX, e.clientY)
}
function onDragLeave(e: DragEvent) {
  const el = e.currentTarget as HTMLElement
  if (e.relatedTarget && el.contains(e.relatedTarget as Node)) return
  if (dragOverColumn.value === props.column.id) dragOverColumn.value = null
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  const cardId = draggingCardId.value || e.dataTransfer?.getData('text/plain')
  dragOverColumn.value = null
  if (!cardId) return
  const list = displayCards.value
  let before = list[dropIndex.value]?.id ?? null
  if (before === cardId) before = list[dropIndex.value + 1]?.id ?? null
  store.moveCard(cardId, props.column.id, before)
  draggingCardId.value = null
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
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
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

    <div class="col-scroll">
      <div ref="listEl" class="col-cards">
        <template v-for="(card, i) in displayCards" :key="card.id">
          <div v-if="isTarget && dropIndex === i" class="drop-line" />
          <BoardCard :card="card" />
        </template>
        <div v-if="isTarget && dropIndex === displayCards.length" class="drop-line" />
      </div>
      <div class="col-fade top" :class="{ visible: showTopFade }" />
      <div class="col-fade bottom" :class="{ visible: showBottomFade }" />
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
