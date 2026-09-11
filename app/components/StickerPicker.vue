<script setup lang="ts">
import { isAllowedStickerUrl } from '~/composables/room/stickers'

interface Sticker { id: string, url: string, preview: string }

const emit = defineEmits<{ pick: [sticker: Sticker] }>()

const PAGE = 24

const query = ref('')
const items = ref<Sticker[]>([])
const pending = ref(true) // first page of a query: the grid shows skeletons
const loadingMore = ref(false)
const hasMore = ref(false)
const error = ref('')

// fade the grid edges only where there is more to scroll to
const gridEl = ref<HTMLElement | null>(null)
const { arrivedState } = useScroll(gridEl)

// searches race (debounced typing, slow trending): only the newest one lands
let seq = 0
async function load(more = false) {
  if (more && (!hasMore.value || loadingMore.value || pending.value)) return
  const mine = ++seq
  if (more) loadingMore.value = true
  else pending.value = true
  error.value = ''
  try {
    const q = query.value.trim()
    const offset = more ? items.value.length : 0
    const res = await $fetch<{ items: Sticker[], hasMore: boolean }>('/api/stickers', {
      query: { ...(q ? { q } : {}), limit: PAGE, offset },
    })
    if (mine !== seq) return
    // only offer what the doc would accept — anything else can't be stamped
    const fresh = res.items.filter(s => isAllowedStickerUrl(s.url))
    items.value = more ? [...items.value, ...fresh] : fresh
    hasMore.value = res.hasMore
  } catch (err: any) {
    if (mine !== seq) return
    if (!more) items.value = []
    hasMore.value = false
    // the endpoint explains itself (missing key, GIPHY unreachable)
    error.value = err?.data?.message || err?.data?.statusMessage || 'Sticker search is unavailable.'
  } finally {
    if (mine === seq) {
      pending.value = false
      loadingMore.value = false
    }
  }
}

watchDebounced(query, () => load(), { debounce: 300 })
onMounted(() => load())

// infinite scroll: a sentinel after the last row pulls the next page
const sentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting) load(true)
}, { root: gridEl, rootMargin: '150px' })
</script>

<template>
  <div class="panel sticker-pop">
    <div class="sticker-field">
      <input
        v-model="query"
        class="input sticker-search"
        type="search"
        placeholder="Search stickers…"
        maxlength="100"
        autofocus
      >
      <button
        v-if="query"
        class="icon-btn sticker-clear"
        title="Clear search"
        @click="query = ''"
      ><Icon name="lucide:x" /></button>
    </div>
    <!-- fixed height: results swap in place instead of collapsing the popover -->
    <div class="sticker-body" :class="{ 'fade-top': !arrivedState.top, 'fade-bottom': !arrivedState.bottom }">
      <p v-if="error && !items.length" class="sticker-note">{{ error }}</p>
      <div v-else-if="pending" class="sticker-grid">
        <div v-for="n in 12" :key="n" class="sticker-cell skeleton" />
      </div>
      <p v-else-if="!items.length" class="sticker-note">
        {{ query.trim() ? `No stickers for “${query.trim()}”.` : 'No stickers right now.' }}
      </p>
      <div v-else ref="gridEl" class="sticker-grid">
        <button
          v-for="s in items"
          :key="s.id"
          class="sticker-cell"
          title="Pick this sticker"
          @click="emit('pick', s)"
        ><img :src="s.preview" alt="" loading="lazy" draggable="false"></button>
        <template v-if="hasMore">
          <div ref="sentinel" class="sticker-cell skeleton" />
          <div v-for="n in 3" :key="`s${n}`" class="sticker-cell skeleton" />
        </template>
      </div>
    </div>
    <p class="sticker-hint">Wheel resizes, shift+wheel rotates. Click the board or a card to stamp.</p>
  </div>
</template>
