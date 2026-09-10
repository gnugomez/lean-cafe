<script setup lang="ts">
const store = useRoomStore()
const { pointers, hideAuthors } = store

// neutral cursors while authors are hidden, so colors can't be matched to author dots
function cursorColor(id: string) {
  return hideAuthors.value ? '#9a9aa4' : colorFor(id)
}
</script>

<template>
  <div
    v-for="p in pointers"
    :key="p.id"
    class="remote-cursor"
    :style="{ left: `${p.x}px`, top: `${p.y}px` }"
  >
    <Icon name="lucide:mouse-pointer-2" :style="{ color: cursorColor(p.id) }" />
    <span class="cursor-name" :style="{ background: cursorColor(p.id) }">
      <!-- while authors are hidden, the real name never reaches the DOM -->
      <span v-if="hideAuthors" class="author-hidden">{{ fakeNameFor(p.id, p.name.length) }}</span>
      <template v-else>{{ p.name }}</template>
    </span>
  </div>
</template>
