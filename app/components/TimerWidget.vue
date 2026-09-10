<script setup lang="ts">
const store = useRoomStore()
const { timer, isOwner } = store

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

const minutes = ref(5)
function start() {
  const m = Number(minutes.value)
  if (m > 0) store.startTimer(Math.round(m * 60))
}
</script>

<template>
  <div class="timer">
    <template v-if="timer">
      <span class="chip timer-pill" :class="{ done: expired }">
        <Icon name="lucide:timer" /> {{ expired ? 'Time\'s up!' : display }}
        <i v-if="!expired" class="timer-bar" :style="{ width: `${progress * 100}%` }" />
      </span>
      <button v-if="isOwner" class="icon-btn" title="Stop timer" @click="store.stopTimer()"><Icon name="lucide:x" /></button>
    </template>
    <form v-else-if="isOwner" class="chip-group" @submit.prevent="start">
      <input
        v-model.number="minutes"
        class="group-input"
        type="number"
        min="1"
        max="99"
        title="Minutes"
      >
      <span class="group-unit">min</span>
      <button class="group-btn" type="submit" title="Start a countdown everyone can see"><Icon name="lucide:timer" /> Start</button>
    </form>
  </div>
</template>
