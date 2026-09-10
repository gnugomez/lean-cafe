<script setup lang="ts">
import type { RoundResult } from '~/composables/useRoom'

const emit = defineEmits<{ close: [] }>()
const store = useRoomStore()
const { pastRounds, isOwner, viewRoundId, localViewRound } = store

// stays open while people work the board; closes via the × button or Escape
useEventListener(document, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
})

// null local override = following the host's choice
const following = computed(() => localViewRound.value === null)

function toggleView(roundId: string) {
  const active = viewRoundId.value === roundId
  if (isOwner.value) {
    store.setSharedView(active ? null : roundId)
  } else {
    store.setLocalView(active ? 'none' : roundId)
  }
}

function removeRound(r: RoundResult) {
  if (window.confirm(`Delete the results of round ${r.number} for everyone?`)) {
    store.deleteRound(r.round)
  }
}
</script>

<template>
  <div class="panel results-pop">
    <header class="pop-head">
      <h2><Icon name="lucide:trophy" /> Voting results</h2>
      <button class="icon-btn" title="Close" @click="emit('close')"><Icon name="lucide:x" /></button>
    </header>
    <p v-if="!pastRounds.length" class="dialog-sub">No voting rounds yet.</p>
    <div v-else class="rounds">
      <section v-for="r in pastRounds" :key="r.round" class="round">
        <div class="round-head">
          <h3>
            Round {{ r.number }}
            <span class="round-meta">· {{ r.votesPerUser }} vote{{ r.votesPerUser === 1 ? '' : 's' }} per person</span>
          </h3>
          <span class="round-actions">
            <button
              class="icon-btn"
              :class="{ active: viewRoundId === r.round }"
              :title="viewRoundId === r.round
                ? (isOwner ? 'Stop showing these votes on the cards (default for everyone)' : 'Hide these votes from your cards')
                : (isOwner ? 'Show these votes on the cards (default for everyone)' : 'Show these votes on your cards')"
              @click="toggleView(r.round)"
            ><Icon :name="viewRoundId === r.round ? 'lucide:eye' : 'lucide:eye-off'" /></button>
            <button
              v-if="isOwner"
              class="icon-btn"
              title="Delete this round's results for everyone"
              @click="removeRound(r)"
            ><Icon name="lucide:trash-2" /></button>
          </span>
        </div>
        <ol v-if="r.results.length">
          <li v-for="entry in r.results" :key="entry.cardId">
            <span class="res-votes"><Icon name="lucide:arrow-big-up" /> {{ entry.votes }}</span>
            <span class="res-text">{{ entry.text }}</span>
          </li>
        </ol>
        <p v-else class="round-empty">No votes were cast this round.</p>
      </section>
    </div>
    <footer v-if="!isOwner && !following" class="pop-foot">
      <button
        class="btn btn-sm"
        title="Go back to showing whatever the host has selected"
        @click="store.setLocalView(null)"
      >Follow host's view</button>
    </footer>
  </div>
</template>
