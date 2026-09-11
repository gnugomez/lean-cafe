import type * as Y from 'yjs'
import type { Ref } from 'vue'
import type { StickerItem } from './types'

export const STICKER_MIN_SIZE = 24
export const STICKER_MAX_SIZE = 320
const STICKER_MAX_COORD = 100000
const STICKER_MAX_URL = 2048

export function clampStickerSize(size: number) {
  return Math.min(STICKER_MAX_SIZE, Math.max(STICKER_MIN_SIZE, size))
}

/** https + known GIPHY media hosts only: sticker entries are peer-writable,
 * and an arbitrary url would make every browser in the room fetch it */
export function isAllowedStickerUrl(url: string): boolean {
  if (typeof url !== 'string' || !url || url.length > STICKER_MAX_URL) return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  return u.protocol === 'https:' && /^(media\d*|i)\.giphy\.com$/.test(u.hostname)
}

/**
 * Untrusted sticker entry (a peer's doc write or an imported file) → clean
 * StickerItem, or null. Shared by doc.ts rebuild() and transfer.ts so both
 * paths clamp and allowlist identically.
 */
export function sanitizeSticker(raw: unknown): StickerItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = raw as Record<string, unknown>
  if (typeof s.id !== 'string' || !s.id || s.id.length > 64) return null
  if (typeof s.url !== 'string' || !isAllowedStickerUrl(s.url)) return null
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const size = num(s.size)
  const rot = num(s.rot)
  const x = num(s.x)
  const y = num(s.y)
  if (size === null || rot === null || x === null || y === null) return null
  const columnId = typeof s.columnId === 'string' && s.columnId ? s.columnId.slice(0, 64) : undefined
  const cardId = typeof s.cardId === 'string' && s.cardId ? s.cardId.slice(0, 64) : undefined
  if (!!columnId === !!cardId) return null // exactly one anchor
  const clean: StickerItem = {
    id: s.id,
    url: s.url,
    size: Math.round(clampStickerSize(size)),
    rot: Math.round(Math.min(180, Math.max(-180, rot))),
    x: Math.round(Math.min(STICKER_MAX_COORD, Math.max(-STICKER_MAX_COORD, x))),
    y: Math.round(Math.min(STICKER_MAX_COORD, Math.max(-STICKER_MAX_COORD, y))),
  }
  if (columnId) clean.columnId = columnId
  else clean.cardId = cardId
  return clean
}

/** stickers are reactions: anyone may add or remove, no owner or voting gate */
export function createRoomStickers(opts: {
  stickersMap: Y.Map<StickerItem>
  stickers: Ref<StickerItem[]>
}) {
  const { stickersMap, stickers } = opts

  function stickersForColumn(columnId: string): StickerItem[] {
    return stickers.value.filter(s => s.columnId === columnId)
  }

  function stickersForCard(cardId: string): StickerItem[] {
    return stickers.value.filter(s => s.cardId === cardId)
  }

  function addSticker(s: Omit<StickerItem, 'id'>): string | null {
    const id = genId()
    // same validator the readers use — never write what they would drop
    const clean = sanitizeSticker({ ...s, id })
    if (!clean) return null
    stickersMap.set(id, clean)
    return id
  }

  function removeSticker(id: string) {
    stickersMap.delete(id)
  }

  return { stickersForColumn, stickersForCard, addSticker, removeSticker }
}
