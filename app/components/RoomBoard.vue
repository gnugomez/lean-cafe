<script setup lang="ts">
const props = defineProps<{ code: string, roomName: string }>()

const store = createRoomStore(props.code, props.roomName)
provideRoomStore(store)
onMounted(() => {
  store.connect().catch(err => console.error('[lean-cafe] failed to connect room', err))
})
onBeforeUnmount(() => { store.destroy() })

const { columns, name, isOwner, voting, votesLeft, pastRounds, tool, armedSticker } = store
const sortedColumns = computed(() => [...columns.value].sort((a, b) => a.order - b.order))
const votingLive = computed(() => voting.value.phase === 'voting')

// the armed sticker rides the cursor until it's stamped (client coords: the
// ghost is position: fixed)
const { x: mouseX, y: mouseY } = useMouse({ type: 'client' })
// fallback for wheels outside a column canvas — BoardColumn handles its own and
// marks them handled, so this never fights the canvas pan/zoom
// stamping centers the sticker on the click, which needs its aspect ratio
function onGhostLoad(e: Event) {
  const img = e.target as HTMLImageElement
  store.armedAspect.value = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1
}

function onBoardWheel(e: WheelEvent) {
  if (e.defaultPrevented || !armedSticker.value) return
  e.preventDefault()
  // shift+wheel arrives on the horizontal axis (browsers remap it)
  store.adjustArmedSticker(e.deltaY || e.deltaX, e.shiftKey)
}

const panelOpen = ref(false)
const showResults = ref(false)
// when the host ends a round, the results open on every peer's screen —
// only on the live voting→results transition, so loading a doc that was
// already in the results phase (reconnect, refresh) doesn't pop them open
watch(() => voting.value.phase, (phase, oldPhase) => {
  if (phase === 'results' && oldPhase === 'voting') showResults.value = true
})
// the session panel and the results popover share the top-right corner:
// the panel wins, and results come back when it closes
const resultsSuspended = ref(false)
watch(panelOpen, (open) => {
  if (open && showResults.value) {
    showResults.value = false
    resultsSuspended.value = true
  } else if (!open && resultsSuspended.value) {
    showResults.value = true
    resultsSuspended.value = false
  }
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
      class="board"
      :class="{
        'note-mode': tool === 'note',
        'hand-mode': tool === 'hand',
        'select-mode': tool === 'select',
        'sticker-mode': tool === 'sticker',
      }"
      @wheel="onBoardWheel"
    >
      <BoardColumn v-for="col in sortedColumns" :key="col.id" :column="col" />
      <AddColumn v-if="isOwner" />
    </main>

    <img
      v-if="armedSticker"
      class="sticker-ghost"
      :src="armedSticker.url"
      alt=""
      draggable="false"
      :style="{
        left: `${mouseX}px`,
        top: `${mouseY}px`,
        width: `${armedSticker.size}px`,
        transform: `translate(-50%, -50%) rotate(${armedSticker.rot}deg)`,
      }"
      @load="onGhostLoad"
    >

    <BoardToolbar />

    <div class="island island-left">
      <RoomMenu />
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
