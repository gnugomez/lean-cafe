<script setup lang="ts">
import type { SessionPreview } from '~/composables/sessionPreview'
import type { StoredSession } from '~/utils/sessions'

/** how many boards show before "Show more" */
const INITIAL = 6

const sessions = ref<StoredSession[]>([])
const previews = ref<Record<string, SessionPreview>>({})
const expanded = ref(false)
const confirming = ref('')

const shown = computed(() => expanded.value ? sessions.value : sessions.value.slice(0, INITIAL))
const hidden = computed(() => sessions.value.length - shown.value.length)

// The list lives in this browser only, and the landing page is server-rendered:
// it appears after mount.
onMounted(() => { sessions.value = listSessions() })

// Previews come from IndexedDB, one board at a time, so the cards fill in as
// they load instead of blocking on the slowest one.
const started = new Set<string>()
watch(shown, async (list) => {
  for (const s of list) {
    if (started.has(s.code)) continue
    started.add(s.code)
    previews.value[s.code] = await loadSessionPreview(s.code)
  }
})

function forget(code: string) {
  forgetSession(code)
  sessions.value = sessions.value.filter(s => s.code !== code)
  confirming.value = ''
}

function whenLabel(s: StoredSession) {
  const at = s.lastOpened || previews.value[s.code]?.lastActivity || 0
  return at ? formatTimeAgo(new Date(at)) : 'a while ago'
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

function statsLabel(p: SessionPreview | undefined) {
  if (!p?.cached) return ''
  const parts = [count(p.noteCount, 'note'), count(p.columns.length, 'column')]
  if (p.rounds) parts.push(count(p.rounds, 'round'))
  return parts.join(' · ')
}
</script>

<template>
  <section v-if="sessions.length" class="recents">
    <ul class="session-grid">
      <li v-for="s in shown" :key="s.code" class="panel session-card">
        <NuxtLink class="session-open" :to="`/room/${s.code}`" :title="`Open room ${s.code}`">
          <SessionThumb :preview="previews[s.code] ?? null" />
        </NuxtLink>
        <div class="session-line">
          <span class="session-code">{{ s.code }}</span>
          <span v-if="s.host" class="session-badge" title="You created this room">Host</span>
          <span class="session-when">{{ whenLabel(s) }}</span>
        </div>
        <div class="session-line">
          <span class="session-stats">{{ statsLabel(previews[s.code]) }}</span>
          <div v-if="previews[s.code]?.people.length" class="avatars">
            <span
              v-for="p in previews[s.code]!.people.slice(0, 4)"
              :key="p.id"
              class="avatar"
              :style="{ background: p.color }"
              :title="p.name"
            >{{ initialsOf(p.name) }}</span>
            <span
              v-if="previews[s.code]!.people.length > 4"
              class="avatar more"
            >+{{ previews[s.code]!.people.length - 4 }}</span>
          </div>
        </div>
        <button class="icon-btn session-forget" title="Forget this board" @click="confirming = s.code">
          <Icon name="lucide:x" />
        </button>
        <div v-if="confirming === s.code" class="session-confirm">
          <p>Delete this browser's copy of <strong>{{ s.code }}</strong>? If nobody else has it, the board is gone.</p>
          <div class="dialog-actions">
            <button class="btn btn-sm" @click="confirming = ''">Cancel</button>
            <button class="btn btn-sm btn-danger" @click="forget(s.code)">Forget</button>
          </div>
        </div>
      </li>
    </ul>
    <button v-if="hidden > 0" class="btn btn-sm" @click="expanded = true">
      Show {{ hidden }} more
    </button>
  </section>
</template>
