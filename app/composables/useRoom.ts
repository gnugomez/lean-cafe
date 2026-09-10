import * as Y from 'yjs'
import type { InjectionKey } from 'vue'
import type { WebrtcProvider } from 'y-webrtc'
import type { IndexeddbPersistence } from 'y-indexeddb'

export interface ColumnItem {
  id: string
  title: string
  order: number
  width: number
  /** whether a description fragment exists (host creates it lazily) */
  hasDesc: boolean
}

export interface CardItem {
  id: string
  columnId: string
  text: string
  authorId: string
  authorName: string
  order: number
  createdAt: number
  /** free position on the column whiteboard, shared across peers */
  x: number
  y: number
  /** stacking order; bumped when a note is moved */
  z: number
}

export interface ParticipantItem {
  id: string
  name: string
  color: string
  isOwner: boolean
  isSelf: boolean
}

export interface RemotePointer {
  id: string
  name: string
  x: number
  y: number
}

export interface TimerState {
  endsAt: number
  total: number
}

export type VotingPhase = 'idle' | 'voting' | 'results'

export interface VotingState {
  phase: VotingPhase
  votesPerUser: number
  /** unique id per voting round; clients derive their anonymous voter key from it */
  round?: string
}

export interface RoundResult {
  round: string
  number: number
  votesPerUser: number
  endedAt: number
  /** ranked snapshot taken when the round ended — survives later card edits/deletes */
  results: { cardId: string, text: string, votes: number }[]
}

/**
 * Shared room state. Everything lives in a Yjs doc synced peer-to-peer via
 * y-webrtc and cached locally via y-indexeddb — no server ever sees it.
 *
 * Doc layout:
 *   meta:         ownerToken (secret held by the owner's browser), ownerUid,
 *                 timer {endsAt,total}|null, voting {phase,votesPerUser}
 *   columns:      colId  -> Y.Map {id,title,order}          (owner-only writes)
 *   cards:        cardId -> Y.Map {id,columnId,text,body,authorId,authorName,order,createdAt}
 *                 `body` is a Y.XmlFragment bound to a Tiptap editor (live
 *                 collaborative rich text); `text` is a plain-text mirror used
 *                 for result snapshots
 *   votes:        voterKey -> {cardId: count}  (anonymous: voterKey is a random
 *                 one-off id per voting round, known only to its own browser —
 *                 votes are never linked to a participant in the shared doc)
 *   votingHistory: roundId -> RoundResult      (archived when a round ends;
 *                 new rounds never clear past results)
 *   participants: userId -> {name}            (persisted names; presence via awareness)
 */
export function createRoomStore(code: string, roomName: string) {
  const config = useRuntimeConfig()

  // ---- identity (per-room, local to this browser) ----
  const uidKey = `leancafe:${code}:uid`
  const nameKey = `leancafe:${code}:name`
  const ownerKey = `leancafe:${code}:owner`
  const seedKey = `leancafe:${code}:seed`

  let uid = getStored(uidKey) || ''
  if (!uid) {
    uid = genId()
    setStored(uidKey, uid)
  }
  const myColor = colorFor(uid)
  const name = ref(getStored(nameKey) || '')
  const ownerToken = getStored(ownerKey)

  // ---- shared doc ----
  const doc = new Y.Doc()
  const metaMap = doc.getMap<any>('meta')
  const columnsMap = doc.getMap<Y.Map<any>>('columns')
  const cardsMap = doc.getMap<Y.Map<any>>('cards')
  const votesMap = doc.getMap<Record<string, number>>('votes')
  const historyMap = doc.getMap<RoundResult>('votingHistory')
  const peopleMap = doc.getMap<{ name: string }>('participants')

  // ---- reactive snapshots of the doc ----
  const columns = ref<ColumnItem[]>([])
  const cards = ref<CardItem[]>([])
  const votes = ref<Record<string, Record<string, number>>>({})
  const history = ref<Record<string, RoundResult>>({})
  const people = ref<Record<string, { name: string }>>({})
  const timer = ref<TimerState | null>(null)
  const voting = ref<VotingState>({ phase: 'idle', votesPerUser: 3 })
  const hideAuthors = ref(false)
  /** round whose votes the host shows on cards for everyone (defaults to last finished) */
  const sharedViewRound = ref<string | null>(null)
  const ownerId = ref<string | null>(null)
  const ownerUid = ref<string | null>(null)

  function rebuild() {
    columns.value = [...columnsMap.values()].map(m => ({
      id: m.get('id'),
      title: m.get('title'),
      order: m.get('order'),
      width: m.get('width') || 300,
      hasDesc: !!m.get('desc'),
    }))
    cards.value = [...cardsMap.values()].map((m, idx) => ({
      id: m.get('id'),
      columnId: m.get('columnId'),
      text: m.get('text'),
      authorId: m.get('authorId'),
      authorName: m.get('authorName'),
      order: m.get('order'),
      createdAt: m.get('createdAt'),
      // legacy cards (pre-whiteboard) get a deterministic cascade position
      x: m.get('x') ?? 14 + (idx % 2) * 36,
      y: m.get('y') ?? 14 + ((m.get('order') || idx) * 44) % 440,
      z: m.get('z') ?? idx + 1,
    }))
    const v: Record<string, Record<string, number>> = {}
    votesMap.forEach((val, key) => { v[key] = val || {} })
    votes.value = v
    const h: Record<string, RoundResult> = {}
    historyMap.forEach((val, key) => { h[key] = val })
    history.value = h
    const p: Record<string, { name: string }> = {}
    peopleMap.forEach((val, key) => { p[key] = val })
    people.value = p
    timer.value = (metaMap.get('timer') as TimerState | null) ?? null
    voting.value = (metaMap.get('voting') as VotingState | null) ?? { phase: 'idle', votesPerUser: 3 }
    hideAuthors.value = metaMap.get('hideAuthors') === true
    sharedViewRound.value = (metaMap.get('displayRound') as string | undefined) ?? null
    ownerId.value = (metaMap.get('ownerToken') as string | undefined) ?? null
    ownerUid.value = (metaMap.get('ownerUid') as string | undefined) ?? null
  }
  doc.on('update', rebuild)
  rebuild()

  // ---- connection ----
  const connected = ref(false) // signaling reachable
  const loaded = ref(false) // local IndexedDB cache loaded
  const peerCount = ref(0) // direct WebRTC peers
  const onlineIds = ref<string[]>([uid])
  /** live cursors of other participants (awareness only, never persisted) */
  const pointers = ref<RemotePointer[]>([])

  let provider: WebrtcProvider | null = null
  let persistence: IndexeddbPersistence | null = null
  let destroyed = false

  async function connect() {
    if (import.meta.server || provider || destroyed) return
    const [{ WebrtcProvider }, { IndexeddbPersistence }] = await Promise.all([
      import('y-webrtc'),
      import('y-indexeddb'),
    ])
    if (destroyed) return

    // Local cache is best-effort: without IndexedDB (some private-browsing
    // modes) the board still works, it just won't survive a reload alone.
    try {
      persistence = new IndexeddbPersistence(`leancafe-${code}`, doc)
      await persistence.whenSynced
    } catch {
      persistence = null
    }
    if (destroyed) return
    loaded.value = true

    doc.transact(() => {
      // Re-claim ownership: the raw token lives only in the creator's browser;
      // the shared doc holds the current owner's token + uid so peers agree on
      // who owns the room.
      if (ownerToken) {
        if (!metaMap.get('ownerToken')) {
          metaMap.set('ownerToken', ownerToken)
          metaMap.set('ownerUid', uid)
        } else if (metaMap.get('ownerToken') === ownerToken && metaMap.get('ownerUid') !== uid) {
          metaMap.set('ownerUid', uid)
        }
      }
      // Fresh room created in this browser: seed the classic Lean Coffee columns.
      if (getStored(seedKey) && columnsMap.size === 0) {
        for (const [i, title] of ['To discuss', 'Discussing', 'Discussed'].entries()) {
          const id = genId()
          const col = new Y.Map()
          col.set('id', id)
          col.set('title', title)
          col.set('order', i + 1)
          columnsMap.set(id, col)
        }
      }
      if (name.value) peopleMap.set(uid, { name: name.value })
    })
    removeStored(seedKey)

    // Explicit servers via config, otherwise this app's built-in relay.
    const configured = String(config.public.signaling || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const signaling = configured.length
      ? configured
      : [`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/signal`]

    let iceServers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }]
    try {
      const parsed = JSON.parse(String(config.public.iceServers))
      if (Array.isArray(parsed) && parsed.length) iceServers = parsed
    } catch { /* keep fallback */ }

    provider = new WebrtcProvider(roomName, doc, {
      signaling,
      // The signaling server only relays encrypted handshakes for this room.
      password: `leancafe:${code}`,
      peerOpts: {
        config: { iceServers },
      },
    })
    provider.on('status', ({ connected: isConnected }) => {
      connected.value = isConnected
    })
    provider.on('peers', ({ webrtcPeers }) => {
      peerCount.value = webrtcPeers.length
    })
    provider.awareness.setLocalStateField('user', { id: uid, name: name.value || 'Anonymous', color: myColor })
    provider.awareness.on('change', refreshOnline)
    refreshOnline()
  }

  function refreshOnline() {
    if (!provider) return
    const ids = new Set<string>([uid])
    const pts: RemotePointer[] = []
    provider.awareness.getStates().forEach((state) => {
      const user = state?.user
      if (!user?.id) return
      ids.add(user.id)
      if (user.id !== uid && state.pointer) {
        pts.push({
          id: user.id,
          name: user.name || 'Anonymous',
          x: state.pointer.x,
          y: state.pointer.y,
        })
      }
    })
    onlineIds.value = [...ids]
    pointers.value = pts
  }

  let lastPointerSent = 0
  /** broadcast this client's cursor in board-content coordinates (null = left the board) */
  function setPointer(x: number | null, y = 0) {
    if (!provider) return
    if (x === null) {
      provider.awareness.setLocalStateField('pointer', null)
      return
    }
    const now = Date.now()
    if (now - lastPointerSent < 60) return
    lastPointerSent = now
    provider.awareness.setLocalStateField('pointer', { x: Math.round(x), y: Math.round(y) })
  }

  function destroy() {
    destroyed = true
    provider?.destroy()
    provider = null
    persistence?.destroy()
    persistence = null
    doc.destroy()
  }

  // ---- derived state ----
  const isOwner = computed(() => !!ownerToken && !!ownerId.value && ownerToken === ownerId.value)

  const participants = computed<ParticipantItem[]>(() =>
    onlineIds.value.map(id => ({
      id,
      name: id === uid ? (name.value || 'Anonymous') : (people.value[id]?.name || 'Anonymous'),
      color: colorFor(id),
      isOwner: ownerUid.value === id,
      isSelf: id === uid,
    })),
  )

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

  // ---- which round's votes show on the cards ----
  // The host picks a round for everyone (meta.displayRound); each person can
  // locally override it: a round id, 'none' (hide), or null (follow the host).
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

  function cardsForColumn(columnId: string): CardItem[] {
    // stable DOM order; visual stacking is handled by each note's z
    return cards.value
      .filter(c => c.columnId === columnId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  // ---- identity actions ----
  function setName(newName: string) {
    const clean = newName.trim().slice(0, 24)
    if (!clean) return
    name.value = clean
    setStored(nameKey, clean)
    setStored('leancafe:lastName', clean)
    peopleMap.set(uid, { name: clean })
    provider?.awareness.setLocalStateField('user', { id: uid, name: clean, color: myColor })
  }

  // ---- column actions (host only) ----
  function addColumn(title: string) {
    if (!isOwner.value) return
    const clean = title.trim() || 'Untitled'
    const maxOrder = columns.value.reduce((m, c) => Math.max(m, c.order), 0)
    const id = genId()
    const col = new Y.Map()
    col.set('id', id)
    col.set('title', clean)
    col.set('order', maxOrder + 1)
    columnsMap.set(id, col)
  }

  function renameColumn(id: string, title: string) {
    if (!isOwner.value) return
    const clean = title.trim()
    if (!clean) return
    columnsMap.get(id)?.set('title', clean)
  }

  /** unified column header document (first node = title heading, rest =
   * description); only the host materializes/migrates the fragment, everyone
   * else binds read-only once it exists */
  function columnDescFragment(columnId: string): Y.XmlFragment | null {
    const col = columnsMap.get(columnId)
    if (!col) return null
    let desc = col.get('desc') as Y.XmlFragment | undefined
    const makeTitleHeading = () => {
      const h = new Y.XmlElement('heading')
      h.setAttribute('level', 3 as unknown as string)
      const title = String(col.get('title') || '')
      if (title) h.insert(0, [new Y.XmlText(title)])
      return h
    }
    if (!desc) {
      if (!isOwner.value) return null
      desc = new Y.XmlFragment()
      desc.insert(0, [makeTitleHeading()])
      col.set('desc', desc)
    } else if (isOwner.value) {
      // migrate description-only fragments to the heading-first schema
      const first = desc.get(0)
      if (!(first instanceof Y.XmlElement) || first.nodeName !== 'heading') {
        desc.insert(0, [makeTitleHeading()])
      }
    }
    return desc
  }

  function resizeColumn(id: string, width: number) {
    if (!isOwner.value) return
    const w = Math.round(Math.min(900, Math.max(300, width)))
    const col = columnsMap.get(id)
    if (col && col.get('width') !== w) col.set('width', w)
  }

  function removeColumn(id: string) {
    if (!isOwner.value) return
    doc.transact(() => {
      columnsMap.delete(id)
      const doomed: string[] = []
      cardsMap.forEach((card, cardId) => {
        if (card.get('columnId') === id) doomed.push(cardId)
      })
      doomed.forEach(cardId => cardsMap.delete(cardId))
    })
  }

  // ---- card actions ----
  /** set when addCard creates an empty card so its editor opens immediately */
  const autoEditCardId = ref<string | null>(null)

  /** create a note; at (x, y) when given (e.g. double-click on the board),
   * otherwise cascaded so new notes don't fully cover each other */
  function addCard(columnId: string, x?: number, y?: number): string | null {
    if (!columnsMap.get(columnId)) return null
    const inColumn = cards.value.filter(c => c.columnId === columnId)
    const n = inColumn.length
    const maxZ = cards.value.reduce((m, c) => Math.max(m, c.z || 0), 0)
    const id = genId()
    const card = new Y.Map()
    card.set('id', id)
    card.set('columnId', columnId)
    card.set('text', '')
    card.set('body', new Y.XmlFragment())
    card.set('authorId', uid)
    card.set('authorName', name.value || 'Anonymous')
    card.set('order', n + 1)
    card.set('createdAt', Date.now())
    card.set('x', Math.round(x ?? 14 + (n % 3) * 32))
    card.set('y', Math.round(y ?? 14 + (n * 44) % 440))
    card.set('z', maxZ + 1)
    cardsMap.set(id, card)
    autoEditCardId.value = id
    return id
  }

  /** live rich-text body of a card; migrates pre-rich-text cards on the fly */
  function bodyFragment(cardId: string): Y.XmlFragment | null {
    const card = cardsMap.get(cardId)
    if (!card) return null
    let body = card.get('body') as Y.XmlFragment | undefined
    if (!body) {
      body = new Y.XmlFragment()
      const text = String(card.get('text') || '')
      if (text) {
        const p = new Y.XmlElement('paragraph')
        p.insert(0, [new Y.XmlText(text)])
        body.insert(0, [p])
      }
      card.set('body', body)
    }
    return body
  }

  /** plain-text mirror of the body, used for result snapshots */
  function updateCardText(id: string, text: string) {
    const card = cardsMap.get(id)
    if (card && card.get('text') !== text) card.set('text', text)
  }

  function removeCard(id: string) {
    // what's being voted on must not change mid-round
    if (voting.value.phase === 'voting') return
    cardsMap.delete(id)
  }

  /** place a note at a free position on a column whiteboard, on top of the stack */
  function moveNote(cardId: string, toColumnId: string, x: number, y: number) {
    const card = cardsMap.get(cardId)
    if (!card || !columnsMap.get(toColumnId)) return
    const maxZ = cards.value.reduce((m, c) => Math.max(m, c.z || 0), 0)
    doc.transact(() => {
      if (card.get('columnId') !== toColumnId) card.set('columnId', toColumnId)
      card.set('x', Math.round(x))
      card.set('y', Math.round(y))
      card.set('z', maxZ + 1)
    })
  }

  // ---- timer (owner only) ----
  function startTimer(seconds: number) {
    if (!isOwner.value || seconds <= 0) return
    metaMap.set('timer', { endsAt: Date.now() + seconds * 1000, total: seconds })
  }

  function stopTimer() {
    if (!isOwner.value) return
    metaMap.set('timer', null)
  }

  function toggleAuthors() {
    if (!isOwner.value) return
    metaMap.set('hideAuthors', !hideAuthors.value)
  }

  // ---- voting ----
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

  // ---- drag state (local UI, not shared) ----
  const draggingCardId = ref<string | null>(null)
  const dragOverColumn = ref<string | null>(null)

  return {
    code,
    uid,
    name,
    connected,
    loaded,
    peerCount,
    columns,
    cards,
    votes,
    people,
    timer,
    voting,
    hideAuthors,
    isOwner,
    participants,
    voteTotals,
    myVotes,
    votesLeft,
    votersDone,
    pastRounds,
    sharedViewRound,
    localViewRound,
    viewRoundId,
    cardVotes,
    setSharedView,
    setLocalView,
    deleteRound,
    draggingCardId,
    dragOverColumn,
    pointers,
    setPointer,
    connect,
    destroy,
    cardsForColumn,
    setName,
    addColumn,
    renameColumn,
    resizeColumn,
    columnDescFragment,
    removeColumn,
    addCard,
    autoEditCardId,
    bodyFragment,
    updateCardText,
    removeCard,
    moveNote,
    startTimer,
    stopTimer,
    toggleAuthors,
    startVoting,
    endVoting,
    resetVoting,
    adjustVote,
  }
}

export type RoomStore = ReturnType<typeof createRoomStore>

// String key: stays identical across Vite HMR module re-evaluations,
// where a Symbol would get a fresh identity and break inject().
const roomStoreKey = 'leancafe:room-store' as unknown as InjectionKey<RoomStore>

export function provideRoomStore(store: RoomStore) {
  provide(roomStoreKey, store)
}

export function useRoomStore(): RoomStore {
  const store = inject(roomStoreKey)
  if (!store) throw new Error('Room store not provided')
  return store
}
