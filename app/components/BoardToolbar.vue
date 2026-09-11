<script setup lang="ts">
const store = useRoomStore()
const { tool, armedSticker } = store

const pickerOpen = ref(false)
const island = ref<HTMLElement | null>(null)
// the dock button toggles the picker itself, so ignore clicks inside the island
onClickOutside(island, () => { pickerOpen.value = false })
watch(tool, (t) => { if (t !== 'sticker') pickerOpen.value = false })

function toggleStickers() {
  if (tool.value === 'sticker') {
    pickerOpen.value = !pickerOpen.value
    return
  }
  tool.value = 'sticker'
  pickerOpen.value = true
}

function pickSticker(s: { url: string }) {
  armedSticker.value = { url: s.url, size: 96, rot: 0 }
  pickerOpen.value = false
}

// Esc: put the loaded sticker down first, then the tool, then the selection
onKeyStroke('Escape', () => {
  if (armedSticker.value || pickerOpen.value) {
    armedSticker.value = null
    pickerOpen.value = false
    tool.value = 'select'
  } else if (tool.value !== 'select') tool.value = 'select'
  else store.clearSelection()
})

// the usual canvas-tool shortcuts — never while typing or with modifiers held
function shortcut(e: KeyboardEvent, t: typeof tool.value) {
  const el = e.target as HTMLElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  tool.value = t
}
onKeyStroke(['v', 'V'], e => shortcut(e, 'select'))
onKeyStroke(['h', 'H'], e => shortcut(e, 'hand'))
onKeyStroke(['n', 'N', 's', 'S'], e => shortcut(e, 'note'))
onKeyStroke(['e', 'E'], (e) => {
  const before = tool.value
  shortcut(e, 'sticker')
  if (tool.value === 'sticker' && before !== 'sticker') pickerOpen.value = true
})
</script>

<template>
  <div ref="island" class="island tools-island">
    <StickerPicker v-if="pickerOpen" @pick="pickSticker" />
    <button
      class="tool-btn"
      :class="{ active: tool === 'select' }"
      title="Select — V"
      @click="tool = 'select'"
    ><Icon name="lucide:mouse-pointer-2" /></button>
    <button
      class="tool-btn"
      :class="{ active: tool === 'hand' }"
      title="Pan a column (drag), scroll to zoom — H"
      @click="tool = 'hand'"
    ><Icon name="lucide:hand" /></button>
    <span class="island-sep" />
    <button
      class="tool-btn"
      :class="{ active: tool === 'note' }"
      title="Add a card: click a column to place it, drag to draw its size — N"
      @click="tool = tool === 'note' ? 'select' : 'note'"
    ><Icon name="lucide:sticky-note" /></button>
    <button
      class="tool-btn"
      :class="{ active: tool === 'sticker' }"
      title="Stick a sticker on a card or the board — E"
      @click="toggleStickers"
    ><Icon name="lucide:sticker" /></button>
  </div>
</template>
