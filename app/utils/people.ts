// Vibrant per-person colors for avatars, author dots and cursors — the rest of
// the UI stays monochrome ink. oklch() lets wide-gamut (P3) screens render
// chroma that sRGB hex can't express; sRGB screens gamut-map it down.
// Golden-angle hue steps keep every prefix of the palette well spread, so
// slots claimed in order sit far apart on the hue wheel.
export const AVATAR_PALETTE = Array.from({ length: 16 }, (_, i) =>
  `oklch(0.66 0.22 ${Math.round((25 + i * 137.508) % 360)})`)

export function isPaletteIndex(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) < AVATAR_PALETTE.length
}

/** hash fallback for ids that never claimed a palette slot in the shared doc */
export function colorIndexFor(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % AVATAR_PALETTE.length
}

export function colorFor(id: string): string {
  return AVATAR_PALETTE[colorIndexFor(id)]!
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/**
 * Deterministic name-like placeholder shown (blurred) when authors are hidden —
 * stable for every viewer, unrelated to the real name.
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
