<script setup lang="ts">
const store = useRoomStore()
const { participants } = store
// you are shown separately (the rename button on the island)
const others = computed(() => participants.value.filter(p => !p.isSelf))
const shown = computed(() => others.value.slice(0, 6))
const extra = computed(() => others.value.length - shown.value.length)
</script>

<template>
  <div class="avatars">
    <span
      v-for="p in shown"
      :key="p.id"
      class="avatar"
      :class="{ host: p.isOwner }"
      :style="{ background: p.color }"
      :title="p.name + (p.isOwner ? ' (host)' : '') + (p.isSelf ? ' — you' : '')"
    >
      {{ initialsOf(p.name) }}
    </span>
    <span v-if="extra > 0" class="avatar more" :title="`${extra} more`">+{{ extra }}</span>
  </div>
</template>
