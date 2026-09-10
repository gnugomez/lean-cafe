import * as Y from 'yjs'
import type { InjectionKey } from 'vue'
import type { WebrtcProvider } from 'y-webrtc'
import type { IndexeddbPersistence } from 'y-indexeddb'
import type { CardItem, ColumnItem, ParticipantItem, RemotePointer, RoundResult, TimerState, VotingState } from './room/types'
import { createRoomColumns, isHeaderDoc, seedDefaultColumns } from './room/columns'
import { createRoomCards } from './room/cards'
import { createRoomVoting } from './room/voting'

export type {
  CardItem, ColumnItem, ParticipantItem, RemotePointer,
  RoundResult, TimerState, VotingPhase, VotingState,
} from './room/types'

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
      hasDesc: isHeaderDoc(m.get('desc')),
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
    // y-indexeddb's whenSynced never settles when the DB fails to open; its
    // _db rejection is the only failure signal, so race the two.
    try {
      const idb = new IndexeddbPersistence(`leancafe-${code}`, doc)
      persistence = idb
      await Promise.race([idb.whenSynced, idb._db.then(() => idb.whenSynced)])
    } catch (err) {
      console.warn('[lean-cafe] IndexedDB unavailable, the board is not cached locally', err)
      persistence?.destroy().catch(() => {}) // detaches doc listeners; rejects with the same open error
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
      if (getStored(seedKey) && columnsMap.size === 0) seedDefaultColumns(columnsMap)
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

    // Both branches below are only reachable when NUXT_PUBLIC_ICE_SERVERS is
    // overridden with something broken — warn instead of masking the misconfig.
    let iceServers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }]
    try {
      const parsed = JSON.parse(String(config.public.iceServers))
      if (Array.isArray(parsed) && parsed.length) iceServers = parsed
      else console.warn('[lean-cafe] iceServers config is not a non-empty array, using the STUN fallback')
    } catch {
      console.warn('[lean-cafe] iceServers config is not valid JSON, using the STUN fallback')
    }

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

  const votingApi = createRoomVoting({
    code, doc, metaMap, votesMap, historyMap,
    cards, votes, history, voting, sharedViewRound, isOwner,
  })

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

  const { addColumn, renameColumn, resizeColumn, removeColumn, columnDescFragment }
    = createRoomColumns({ doc, columnsMap, cardsMap, columns, isOwner })

  const { cardsForColumn, autoEditCardId, addCard, bodyFragment, updateCardText, removeCard, moveNote }
    = createRoomCards({ doc, cardsMap, columnsMap, cards, voting, uid, name })

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
    sharedViewRound,
    ...votingApi,
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
