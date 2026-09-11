<script setup lang="ts">
const props = defineProps<{ code: string, roomName: string }>()

const store = createRoomStore(props.code, props.roomName)
provideRoomStore(store)
onMounted(() => {
  store.connect().catch(err => console.error('[lean-cafe] failed to connect room', err))
})
onBeforeUnmount(() => { store.destroy() })

const { columns, name, isOwner, voting, votesLeft, pastRounds, tool, zoom } = store
const sortedColumns = computed(() => [...columns.value].sort((a, b) => a.order - b.order))
const votingLive = computed(() => voting.value.phase === 'voting')

// live cursors: broadcast in board-content px (scroll- and zoom-independent),
// measured against the scaled wrapper so every peer agrees on positions
const boardEl = ref<HTMLElement | null>(null)
const scaleEl = ref<HTMLElement | null>(null)
function onBoardPointer(e: PointerEvent) {
  const el = scaleEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  store.setPointer((e.clientX - r.left) / zoom.value, (e.clientY - r.top) / zoom.value)
}

// ctrl/cmd + wheel zooms toward the cursor
function onWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  const el = boardEl.value
  if (!el) return
  const old = zoom.value
  const next = Math.min(1.6, Math.max(0.4, old * Math.exp(-e.deltaY * 0.005)))
  if (next === old) return
  zoom.value = next
  const k = next / old
  const r = el.getBoundingClientRect()
  const cx = e.clientX - r.left
  const cy = e.clientY - r.top
  nextTick(() => {
    el.scrollLeft = (el.scrollLeft + cx) * k - cx
    el.scrollTop = (el.scrollTop + cy) * k - cy
  })
}

// hand tool: drag anywhere to pan the board
function onPanStart(e: PointerEvent) {
  const el = boardEl.value
  if (!el || e.button !== 0) return
  e.preventDefault()
  const startX = e.clientX
  const startY = e.clientY
  const sl = el.scrollLeft
  const st = el.scrollTop
  const overlay = e.currentTarget as HTMLElement
  overlay.setPointerCapture(e.pointerId)
  const onMove = (ev: PointerEvent) => {
    el.scrollLeft = sl - (ev.clientX - startX)
    el.scrollTop = st - (ev.clientY - startY)
  }
  const onUp = () => {
    overlay.removeEventListener('pointermove', onMove)
    overlay.removeEventListener('pointerup', onUp)
    overlay.removeEventListener('pointercancel', onUp)
  }
  overlay.addEventListener('pointermove', onMove)
  overlay.addEventListener('pointerup', onUp)
  overlay.addEventListener('pointercancel', onUp)
}

const panelOpen = ref(false)
const showResults = ref(false)
// when the host ends a round, the results open on every peer's screen
watch(() => voting.value.phase, (phase, oldPhase) => {
  if (phase === 'results' && oldPhase !== 'results') showResults.value = true
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
      ref="boardEl"
      class="board"
      :class="{ 'note-mode': tool === 'note' }"
      @pointermove="onBoardPointer"
      @pointerleave="store.setPointer(null)"
      @wheel="onWheel"
    >
      <div ref="scaleEl" class="board-scale" :style="{ transform: `scale(${zoom})` }">
        <RemoteCursors />
        <BoardColumn v-for="col in sortedColumns" :key="col.id" :column="col" />
        <AddColumn v-if="isOwner" />
      </div>
    </main>
    <div v-if="tool === 'hand'" class="pan-overlay" @pointerdown="onPanStart" />

    <BoardToolbar />

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
