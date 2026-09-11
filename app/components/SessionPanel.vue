<script setup lang="ts">
const emit = defineEmits<{ close: [], results: [] }>()
const store = useRoomStore()
const { timer, voting, isOwner, votesLeft, votersDone, participants, pastRounds, hideAuthors } = store

const minutes = ref(5)
// seeded from the last round's choice
const votesPerUser = ref(voting.value.votesPerUser || 3)

const progressLabel = computed(() => {
  const total = participants.value.length
  const done = Math.min(votersDone.value, total)
  return total > 0 && done >= total ? 'all voted' : `${done}/${total} voted`
})

function startTimer() {
  if (minutes.value > 0) store.startTimer(Math.round(minutes.value * 60))
}

const panelEl = ref<HTMLElement | null>(null)
// clicks on the island (the toggle, live chips) manage the panel themselves
onClickOutside(panelEl, () => emit('close'), { ignore: ['.island-right'] })
onKeyStroke('Escape', () => emit('close'))
</script>

<template>
  <div ref="panelEl" class="panel session-panel">
    <header class="sp-head">
      <h2>Session</h2>
      <button class="icon-btn" title="Close" @click="emit('close')"><Icon name="lucide:x" /></button>
    </header>

    <section class="sp-section">
      <h3 class="sp-title">Timer</h3>
      <div v-if="timer" class="sp-row">
        <p class="sp-muted">Everyone sees the countdown.</p>
        <button v-if="isOwner" class="btn btn-sm" @click="store.stopTimer()">Stop</button>
      </div>
      <form v-else-if="isOwner" class="sp-row" @submit.prevent="startTimer">
        <div class="chip-group">
          <input v-model.number="minutes" class="group-input" type="number" min="1" max="99" title="Minutes">
          <span class="group-unit">min</span>
        </div>
        <button class="btn btn-sm" type="submit" title="Start a countdown everyone can see">
          <Icon name="lucide:timer" /> Start
        </button>
      </form>
      <p v-else class="sp-muted">No timer running.</p>
    </section>

    <section class="sp-section">
      <h3 class="sp-title">Voting</h3>
      <div v-if="voting.phase === 'voting'" class="sp-row">
        <p class="sp-muted">{{ votesLeft }} of your votes left · {{ progressLabel }}</p>
        <button v-if="isOwner" class="btn btn-sm" @click="store.endVoting()">End voting</button>
      </div>
      <form
        v-else-if="isOwner && voting.phase === 'idle'"
        class="sp-row"
        @submit.prevent="store.startVoting(votesPerUser)"
      >
        <div class="chip-group">
          <input v-model.number="votesPerUser" class="group-input" type="number" min="1" max="99" title="Votes per person">
          <span class="group-unit">votes</span>
        </div>
        <button class="btn btn-sm" type="submit" title="Everyone gets this many votes to spend on cards">
          <Icon name="lucide:vote" /> Start voting
        </button>
      </form>
      <div v-else-if="isOwner && voting.phase === 'results'" class="sp-row">
        <button class="btn btn-sm" @click="emit('results')"><Icon name="lucide:trophy" /> Results</button>
        <button class="btn btn-sm" title="Clear the badges — past results stay available" @click="store.resetVoting()">Done</button>
      </div>
      <p v-else class="sp-muted">No voting round running.</p>
      <button v-if="pastRounds.length" class="sp-link" @click="emit('results')">
        <Icon name="lucide:trophy" /> Past rounds
      </button>
    </section>

    <section v-if="isOwner" class="sp-section">
      <h3 class="sp-title">Authors</h3>
      <div class="sp-row">
        <p class="sp-muted">{{ hideAuthors ? 'Names are hidden on cards.' : 'Names are shown on cards.' }}</p>
        <button class="btn btn-sm" @click="store.toggleAuthors()">
          <Icon :name="hideAuthors ? 'lucide:eye' : 'lucide:eye-off'" />
          {{ hideAuthors ? 'Show' : 'Hide' }}
        </button>
      </div>
    </section>
  </div>
</template>
