import type { CardItem, ColumnItem, RoundResult } from './room/types'

/**
 * A read-only peek at a board this browser has cached, used by the landing page
 * to show what a past session looked like. The doc is opened straight from
 * IndexedDB — no signaling, no peers, nothing shared — read once, then dropped.
 */

/** .card's default width in main.css; notes only store w/h once resized */
const NOTE_W = 220
/** the column's title row in the thumbnail: note y = 0 sits below it */
export const THUMB_HEAD = 46
/** enough notes to read the shape of a board without drawing thousands of rects */
const MAX_NOTES = 240
/** a note dragged far off-canvas must not shrink the whole thumbnail */
const COORD_LIMIT = 4000

export interface PreviewNote {
  x: number
  y: number
  w: number
  h: number
  /** text bars to draw inside the note (0 = an empty note) */
  lines: number
  /** the author's color, from the same palette the board uses */
  color: string
}

export interface PreviewColumn {
  id: string
  title: string
  width: number
  notes: PreviewNote[]
}

export interface SessionPreview {
  /** false when this browser holds no copy (cleared, or never synced) */
  cached: boolean
  columns: PreviewColumn[]
  noteCount: number
  rounds: number
  people: { id: string, name: string, color: string }[]
  /** newest note or vote round on the board, epoch ms (0 when unknown) */
  lastActivity: number
}

function emptyPreview(cached = false): SessionPreview {
  return { cached, columns: [], noteCount: 0, rounds: 0, people: [], lastActivity: 0 }
}

/**
 * Opening a Yjs persistence creates the database, so check before opening one:
 * a room whose cache was cleared should stay cleared. Browsers that don't list
 * databases just open it.
 */
async function hasCachedBoard(dbName: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false
  if (!indexedDB.databases) return true
  try {
    return (await indexedDB.databases()).some(db => db.name === dbName)
  } catch { return true }
}

const clamp = (n: number) => Math.min(COORD_LIMIT, Math.max(-COORD_LIMIT, n))

/** how many text lines a note's text roughly fills at that width */
function textLines(text: string, width: number): number {
  const clean = text.trim()
  if (!clean) return 0
  return Math.min(12, Math.ceil(clean.length / Math.max(8, Math.round(width / 7.5))))
}

/** the real note is auto-height; this is what those lines add up to */
const noteHeight = (lines: number) => 56 + Math.max(1, lines) * 21

/** the cached board of `code`, or an empty preview when there is nothing to show */
export async function loadSessionPreview(code: string): Promise<SessionPreview> {
  const dbName = `leancafe-${code}`
  if (!await hasCachedBoard(dbName)) return emptyPreview()

  // both are only needed once a preview is actually drawn — keep yjs out of the
  // landing page's bundle
  const [{ createRoomDoc }, { IndexeddbPersistence }] = await Promise.all([
    import('./room/doc'),
    import('y-indexeddb'),
  ])
  const { doc, columns, cards, people, history } = createRoomDoc()
  const idb = new IndexeddbPersistence(dbName, doc)
  try {
    // same race as the room connection: whenSynced never settles when the DB
    // fails to open, and the _db rejection is the only failure signal
    await Promise.race([idb.whenSynced, idb._db.then(() => idb.whenSynced)])
  } catch (err) {
    console.warn(`[lean-cafe] could not read the cached board for ${code}`, err)
    idb.destroy().catch(() => {})
    doc.destroy()
    return emptyPreview()
  }
  try {
    return buildPreview(columns.value, cards.value, people.value, history.value)
  } finally {
    idb.destroy().catch(() => {})
    doc.destroy()
  }
}

function buildPreview(
  columns: ColumnItem[],
  cards: CardItem[],
  people: Record<string, { name: string, color?: number }>,
  history: Record<string, RoundResult>,
): SessionPreview {
  const colorOf = (id: string) => AVATAR_PALETTE[people[id]?.color ?? colorIndexFor(id)]!
  const byColumn = new Map<string, PreviewNote[]>(
    [...columns].sort((a, b) => a.order - b.order).map(c => [c.id, []]),
  )

  let noteCount = 0
  let lastActivity = 0
  // oldest first, so a capped thumbnail keeps the notes that shaped the board
  for (const card of [...cards].sort((a, b) => a.createdAt - b.createdAt)) {
    const notes = byColumn.get(card.columnId)
    if (!notes) continue // orphan of a deleted column — not on the board either
    noteCount++
    lastActivity = Math.max(lastActivity, card.createdAt)
    if (noteCount > MAX_NOTES) continue
    const w = card.w ?? NOTE_W
    const lines = textLines(card.text, w)
    notes.push({
      x: clamp(card.x),
      y: clamp(card.y),
      w,
      h: card.h ?? noteHeight(lines),
      lines: Math.min(lines, 4),
      color: colorOf(card.authorId),
    })
  }

  for (const round of Object.values(history)) {
    lastActivity = Math.max(lastActivity, round.endedAt || 0)
  }

  return {
    cached: true,
    columns: [...byColumn].map(([id, notes]) => {
      const col = columns.find(c => c.id === id)!
      return { id, title: col.title, width: col.width, notes }
    }),
    noteCount,
    rounds: Object.keys(history).length,
    people: Object.entries(people)
      .filter(([, p]) => p.name)
      .map(([id, p]) => ({ id, name: p.name, color: colorOf(id) })),
    lastActivity,
  }
}
