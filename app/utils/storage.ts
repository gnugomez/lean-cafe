export function getStored(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}

export function setStored(key: string, value: string) {
  try { window.localStorage.setItem(key, value) } catch { /* private mode etc. */ }
}

export function removeStored(key: string) {
  try { window.localStorage.removeItem(key) } catch { /* ignore */ }
}
