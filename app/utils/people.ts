// Vibrant per-person colors (Excalidraw-style palette) for avatars and
// card author dots — the rest of the UI stays monochrome ink.
export const AVATAR_PALETTE = [
  '#e03131', '#1971c2', '#2f9e44', '#f08c00',
  '#6741d9', '#0c8599', '#d6336c', '#e8590c',
]

export function colorFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]!
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/**
 * Deterministic name-like placeholder shown (blurred) when authors are hidden.
 * Seeded by the card id — stable for every viewer, unrelated to the real name.
 */
export function fakeNameFor(seed: string, length: number): string {
  const consonants = 'bcdfghklmnprstvw'
  const vowels = 'aeiou'
  const len = Math.min(Math.max(length, 4), 14)
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  let out = ''
  for (let i = 0; i < len; i++) {
    h = (h * 1103515245 + 12345) >>> 0
    const set = i % 2 === 0 ? consonants : vowels
    out += set[(h >>> 16) % set.length]
  }
  return out[0]!.toUpperCase() + out.slice(1)
}
