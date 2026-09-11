<script setup lang="ts">
const emit = defineEmits<{ rename: [] }>()
const store = useRoomStore()
const { participants } = store
const shown = computed(() => participants.value.slice(0, 6))
const extra = computed(() => participants.value.length - shown.value.length)
</script>

<template>
  <div class="avatars">
    <component
      :is="p.isSelf ? 'button' : 'span'"
      v-for="p in shown"
      :key="p.id"
      class="avatar"
      :class="{ host: p.isOwner, self: p.isSelf }"
      :style="{ background: p.color }"
      :title="p.name + (p.isOwner ? ' (host)' : '') + (p.isSelf ? ' — you · click to rename' : '')"
      @click="p.isSelf && emit('rename')"
    >
      {{ initialsOf(p.name) }}
    </component>
    <span v-if="extra > 0" class="avatar more" :title="`${extra} more`">+{{ extra }}</span>
  </div>
</template>
