import * as Y from 'yjs'
import type { Ref } from 'vue'
import type { CardItem, StickerItem, VotingState } from './types'

/** bounds for user-drawn card sizes — shared by every writer/reader of w/h */
export const CARD_MIN_W = 160
export const CARD_MAX_W = 1200
export const CARD_MIN_H = 80
export const CARD_MAX_H = 1600

export const clampCardW = (w: number) => Math.round(Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, w)))
export const clampCardH = (h: number) => Math.round(Math.min(CARD_MAX_H, Math.max(CARD_MIN_H, h)))

/** optional size off an untrusted value: clamped, or undefined (= default look) */
export const cardSize = (v: unknown, clamp: (n: number) => number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v) : undefined

export function createRoomCards(opts: {
  doc: Y.Doc
  cardsMap: Y.Map<Y.Map<any>>
  columnsMap: Y.Map<Y.Map<any>>
  stickersMap: Y.Map<StickerItem>
  cards: Ref<CardItem[]>
  voting: Ref<VotingState>
  uid: string
  name: Ref<string>
}) {
  const { doc, cardsMap, columnsMap, stickersMap, cards, voting, uid, name } = opts

  function cardsForColumn(columnId: string): CardItem[] {
    // stable DOM order; visual stacking is handled by each note's z
    return cards.value
      .filter(c => c.columnId === columnId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  /** set when addCard creates an empty card so its editor opens immediately */
  const autoEditCardId = ref<string | null>(null)

  /** create a note; at (x, y) when given (e.g. double-click on the board),
   * otherwise cascaded so new notes don't fully cover each other; w/h only
   * when the note was drawn to a size (absent = default look) */
  function addCard(columnId: string, x?: number, y?: number, w?: number, h?: number): string | null {
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
    if (w !== undefined) card.set('w', clampCardW(w))
    if (h !== undefined) card.set('h', clampCardH(h))
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
    doc.transact(() => {
      cardsMap.delete(id)
      // stickers stuck to the card go with it (entries may be peer junk)
      const doomed: string[] = []
      stickersMap.forEach((s, sid) => {
        if ((s as StickerItem | null)?.cardId === id) doomed.push(sid)
      })
      doomed.forEach(sid => stickersMap.delete(sid))
    })
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

  /** resize a note; the stored height is a minimum, so text can still grow it */
  function resizeCard(cardId: string, w: number, h: number) {
    const card = cardsMap.get(cardId)
    if (!card) return
    const cw = clampCardW(w)
    const ch = clampCardH(h)
    doc.transact(() => {
      if (card.get('w') !== cw) card.set('w', cw)
      if (card.get('h') !== ch) card.set('h', ch)
    })
  }

  return { cardsForColumn, autoEditCardId, addCard, bodyFragment, updateCardText, removeCard, moveNote, resizeCard }
}
