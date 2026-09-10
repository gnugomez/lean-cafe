import * as Y from 'yjs'
import type { CardItem, ColumnItem, RoundResult, TimerState, VotingState } from './types'
import { COLUMN_MIN_WIDTH, clampColumnWidth } from './columns'

export function createRoomDoc() {
  const doc = new Y.Doc()
  const metaMap = doc.getMap<any>('meta')
  const columnsMap = doc.getMap<Y.Map<any>>('columns')
  const cardsMap = doc.getMap<Y.Map<any>>('cards')
  const votesMap = doc.getMap<Record<string, number>>('votes')
  const historyMap = doc.getMap<RoundResult>('votingHistory')
  const peopleMap = doc.getMap<{ name: string, color?: number }>('participants')

  // reactive snapshots of the doc
  const columns = ref<ColumnItem[]>([])
  const cards = ref<CardItem[]>([])
  const votes = ref<Record<string, Record<string, number>>>({})
  const history = ref<Record<string, RoundResult>>({})
  const people = ref<Record<string, { name: string, color?: number }>>({})
  const timer = ref<TimerState | null>(null)
  const voting = ref<VotingState>({ phase: 'idle', votesPerUser: 3 })
  const hideAuthors = ref(false)
  /** round whose votes the host shows on cards for everyone (defaults to last finished) */
  const sharedViewRound = ref<string | null>(null)
  const ownerId = ref<string | null>(null)
  const ownerUid = ref<string | null>(null)

  // Shared state is peer-writable, so rebuild() must never trust shapes:
  // a crafted value (non-Y.Map entry, NaN position, junk meta) would otherwise
  // throw here on every update and freeze the board for every peer.
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  const str = (v: unknown, fallback = '') => typeof v === 'string' ? v : fallback

  function rebuild() {
    columns.value = [...columnsMap.values()]
      .filter((m): m is Y.Map<any> => m instanceof Y.Map)
      .map(m => ({
        id: str(m.get('id')),
        title: str(m.get('title')),
        order: num(m.get('order'), 0),
        // same bounds resizeColumn enforces, against out-of-range peer values
        width: clampColumnWidth(num(m.get('width'), COLUMN_MIN_WIDTH)),
      }))
    cards.value = [...cardsMap.values()]
      .filter((m): m is Y.Map<any> => m instanceof Y.Map)
      .map((m, idx) => ({
        id: str(m.get('id')),
        columnId: str(m.get('columnId')),
        text: str(m.get('text')),
        authorId: str(m.get('authorId')),
        authorName: str(m.get('authorName')),
        order: num(m.get('order'), idx),
        createdAt: num(m.get('createdAt'), 0),
        // legacy cards (pre-whiteboard) get a deterministic cascade position
        x: num(m.get('x'), 14 + (idx % 2) * 36),
        y: num(m.get('y'), 14 + (num(m.get('order'), idx) * 44) % 440),
        z: num(m.get('z'), idx + 1),
      }))
    const v: Record<string, Record<string, number>> = {}
    votesMap.forEach((val, key) => {
      const clean: Record<string, number> = {}
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        for (const [cardId, n] of Object.entries(val)) {
          if (typeof n === 'number' && Number.isFinite(n) && n > 0) clean[cardId] = n
        }
      }
      v[key] = clean
    })
    votes.value = v
    const h: Record<string, RoundResult> = {}
    historyMap.forEach((val, key) => {
      if (val && typeof val === 'object' && Array.isArray(val.results)) h[key] = val
    })
    history.value = h
    const p: Record<string, { name: string, color?: number }> = {}
    peopleMap.forEach((val, key) => {
      p[key] = { name: str(val?.name), color: isPaletteIndex(val?.color) ? val.color : undefined }
    })
    people.value = p
    const rawTimer = metaMap.get('timer') as Partial<TimerState> | null | undefined
    timer.value = rawTimer && Number.isFinite(rawTimer.endsAt) && Number.isFinite(rawTimer.total) && rawTimer.total! > 0
      ? { endsAt: rawTimer.endsAt!, total: rawTimer.total! }
      : null
    const rawVoting = metaMap.get('voting') as Partial<VotingState> | null | undefined
    const phase = rawVoting && (['idle', 'voting', 'results'] as const).find(ph => ph === rawVoting.phase)
    voting.value = phase
      ? {
          phase,
          votesPerUser: Math.max(1, num(rawVoting!.votesPerUser, 3)),
          round: typeof rawVoting!.round === 'string' ? rawVoting!.round : undefined,
        }
      : { phase: 'idle', votesPerUser: 3 }
    hideAuthors.value = metaMap.get('hideAuthors') === true
    sharedViewRound.value = str(metaMap.get('displayRound')) || null
    ownerId.value = str(metaMap.get('ownerToken')) || null
    ownerUid.value = str(metaMap.get('ownerUid')) || null
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
