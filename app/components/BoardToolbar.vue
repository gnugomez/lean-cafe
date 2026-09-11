<script setup lang="ts">
const store = useRoomStore()
const { tool } = store

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
      title="Pan a column (drag) — scroll to zoom it"
      @click="tool = 'hand'"
    ><Icon name="lucide:hand" /></button>
    <span class="island-sep" />
    <button
      class="tool-btn"
      :class="{ active: tool === 'note' }"
      title="Add a card — click a column to place it"
      @click="tool = tool === 'note' ? 'select' : 'note'"
    ><Icon name="lucide:sticky-note" /></button>
  </div>
</template>
