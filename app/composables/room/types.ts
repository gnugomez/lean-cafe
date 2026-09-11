export interface ColumnItem {
  id: string
  title: string
  order: number
  width: number
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
  /** user-drawn size in content px, shared; absent = default look (220px wide, auto height) */
  w?: number
  h?: number
}

/** an image reaction stamped on the board; a plain object in the doc (no Y types) */
export interface StickerItem {
  id: string
  /** GIPHY media URL — allowlisted in room/stickers.ts, peers are untrusted */
  url: string
  /** rendered width in content px; height follows the image's aspect ratio */
  size: number
  /** rotation in degrees, -180..180 */
  rot: number
  /** anchored to a column canvas: x/y = top-left in content px … */
  columnId?: string
  /** … or stuck to a card: x/y = offset from the card's top-left (may be negative) */
  cardId?: string
  x: number
  y: number
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
  /** column whose canvas the cursor is over; coordinates are that column's content px */
  col: string
  x: number
  y: number
}

export interface RemoteSelection {
  id: string
  cardIds: string[]
}

/** a peer's live rubber-band rectangle, in column content px */
export interface RemoteMarquee {
  id: string
  col: string
  x: number
  y: number
  w: number
  h: number
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
