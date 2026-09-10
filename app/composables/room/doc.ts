import * as Y from 'yjs'
import type { CardItem, ColumnItem, RoundResult, TimerState, VotingState } from './types'
import { isHeaderDoc } from './columns'

export function createRoomDoc() {
  const doc = new Y.Doc()
  const metaMap = doc.getMap<any>('meta')
  const columnsMap = doc.getMap<Y.Map<any>>('columns')
  const cardsMap = doc.getMap<Y.Map<any>>('cards')
  const votesMap = doc.getMap<Record<string, number>>('votes')
  const historyMap = doc.getMap<RoundResult>('votingHistory')
  const peopleMap = doc.getMap<{ name: string }>('participants')

  // reactive snapshots of the doc
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

  return {
    doc,
    metaMap,
    columnsMap,
    cardsMap,
    votesMap,
    historyMap,
    peopleMap,
    columns,
    cards,
    votes,
    history,
    people,
    timer,
    voting,
    hideAuthors,
    sharedViewRound,
    ownerId,
    ownerUid,
  }
}
