<script setup lang="ts">
import type { StickerItem } from '~/composables/useRoom'

defineProps<{ sticker: StickerItem }>()
const store = useRoomStore()
</script>

<template>
  <!-- inert by default (never blocks dragging or editing); .select-mode on the
       board turns the pointer back on so the remove button can be reached -->
  <div
    class="sticker"
    :style="{
      left: `${sticker.x}px`,
      top: `${sticker.y}px`,
      width: `${sticker.size}px`,
      transform: `rotate(${sticker.rot}deg)`,
    }"
  >
    <img class="sticker-img" :src="sticker.url" alt="" draggable="false">
    <button
      class="icon-btn sticker-del"
      title="Remove sticker"
      @pointerdown.stop
      @click.stop="store.removeSticker(sticker.id)"
    ><Icon name="lucide:x" /></button>
  </div>
</template>
