<script setup lang="ts">
const store = useRoomStore()
const { voting, isOwner, votesLeft, votersDone, participants, pastRounds } = store
// Host picks how many votes each participant gets; remember the last round's choice.
const votesPerUser = ref(voting.value.votesPerUser || 3)
const showResults = ref(false)

// when the host ends a round, the results open on every peer's screen
watch(() => voting.value.phase, (phase, oldPhase) => {
  if (phase === 'results' && oldPhase !== 'results') showResults.value = true
})

const progressLabel = computed(() => {
  const total = participants.value.length
  const done = Math.min(votersDone.value, total)
  return total > 0 && done >= total ? 'all voted' : `${done}/${total} voted`
})
</script>

<template>
  <div class="voting">
    <!-- idle: host can start a round -->
    <form
      v-if="voting.phase === 'idle' && isOwner"
      class="chip-group"
      @submit.prevent="store.startVoting(votesPerUser)"
    >
      <input
        v-model.number="votesPerUser"
        class="group-input"
        type="number"
        min="1"
        max="99"
        title="Votes per person"
      >
      <span class="group-unit">votes</span>
      <button class="group-btn" type="submit" title="Everyone gets this many votes to spend on cards"><Icon name="lucide:vote" /> Vote</button>
    </form>

    <!-- live round -->
    <template v-else-if="voting.phase === 'voting'">
      <div v-if="isOwner" class="chip-group">
        <span class="group-label"><Icon name="lucide:vote" /> {{ votesLeft }} left</span>
        <span class="group-label" title="Voters who have spent all their votes — anonymously counted">{{ progressLabel }}</span>
        <button class="group-btn" @click="store.endVoting()">End voting</button>
      </div>
      <span v-else class="chip voting-live"><Icon name="lucide:vote" /> {{ votesLeft }} vote{{ votesLeft === 1 ? '' : 's' }} left</span>
    </template>

    <!-- round just ended: host wraps it up -->
    <div v-else-if="isOwner" class="chip-group">
      <button class="group-btn" title="See the results of every round" @click="showResults = true"><Icon name="lucide:trophy" /> Results</button>
      <button class="group-btn" title="Clear the badges — past results stay available" @click="store.resetVoting()">Done</button>
    </div>

    <!-- past rounds always reachable by everyone -->
    <button
      v-if="pastRounds.length && !(voting.phase === 'results' && isOwner)"
      class="chip"
      title="See the results of every round"
      @click="showResults = true"
    ><Icon name="lucide:trophy" /> Results</button>

    <ResultsDialog v-if="showResults" @close="showResults = false" />
  </div>
</template>
