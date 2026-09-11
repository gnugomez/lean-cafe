export function getStored(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}

export function setStored(key: string, value: string) {
  try { window.localStorage.setItem(key, value) } catch { /* private mode etc. */ }
}

export function removeStored(key: string) {
  try { window.localStorage.removeItem(key) } catch { /* ignore */ }
}

/** every key in this browser's store — the room list is rebuilt from them */
export function storedKeys(): string[] {
  try {
    const ls = window.localStorage
    return Array.from({ length: ls.length }, (_, i) => ls.key(i))
      .filter((k): k is string => k !== null)
  } catch { return [] }
}
