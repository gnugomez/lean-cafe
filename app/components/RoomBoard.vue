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

// invite: show the link selected in an input — clipboard access can be
// blocked, so the visible selection is the affordance; copy is best-effort
const inviteOpen = ref(false)
const inviteInput = ref<HTMLInputElement | null>(null)
// the room route is client-only, so location is available
const inviteLink = computed(() => `${location.origin}/room/${props.code}`)
function openInvite() {
  inviteOpen.value = true
  navigator.clipboard?.writeText(inviteLink.value).catch(() => {})
  nextTick(() => {
    inviteInput.value?.focus()
    inviteInput.value?.select()
  })
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
      <RoomMenu />
      <span class="room-code" title="Room code">{{ code }}</span>
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
      <ParticipantChips @rename="showNameEdit = true" />
      <button
        class="icon-btn"
        :class="{ active: panelOpen }"
        title="Timer, voting & authors"
        @click="panelOpen = !panelOpen"
      ><Icon name="lucide:sliders-horizontal" /></button>
      <input
        v-if="inviteOpen"
        ref="inviteInput"
        class="input invite-input"
        readonly
        :value="inviteLink"
        @blur="inviteOpen = false"
        @keydown.esc="inviteOpen = false"
      >
      <button v-else class="btn btn-primary btn-sm" @click="openInvite">Invite</button>
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
