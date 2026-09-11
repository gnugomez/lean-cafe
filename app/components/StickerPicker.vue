<script setup lang="ts">
import { isAllowedStickerUrl } from '~/composables/room/stickers'

interface Sticker { id: string, url: string, preview: string }

const emit = defineEmits<{ pick: [sticker: Sticker] }>()

const query = ref('')
const items = ref<Sticker[]>([])
const pending = ref(true)
const error = ref('')

// searches race (debounced typing, slow trending): only the newest one lands
let seq = 0
async function load() {
  const mine = ++seq
  pending.value = true
  error.value = ''
  try {
    const q = query.value.trim()
    const res = await $fetch<Sticker[]>('/api/stickers', { query: q ? { q } : undefined })
    if (mine !== seq) return
    // only offer what the doc would accept — anything else can't be stamped
    items.value = res.filter(s => isAllowedStickerUrl(s.url))
  } catch (err: any) {
    if (mine !== seq) return
    items.value = []
    // the endpoint explains itself (missing key, GIPHY unreachable)
    error.value = err?.data?.message || err?.data?.statusMessage || 'Sticker search is unavailable.'
  } finally {
    if (mine === seq) pending.value = false
  }
}
watchDebounced(query, load, { debounce: 300 })
onMounted(load)
</script>

<template>
  <div class="panel sticker-pop">
    <input
      v-model="query"
      class="input sticker-search"
      type="search"
      placeholder="Search stickers…"
      maxlength="100"
      autofocus
    >
    <p v-if="error" class="sticker-note">{{ error }}</p>
    <p v-else-if="pending" class="sticker-note">Loading…</p>
    <p v-else-if="!items.length" class="sticker-note">
      {{ query.trim() ? `No stickers for “${query.trim()}”.` : 'No stickers right now.' }}
    </p>
    <div v-else class="sticker-grid">
      <button
        v-for="s in items"
        :key="s.id"
        class="sticker-cell"
        title="Pick this sticker"
        @click="emit('pick', s)"
      ><img :src="s.preview" alt="" loading="lazy" draggable="false"></button>
    </div>
    <p class="sticker-hint">Wheel resizes, shift+wheel rotates. Click the board or a card to stamp.</p>
  </div>
</template>
