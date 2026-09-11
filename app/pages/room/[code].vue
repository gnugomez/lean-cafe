<script setup lang="ts">
const route = useRoute()
const code = normalizeCode(String(route.params.code || ''))
const { data: room, error } = await useFetch<{ code: string, room: string }>(`/api/rooms/${code}`)

useHead({ title: room.value ? `${code} · Lean Café` : 'Lean Café' })

// the landing page lists the rooms this browser has been in
if (room.value) rememberSession(code)

// This route is client-only (ssr: false), so storage is available during setup.
const nameKey = `leancafe:${code}:name`
const needName = ref(!getStored(nameKey))
const suggestedName = getStored('leancafe:lastName') || ''

function onNamed(newName: string) {
  setStored(nameKey, newName)
  setStored('leancafe:lastName', newName)
  needName.value = false
}
</script>

<template>
  <div v-if="error" class="center-screen">
    <div class="panel hero small">
      <div class="hero-logo">☕</div>
      <h1>Room not found</h1>
      <p class="tagline">“{{ code || '???' }}” doesn't look like a valid room code.</p>
      <NuxtLink to="/" class="btn btn-primary">Back to start</NuxtLink>
    </div>
  </div>
  <template v-else-if="room">
    <NameDialog v-if="needName" :initial="suggestedName" @done="onNamed" />
    <RoomBoard v-else :code="room.code" :room-name="room.room" />
  </template>
</template>
