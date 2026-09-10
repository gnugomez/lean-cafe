import type { InjectionKey } from 'vue'
import type { ParticipantItem } from './room/types'
import { createRoomDoc } from './room/doc'
import { createRoomOwnership } from './room/ownership'
import { createRoomConnection } from './room/connection'
import { createRoomColumns, seedDefaultColumns } from './room/columns'
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
 *   meta:          ownerToken (secret held by the owner's browser), ownerUid,
 *                  timer, voting, hideAuthors, displayRound
 *   columns:       colId  -> Y.Map {id,title,order,width,desc}  (owner-only writes)
 *   cards:         cardId -> Y.Map {id,columnId,text,body,authorId,authorName,order,createdAt,x,y,z}
 *                  `body`: Y.XmlFragment bound to Tiptap; `text`: plain-text mirror for result snapshots
 *   votes:         voterKey -> {cardId: count}  (anonymous: a random per-round key
 *                  known only to its own browser — never linked to a participant)
 *   votingHistory: roundId -> RoundResult  (archived when a round ends; never cleared by new rounds)
 *   participants:  userId -> {name}  (persisted names; live presence via awareness)
 */
export function createRoomStore(code: string, roomName: string) {
  // per-room identity, local to this browser
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

  const {
    doc, metaMap, columnsMap, cardsMap, votesMap, historyMap, peopleMap,
    columns, cards, votes, history, people, timer, voting, hideAuthors,
    sharedViewRound, ownerId, ownerUid,
  } = createRoomDoc()

  const { isOwner, reclaimOwnership } = createRoomOwnership({ metaMap, uid, ownerToken, ownerId })

  const connection = createRoomConnection({
    code,
    roomName,
    doc,
    uid,
    myColor,
    name,
    onLoaded: () => {
      doc.transact(() => {
        reclaimOwnership()
        // Fresh room created in this browser: seed the classic Lean Coffee columns.
        if (getStored(seedKey) && columnsMap.size === 0) seedDefaultColumns(columnsMap)
        if (name.value) peopleMap.set(uid, { name: name.value })
      })
      removeStored(seedKey)
    },
  })
  const { connected, loaded, peerCount, onlineIds, pointers, connect, setPointer } = connection

  const columnsApi = createRoomColumns({ doc, columnsMap, cardsMap, columns, isOwner })
  const cardsApi = createRoomCards({ doc, cardsMap, columnsMap, cards, voting, uid, name })
  const votingApi = createRoomVoting({
    code, doc, metaMap, votesMap, historyMap,
    cards, votes, history, voting, sharedViewRound, isOwner,
  })

  const participants = computed<ParticipantItem[]>(() =>
    onlineIds.value.map(id => ({
      id,
      name: id === uid ? (name.value || 'Anonymous') : (people.value[id]?.name || 'Anonymous'),
      color: colorFor(id),
      isOwner: ownerUid.value === id,
      isSelf: id === uid,
    })),
  )

  function setName(newName: string) {
    const clean = newName.trim().slice(0, 24)
    if (!clean) return
    name.value = clean
    setStored(nameKey, clean)
    setStored('leancafe:lastName', clean)
    peopleMap.set(uid, { name: clean })
    connection.setAwarenessUser()
  }

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

  // drag state — local UI, never shared
  const draggingCardId = ref<string | null>(null)
  const dragOverColumn = ref<string | null>(null)

  function destroy() {
    connection.destroy()
    doc.destroy()
  }

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
    draggingCardId,
    dragOverColumn,
    pointers,
    setPointer,
    connect,
    destroy,
    setName,
    startTimer,
    stopTimer,
    toggleAuthors,
    ...columnsApi,
    ...cardsApi,
    ...votingApi,
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
