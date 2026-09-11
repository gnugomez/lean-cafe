import * as Y from 'yjs'
import type { ComputedRef, Ref } from 'vue'
import { prosemirrorToYXmlFragment, yXmlFragmentToProsemirrorJSON } from 'y-prosemirror'
import { getSchema, rewriteUnknownContent } from '@tiptap/vue-3'
import type { JSONContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import type { CardItem, ColumnItem, RoundResult, StickerItem, VotingState } from './types'
import { COLUMN_MIN_WIDTH, clampColumnWidth } from './columns'
import { sanitizeSticker } from './stickers'

/**
 * Board export/import. The file is one human-readable JSON document:
 *
 *   { "format": "lean-cafe-board", "version": 1, "exportedAt": …, "room": "ABC123",
 *     "columns": [{ id, title, order, width }],
 *     "cards":   [{ id, columnId, text, authorName, order, createdAt, x, y, z, body? }],
 *     "stickers": [{ id, url, size, rot, x, y, columnId?|cardId? }],
 *     "votingHistory": [{ round, number, votesPerUser, endedAt, results }] }
 *
 * `body` is the card's rich text as ProseMirror JSON; `text` stays the plain
 * mirror and is the fallback when a body is missing or fails validation.
 * `stickers` is optional on parse, so files written before stickers existed
 * still import.
 * Live state (timer, current round, votes, owner token, participants) and
 * authorIds (room-local identity keys) are deliberately not exported — the
 * card display already falls back to the plain authorName string.
 */
export const BOARD_FORMAT = 'lean-cafe-board'
export const BOARD_VERSION = 1

// caps for untrusted imports — generous for real boards, tight enough that a
// crafted file can't blow up the shared doc for every peer
export const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_COLUMNS = 50
const MAX_CARDS = 1000
const MAX_STICKERS = 1000
const MAX_ROUNDS = 200
const MAX_RESULTS = 500
const MAX_TITLE = 120
const MAX_TEXT = 5000
const MAX_NAME = 40
const MAX_BODY_JSON = 100_000 // stringified ProseMirror JSON per card
const MAX_COORD = 20000

export interface BoardExport {
  format: typeof BOARD_FORMAT
  version: typeof BOARD_VERSION
  exportedAt: number
  room: string
  columns: Array<{ id: string, title: string, order: number, width: number }>
  cards: Array<{
    id: string
    columnId: string
    text: string
    authorName: string
    order: number
    createdAt: number
    x: number
    y: number
    z: number
    body?: JSONContent
  }>
  stickers: StickerItem[]
  votingHistory: RoundResult[]
}

export interface ParsedCard extends Omit<CardItem, 'authorId'> { body?: JSONContent }
export interface ParsedBoard {
  columns: ColumnItem[]
  cards: ParsedCard[]
  stickers: StickerItem[]
  rounds: RoundResult[]
}
export type ParseResult = { ok: true, board: ParsedBoard } | { ok: false, error: string }

const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
const str = (v: unknown) => typeof v === 'string' ? v : ''
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function serializeBoard(opts: {
  code: string
  columns: ColumnItem[]
  cards: CardItem[]
  stickers: StickerItem[]
  history: RoundResult[]
  bodyOf: (cardId: string) => Y.XmlFragment | null
}): BoardExport {
  const { code, columns, cards, stickers, history, bodyOf } = opts
  return {
    format: BOARD_FORMAT,
    version: BOARD_VERSION,
    exportedAt: Date.now(),
    room: code,
    columns: [...columns].sort((a, b) => a.order - b.order)
      .map(c => ({ id: c.id, title: c.title, order: c.order, width: c.width })),
    cards: [...cards].sort((a, b) => a.createdAt - b.createdAt).map((c) => {
      const out: BoardExport['cards'][number] = {
        id: c.id, columnId: c.columnId, text: c.text, authorName: c.authorName,
        order: c.order, createdAt: c.createdAt, x: c.x, y: c.y, z: c.z,
      }
      const frag = bodyOf(c.id)
      if (frag && frag.length > 0) {
        try {
          out.body = yXmlFragmentToProsemirrorJSON(frag) as JSONContent
        } catch { /* pathological body — the plain-text mirror still exports */ }
      }
      return out
    }),
    stickers: stickers.map(s => ({ ...s })),
    votingHistory: Object.values(history).sort((a, b) => a.endedAt - b.endedAt).map(r => ({
      round: r.round, number: r.number, votesPerUser: r.votesPerUser, endedAt: r.endedAt,
      results: r.results.map(e => ({ cardId: e.cardId, text: e.text, votes: e.votes })),
    })),
  }
}

/**
 * Validate an untrusted board file into clean plain data, in the same spirit
 * as doc.ts rebuild(): type-check every shape, clamp every number, cap every
 * string — nothing here may throw past JSON.parse. Columns and cards get
 * fresh ids; file ids only serve to remap columnId / history references.
 */
export function parseBoardExport(text: string): ParseResult {
  let raw: any
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }
  if (!raw || typeof raw !== 'object' || raw.format !== BOARD_FORMAT) {
    return { ok: false, error: 'That file is not a Lean Café board export.' }
  }
  if (raw.version !== BOARD_VERSION) {
    return { ok: false, error: `Unsupported board file version “${String(raw.version)}” — this app imports version ${BOARD_VERSION}.` }
  }
  const rawColumns: unknown[] = Array.isArray(raw.columns) ? raw.columns : []
  const rawCards: unknown[] = Array.isArray(raw.cards) ? raw.cards : []
  const rawRounds: unknown[] = Array.isArray(raw.votingHistory) ? raw.votingHistory : []
  if (rawColumns.length > MAX_COLUMNS) return { ok: false, error: `Too many columns in that file (max ${MAX_COLUMNS}).` }
  if (rawCards.length > MAX_CARDS) return { ok: false, error: `Too many cards in that file (max ${MAX_CARDS}).` }

  const colIds = new Map<string, string>()
  const columns: ColumnItem[] = []
  for (const [i, c] of (rawColumns as any[]).entries()) {
    if (!c || typeof c !== 'object') continue
    const id = genId()
    if (typeof c.id === 'string' && c.id && !colIds.has(c.id)) colIds.set(c.id, id)
    columns.push({
      id,
      title: str(c.title).trim().slice(0, MAX_TITLE) || 'Untitled',
      order: clamp(num(c.order, i + 1), 0, 1e6),
      width: clampColumnWidth(num(c.width, COLUMN_MIN_WIDTH)),
    })
  }

  const cardIds = new Map<string, string>()
  const cards: ParsedCard[] = []
  for (const [i, c] of (rawCards as any[]).entries()) {
    if (!c || typeof c !== 'object') continue
    const columnId = colIds.get(str(c.columnId))
    if (!columnId) continue // points at a column the file doesn't define
    const id = genId()
    if (typeof c.id === 'string' && c.id && !cardIds.has(c.id)) cardIds.set(c.id, id)
    let body: JSONContent | undefined
    if (c.body && typeof c.body === 'object' && !Array.isArray(c.body)
      && JSON.stringify(c.body).length <= MAX_BODY_JSON) body = c.body
    cards.push({
      id,
      columnId,
      text: str(c.text).slice(0, MAX_TEXT),
      authorName: str(c.authorName).trim().slice(0, MAX_NAME) || 'Anonymous',
      order: clamp(num(c.order, i + 1), 0, 1e6),
      createdAt: clamp(num(c.createdAt, 0), 0, 1e14),
      x: Math.round(clamp(num(c.x, 14), 0, MAX_COORD)),
      y: Math.round(clamp(num(c.y, 14), 0, MAX_COORD)),
      z: Math.round(clamp(num(c.z, i + 1), 1, 1e6)),
      body,
    })
  }

  // stickers are optional (pre-sticker files) and re-anchored onto the fresh
  // ids; sanitizeSticker applies the same clamps and URL allowlist as the doc
  const rawStickers: unknown[] = Array.isArray(raw.stickers) ? raw.stickers.slice(0, MAX_STICKERS) : []
  const stickers: StickerItem[] = []
  for (const s of rawStickers as any[]) {
    if (!s || typeof s !== 'object') continue
    const columnId = typeof s.columnId === 'string' ? colIds.get(s.columnId) : undefined
    const cardId = typeof s.cardId === 'string' ? cardIds.get(s.cardId) : undefined
    const clean = sanitizeSticker({ ...s, id: genId(), columnId, cardId })
    if (clean) stickers.push(clean) // dropped when its anchor isn't in the file
  }

  const seenRounds = new Set<string>()
  const rounds: RoundResult[] = []
  for (const [i, r] of (rawRounds.slice(0, MAX_ROUNDS) as any[]).entries()) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.results)) continue
    let roundId = str(r.round).slice(0, 32)
    if (!roundId || seenRounds.has(roundId)) roundId = genId(8)
    seenRounds.add(roundId)
    rounds.push({
      round: roundId,
      number: Math.round(clamp(num(r.number, i + 1), 1, 1e6)),
      votesPerUser: Math.round(clamp(num(r.votesPerUser, 3), 1, 99)),
      endedAt: clamp(num(r.endedAt, 0), 0, 1e14),
      results: (r.results as any[]).slice(0, MAX_RESULTS).flatMap((e) => {
        if (!e || typeof e !== 'object') return []
        const oldId = str(e.cardId)
        return [{
          // unmatched ids just show no badge on cards; the text snapshot survives
          cardId: cardIds.get(oldId) || oldId.slice(0, 32),
          text: str(e.text).slice(0, MAX_TEXT),
          votes: Math.round(clamp(num(e.votes, 0), 0, 1e6)),
        }]
      }),
    })
  }

  return { ok: true, board: { columns, cards, stickers, rounds } }
}

// Schema for validating imported bodies — its node/mark set must match the
// editor extensions in useCollabEditor.ts (schema-neutral extensions like
// Placeholder/SlashCommands/Collaboration don't matter here).
let cardSchema: Schema | null = null
function getCardSchema(): Schema {
  cardSchema ??= getSchema([
    StarterKit.configure({ undoRedo: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ])
  return cardSchema
}

/** untrusted ProseMirror JSON → checked node; unknown nodes/marks are
 * rewritten or dropped, anything still invalid falls back to the text mirror */
function bodyToNode(body: JSONContent | undefined): PMNode | null {
  if (!body || !Array.isArray(body.content) || body.content.length === 0) return null
  try {
    const schema = getCardSchema()
    const { json } = rewriteUnknownContent({ ...body, type: 'doc' }, schema)
    if (!json) return null
    const node = schema.nodeFromJSON(json)
    node.check()
    return node
  } catch {
    return null
  }
}

export function createRoomTransfer(opts: {
  code: string
  doc: Y.Doc
  metaMap: Y.Map<any>
  columnsMap: Y.Map<Y.Map<any>>
  cardsMap: Y.Map<Y.Map<any>>
  votesMap: Y.Map<Record<string, number>>
  historyMap: Y.Map<RoundResult>
  stickersMap: Y.Map<StickerItem>
  columns: Ref<ColumnItem[]>
  cards: Ref<CardItem[]>
  stickers: Ref<StickerItem[]>
  history: Ref<Record<string, RoundResult>>
  voting: Ref<VotingState>
  isOwner: ComputedRef<boolean>
}) {
  const {
    code, doc, metaMap, columnsMap, cardsMap, votesMap, historyMap, stickersMap,
    columns, cards, stickers, history, voting, isOwner,
  } = opts

  /** download the board as lean-cafe-<code>-<date>.json (any participant) */
  function exportBoard() {
    const data = serializeBoard({
      code,
      columns: columns.value,
      cards: cards.value,
      stickers: stickers.value,
      history: Object.values(history.value),
      bodyOf: (id) => {
        const body = cardsMap.get(id)?.get('body')
        return body instanceof Y.XmlFragment ? body : null
      },
    })
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lean-cafe-${code}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Replace the whole board (columns + cards + voting history) with a file's
   * content, atomically for every peer. Returns an error message to show the
   * user, or null (imported, or cancelled at the confirm).
   */
  async function importBoard(file: File): Promise<string | null> {
    if (!isOwner.value) return 'Only the host can import a board.'
    if (file.size > MAX_FILE_BYTES) return 'Board files can be at most 5 MB.'
    let text: string
    try {
      text = await file.text()
    } catch {
      return 'Could not read that file.'
    }
    const parsed = parseBoardExport(text)
    if (!parsed.ok) return parsed.error
    const { board } = parsed

    // convert rich bodies before touching the doc: a bad card can only fall
    // back to its plain text, never abort the transact halfway through
    const bodies = new Map<string, PMNode>()
    for (const card of board.cards) {
      const node = bodyToNode(card.body)
      if (node) bodies.set(card.id, node)
    }

    const nCols = columns.value.length
    const nCards = cards.value.length
    if ((nCols || nCards) && !window.confirm(
      `Import “${file.name}”? This replaces the current board `
      + `(${nCols} column${nCols === 1 ? '' : 's'}, ${nCards} card${nCards === 1 ? '' : 's'}) for everyone.`,
    )) return null

    // one shared authorId per imported display name, so an author's cards
    // keep matching dot colors without linking to any live participant
    const authorIds = new Map<string, string>()
    const authorIdFor = (name: string) => {
      let id = authorIds.get(name)
      if (!id) {
        id = genId()
        authorIds.set(name, id)
      }
      return id
    }

    doc.transact(() => {
      for (const key of [...columnsMap.keys()]) columnsMap.delete(key)
      for (const key of [...cardsMap.keys()]) cardsMap.delete(key)
      for (const key of [...votesMap.keys()]) votesMap.delete(key)
      for (const key of [...historyMap.keys()]) historyMap.delete(key)
      for (const key of [...stickersMap.keys()]) stickersMap.delete(key)

      for (const col of board.columns) {
        const m = new Y.Map()
        m.set('id', col.id)
        m.set('title', col.title)
        m.set('order', col.order)
        m.set('width', col.width)
        columnsMap.set(col.id, m)
      }

      for (const card of board.cards) {
        const m = new Y.Map()
        m.set('id', card.id)
        m.set('columnId', card.columnId)
        m.set('text', card.text)
        m.set('authorId', authorIdFor(card.authorName))
        m.set('authorName', card.authorName)
        m.set('order', card.order)
        m.set('createdAt', card.createdAt)
        m.set('x', card.x)
        m.set('y', card.y)
        m.set('z', card.z)
        cardsMap.set(card.id, m) // attach first so the body fills in-doc
        const frag = new Y.XmlFragment()
        m.set('body', frag)
        const node = bodies.get(card.id)
        if (node) {
          prosemirrorToYXmlFragment(node, frag)
        } else if (card.text) {
          // plain-text fallback: same shape bodyFragment() migrates to
          const p = new Y.XmlElement('paragraph')
          p.insert(0, [new Y.XmlText(card.text)])
          frag.insert(0, [p])
        }
      }

      for (const sticker of board.stickers) stickersMap.set(sticker.id, sticker)

      let latest: RoundResult | null = null
      for (const r of board.rounds) {
        historyMap.set(r.round, r)
        if (!latest || r.endedAt > latest.endedAt) latest = r
      }
      // any live round is over — its cards are gone; show the newest imported
      // round on cards, matching the post-endVoting default
      metaMap.set('voting', { phase: 'idle', votesPerUser: voting.value.votesPerUser })
      metaMap.set('displayRound', latest ? latest.round : null)
    })
    return null
  }

  return { exportBoard, importBoard }
}
