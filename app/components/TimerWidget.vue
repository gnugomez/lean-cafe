<script setup lang="ts">
const emit = defineEmits<{ open: [] }>()
const store = useRoomStore()
const { timer } = store

const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null
watch(timer, (t) => {
  if (t && !tick) {
    tick = setInterval(() => { now.value = Date.now() }, 250)
  } else if (!t && tick) {
    clearInterval(tick)
    tick = null
  }
}, { immediate: true })
onBeforeUnmount(() => { if (tick) clearInterval(tick) })

const remaining = computed(() =>
  timer.value ? Math.max(0, Math.ceil((timer.value.endsAt - now.value) / 1000)) : 0)
const display = computed(() => {
  const m = Math.floor(remaining.value / 60)
  const s = remaining.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})
const progress = computed(() =>
  timer.value ? Math.max(0, Math.min(1, remaining.value / timer.value.total)) : 0)
const expired = computed(() => !!timer.value && remaining.value <= 0)
</script>

<template>
  <button
    v-if="timer"
    class="chip timer-pill"
    :class="{ done: expired }"
    title="Session timer"
    @click="emit('open')"
  >
    <Icon name="lucide:timer" /> {{ expired ? 'Time\'s up!' : display }}
    <i v-if="!expired" class="timer-bar" :style="{ width: `${progress * 100}%` }" />
  </button>
</template>
