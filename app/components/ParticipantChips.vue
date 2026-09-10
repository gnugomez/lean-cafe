<script setup lang="ts">
const store = useRoomStore()
const { participants } = store
const shown = computed(() => participants.value.slice(0, 6))
const extra = computed(() => participants.value.length - shown.value.length)
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
