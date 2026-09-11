<script setup lang="ts">
const store = useRoomStore()
const { isOwner } = store

const open = ref(false)
const menuEl = ref<HTMLElement | null>(null)
onClickOutside(menuEl, () => { open.value = false })
onKeyStroke('Escape', () => { open.value = false })

// board import (host-only; transfer.ts guards it too)
const importInput = ref<HTMLInputElement | null>(null)
async function onImportPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // so picking the same file again re-triggers change
  open.value = false
  if (!file) return
  const error = await store.importBoard(file)
  if (error) window.alert(error)
}

function exportBoard() {
  store.exportBoard()
  open.value = false
}
</script>

<template>
  <div ref="menuEl" class="room-menu">
    <button class="brand-btn" :class="{ active: open }" title="Menu" @click="open = !open">
      <span class="brand">☕</span>
      <Icon name="lucide:chevron-down" />
    </button>
    <div v-if="open" class="panel menu-pop">
      <NuxtLink to="/" class="menu-item"><Icon name="lucide:arrow-left" /> Back to start</NuxtLink>
      <div class="menu-sep" />
      <button class="menu-item" title="Download this board as a JSON file" @click="exportBoard">
        <Icon name="lucide:download" /> Export board
      </button>
      <button
        v-if="isOwner"
        class="menu-item"
        title="Import a board file — replaces this board for everyone"
        @click="importInput?.click()"
      >
        <Icon name="lucide:upload" /> Import board…
      </button>
      <input ref="importInput" type="file" accept=".json,application/json" hidden @change="onImportPicked">
    </div>
  </div>
</template>
