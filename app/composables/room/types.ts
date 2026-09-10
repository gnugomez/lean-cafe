export interface ColumnItem {
  id: string
  title: string
  order: number
  width: number
  /** whether a bindable header doc exists — heading-first, see isHeaderDoc()
   * (the host creates/normalizes it lazily) */
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
