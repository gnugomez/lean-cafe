/**
 * The rooms this browser has been in. Nothing about them lives on a server, so
 * the list is rebuilt from what the room itself already leaves behind: one
 * `leancafe:<CODE>:*` key per room in localStorage, plus the board cached in
 * IndexedDB (`leancafe-<CODE>`, written by y-indexeddb).
 */

/** per-room keys, all of them local to this browser */
const ROOM_KEYS = ['uid', 'name', 'owner', 'seed', 'opened', 'voter', 'viewRound'] as const
const ROOM_KEY_RE = new RegExp(`^leancafe:([0-9A-Z]{4,12}):(?:${ROOM_KEYS.join('|')})$`)

export interface StoredSession {
  code: string
  /** epoch ms of the last visit, or 0 for rooms opened before we kept track */
  lastOpened: number
  /** this browser holds the room's owner token */
  host: boolean
}

/** note a visit — the room page calls this once the code checks out */
export function rememberSession(code: string) {
  setStored(`leancafe:${code}:opened`, String(Date.now()))
}

/** every room this browser knows about, most recently opened first */
export function listSessions(): StoredSession[] {
  const codes = new Set<string>()
  for (const key of storedKeys()) {
    const code = key.match(ROOM_KEY_RE)?.[1]
    if (code) codes.add(code)
  }
  return [...codes]
    .map(code => ({
      code,
      lastOpened: Number(getStored(`leancafe:${code}:opened`)) || 0,
      host: !!getStored(`leancafe:${code}:owner`),
    }))
    .sort((a, b) => b.lastOpened - a.lastOpened || a.code.localeCompare(b.code))
}

/**
 * Drop every trace of a room from this browser: the local identity keys and the
 * cached board itself. The room lives on for anyone who still has a copy — but
 * if this was the last one, it's gone for good.
 */
export function forgetSession(code: string) {
  for (const key of ROOM_KEYS) removeStored(`leancafe:${code}:${key}`)
  try { indexedDB.deleteDatabase(`leancafe-${code}`) } catch { /* private mode etc. */ }
}
