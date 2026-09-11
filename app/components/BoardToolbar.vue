<script setup lang="ts">
const store = useRoomStore()
const { tool } = store

// Esc hands back to the select tool and drops any card selection
onKeyStroke('Escape', () => {
  if (tool.value !== 'select') tool.value = 'select'
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
</script>

<template>
  <div class="island tools-island">
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
      title="Add a card: click a column to place it — N"
      @click="tool = tool === 'note' ? 'select' : 'note'"
    ><Icon name="lucide:sticky-note" /></button>
  </div>
</template>
