<script setup lang="ts">
const store = useRoomStore()
const { tool, zoom } = store

const pct = computed(() => `${Math.round(zoom.value * 100)}%`)
function setZoom(z: number) {
  zoom.value = Math.min(1.6, Math.max(0.4, Math.round(z * 100) / 100))
}

// Esc always hands back to the select tool
onKeyStroke('Escape', () => { if (tool.value !== 'select') tool.value = 'select' })
</script>

<template>
  <div class="island tools-island">
    <button
      class="tool-btn"
      :class="{ active: tool === 'select' }"
      title="Select"
      @click="tool = 'select'"
    ><Icon name="lucide:mouse-pointer-2" /></button>
    <button
      class="tool-btn"
      :class="{ active: tool === 'hand' }"
      title="Pan the board (drag)"
      @click="tool = 'hand'"
    ><Icon name="lucide:hand" /></button>
    <span class="island-sep" />
    <button
      class="tool-btn"
      :class="{ active: tool === 'note' }"
      title="Add a card — click a column to place it"
      @click="tool = tool === 'note' ? 'select' : 'note'"
    ><Icon name="lucide:sticky-note" /></button>
    <span class="island-sep" />
    <button class="tool-btn" title="Zoom out" @click="setZoom(zoom - 0.1)"><Icon name="lucide:minus" /></button>
    <button class="zoom-label" title="Reset zoom" @click="setZoom(1)">{{ pct }}</button>
    <button class="tool-btn" title="Zoom in" @click="setZoom(zoom + 0.1)"><Icon name="lucide:plus" /></button>
  </div>
</template>
