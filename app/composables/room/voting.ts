import type * as Y from 'yjs'
import type { ComputedRef, Ref } from 'vue'
import type { CardItem, RoundResult, VotingState } from './types'

export function createRoomVoting(opts: {
  code: string
  doc: Y.Doc
  metaMap: Y.Map<any>
  votesMap: Y.Map<Record<string, number>>
  historyMap: Y.Map<RoundResult>
  cards: Ref<CardItem[]>
  votes: Ref<Record<string, Record<string, number>>>
  history: Ref<Record<string, RoundResult>>
  voting: Ref<VotingState>
  sharedViewRound: Ref<string | null>
  isOwner: ComputedRef<boolean>
}) {
  const { code, doc, metaMap, votesMap, historyMap, cards, votes, history, voting, sharedViewRound, isOwner } = opts

  const voteTotals = computed<Record<string, number>>(() => {
    const existing = new Set(cards.value.map(c => c.id))
    const totals: Record<string, number> = {}
    for (const perUser of Object.values(votes.value)) {
      for (const [cardId, n] of Object.entries(perUser)) {
        if (existing.has(cardId)) totals[cardId] = (totals[cardId] || 0) + n
      }
    }
    return totals
  })

  // Anonymous voting: votes are written under a random per-round key stored
  // only in this browser, so the shared doc never links votes to people.
  const voterStorageKey = `leancafe:${code}:voter`
  function voterKeyFor(round: string): string {
    try {
      const stored = JSON.parse(getStored(voterStorageKey) || 'null')
      if (stored && stored.round === round && typeof stored.key === 'string') return stored.key
    } catch { /* regenerate below */ }
    const key = genId(16)
    setStored(voterStorageKey, JSON.stringify({ round, key }))
    return key
  }
  const voterKey = computed(() => {
    const round = voting.value.round
    return round ? voterKeyFor(round) : null
  })

  const myVotes = computed<Record<string, number>>(() =>
    (voterKey.value && votes.value[voterKey.value]) || {})

  const votesLeft = computed(() => {
    const existing = new Set(cards.value.map(c => c.id))
    const used = Object.entries(myVotes.value)
      .reduce((sum, [cardId, n]) => sum + (existing.has(cardId) ? n : 0), 0)
    return Math.max(0, voting.value.votesPerUser - used)
  })

  // How many (anonymous) voters have spent their full budget. Counts keys,
  // not identities — the host sees progress without seeing who voted.
  const votersDone = computed(() => {
    const existing = new Set(cards.value.map(c => c.id))
    let done = 0
    for (const perVoter of Object.values(votes.value)) {
      const used = Object.entries(perVoter)
        .reduce((sum, [cardId, n]) => sum + (existing.has(cardId) ? n : 0), 0)
      if (used >= voting.value.votesPerUser) done++
    }
    return done
  })

  const pastRounds = computed<RoundResult[]>(() =>
    Object.values(history.value).sort((a, b) => b.endedAt - a.endedAt))

  // The host picks a round to show on cards for everyone (meta.displayRound);
  // each person can override locally: a round id, 'none' (hide), or null (follow the host).
  const viewKey = `leancafe:${code}:viewRound`
  const localViewRound = ref<string | null>(getStored(viewKey))

  function setLocalView(v: string | null) {
    localViewRound.value = v
    if (v === null) removeStored(viewKey)
    else setStored(viewKey, v)
  }

  function setSharedView(roundId: string | null) {
    if (!isOwner.value) return
    metaMap.set('displayRound', roundId)
    setLocalView(null) // the host's own view follows what they just set
  }

  function deleteRound(roundId: string) {
    if (!isOwner.value) return
    doc.transact(() => {
      historyMap.delete(roundId)
      if (metaMap.get('displayRound') === roundId) metaMap.set('displayRound', null)
    })
    if (localViewRound.value === roundId) setLocalView(null)
  }

  const viewRoundId = computed(() => {
    const local = localViewRound.value
    if (local === 'none') return null
    const candidate = local && history.value[local] ? local : sharedViewRound.value
    return candidate && history.value[candidate] ? candidate : null
  })

  /** vote counts shown on cards, from the archived round selected above */
  const cardVotes = computed<Record<string, number>>(() => {
    const id = viewRoundId.value
    if (!id) return {}
    const out: Record<string, number> = {}
    for (const entry of history.value[id]?.results || []) out[entry.cardId] = entry.votes
    return out
  })

  function clearVotes() {
    for (const key of [...votesMap.keys()]) votesMap.delete(key)
  }

  function startVoting(votesPerUser: number) {
    const n = Math.round(Number(votesPerUser))
    if (!isOwner.value || !Number.isFinite(n) || n < 1) return
    doc.transact(() => {
      clearVotes()
      metaMap.set('voting', { phase: 'voting', votesPerUser: Math.min(n, 99), round: genId(8) })
    })
  }

  function endVoting() {
    if (!isOwner.value) return
    doc.transact(() => {
      // Notes keep their free positions — the ranking lives in the badges
      // and the results history, not in the layout.
      const totals = voteTotals.value
      // Archive the round so new sessions never erase past results.
      const round = voting.value.round || genId(8)
      if (!historyMap.get(round)) {
        const ranked = cards.value
          .filter(c => (totals[c.id] || 0) > 0)
          .sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0) || a.order - b.order)
          .map(c => ({ cardId: c.id, text: c.text, votes: totals[c.id] || 0 }))
        historyMap.set(round, {
          round,
          number: historyMap.size + 1,
          votesPerUser: voting.value.votesPerUser,
          endedAt: Date.now(),
          results: ranked,
        })
      }
      // by default the just-finished round's votes stay visible on cards
      metaMap.set('displayRound', round)
      metaMap.set('voting', { ...voting.value, phase: 'results' })
    })
  }

  function resetVoting() {
    if (!isOwner.value) return
    doc.transact(() => {
      clearVotes()
      metaMap.set('voting', { phase: 'idle', votesPerUser: voting.value.votesPerUser })
    })
  }

  function adjustVote(cardId: string, delta: 1 | -1) {
    if (voting.value.phase !== 'voting') return
    const key = voterKey.value
    if (!key) return
    const mine = { ...(votesMap.get(key) || {}) }
    const next = (mine[cardId] || 0) + delta
    if (next < 0 || (delta > 0 && votesLeft.value <= 0)) return
    if (next === 0) delete mine[cardId]
    else mine[cardId] = next
    votesMap.set(key, mine)
  }

  return {
    voteTotals,
    myVotes,
    votesLeft,
    votersDone,
    pastRounds,
    localViewRound,
    viewRoundId,
    cardVotes,
    setLocalView,
    setSharedView,
    deleteRound,
    startVoting,
    endVoting,
    resetVoting,
    adjustVote,
  }
}
