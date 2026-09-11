<script setup lang="ts">
const props = defineProps<{ code: string, roomName: string }>()

const store = createRoomStore(props.code, props.roomName)
provideRoomStore(store)
onMounted(() => {
  store.connect().catch(err => console.error('[lean-cafe] failed to connect room', err))
})
onBeforeUnmount(() => { store.destroy() })

const { columns, name, isOwner, voting, votesLeft, pastRounds } = store
const sortedColumns = computed(() => [...columns.value].sort((a, b) => a.order - b.order))
const votingLive = computed(() => voting.value.phase === 'voting')

// live cursors: broadcast in board-content coordinates (scroll-independent)
const boardEl = ref<HTMLElement | null>(null)
function onBoardPointer(e: PointerEvent) {
  const el = boardEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  store.setPointer(e.clientX - r.left + el.scrollLeft, e.clientY - r.top + el.scrollTop)
}

const panelOpen = ref(false)
const showResults = ref(false)
// when the host ends a round, the results open on every peer's screen
watch(() => voting.value.phase, (phase, oldPhase) => {
  if (phase === 'results' && oldPhase !== 'results') showResults.value = true
})

const showNameEdit = ref(false)
const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/room/${props.code}`)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    // clipboard unavailable (insecure context) or write denied — don't claim "Copied!"
  }
}
</script>

<template>
  <div class="room">
    <main
      ref="boardEl"
      class="board"
      @pointermove="onBoardPointer"
      @pointerleave="store.setPointer(null)"
    >
      <RemoteCursors />
      <BoardColumn v-for="col in sortedColumns" :key="col.id" :column="col" />
      <AddColumn v-if="isOwner" />
    </main>

    <div class="island island-left">
      <NuxtLink to="/" class="brand" title="Lean Café">☕</NuxtLink>
      <button class="room-code" :title="copied ? 'Copied!' : 'Copy invite link'" @click="copyLink">
        {{ code }}
      </button>
    </div>

    <div class="island island-right">
      <TimerWidget @open="panelOpen = true" />
      <button
        v-if="votingLive"
        class="chip votes-glance"
        title="Voting is live — spend your votes on the cards"
        @click="panelOpen = true"
      ><Icon name="lucide:vote" /> {{ votesLeft }} left</button>
      <button
        v-else-if="pastRounds.length"
        class="icon-btn"
        title="Round results"
        @click="showResults = true"
      ><Icon name="lucide:trophy" /></button>
      <ParticipantChips />
      <button class="self-btn" title="Change your name" @click="showNameEdit = true">
        <span class="avatar" :class="{ host: isOwner }" :style="{ background: store.colorOf(store.uid) }">
          {{ initialsOf(name || 'Anonymous') }}
        </span>
        <Icon name="lucide:chevron-down" />
      </button>
      <button
        class="icon-btn"
        :class="{ active: panelOpen }"
        title="Timer, voting & board"
        @click="panelOpen = !panelOpen"
      ><Icon name="lucide:sliders-horizontal" /></button>
      <button class="btn btn-primary btn-sm" @click="copyLink">
        {{ copied ? 'Copied!' : 'Invite' }}
      </button>
      <SessionPanel
        v-if="panelOpen"
        @close="panelOpen = false"
        @results="showResults = true; panelOpen = false"
      />
    </div>

    <ResultsDialog v-if="showResults" @close="showResults = false" />

    <NameDialog
      v-if="showNameEdit"
      :initial="name"
      edit
      @done="(n: string) => { store.setName(n); showNameEdit = false }"
      @cancel="showNameEdit = false"
    />
  </div>
</template>
