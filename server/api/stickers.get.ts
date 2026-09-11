interface GiphyRendition { url?: string, webp?: string }
interface GiphyItem { id?: string, images?: Record<string, GiphyRendition | undefined> }

/** smallest useful file per rendition — webp when GIPHY provides one */
function pick(r: GiphyRendition | undefined): string | null {
  if (!r || typeof r !== 'object') return null
  if (typeof r.webp === 'string' && r.webp) return r.webp
  if (typeof r.url === 'string' && r.url) return r.url
  return null
}

/**
 * Sticker search for the picker, proxying the GIPHY Stickers API so the key
 * never reaches the browser. `q` searches, no `q` returns trending; the
 * response is a compact [{ id, url, preview }] list.
 */
export default defineCachedEventHandler(async (event) => {
  const { giphyApiKey } = useRuntimeConfig(event)
  if (!giphyApiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Stickers not configured',
      message: 'Sticker search is not set up on this server — it needs a GIPHY API key (NUXT_GIPHY_API_KEY).',
    })
  }
  const query = getQuery(event)
  const q = String(query.q ?? '').trim().slice(0, 100)
  const rawLimit = Number(query.limit)
  const limit = Number.isFinite(rawLimit) ? Math.min(30, Math.max(1, Math.round(rawLimit))) : 24
  let items: GiphyItem[]
  try {
    const res = await $fetch<{ data?: GiphyItem[] }>(
      q ? 'https://api.giphy.com/v1/stickers/search' : 'https://api.giphy.com/v1/stickers/trending',
      { query: { api_key: giphyApiKey, limit, rating: 'g', ...(q ? { q } : {}) }, timeout: 8000 },
    )
    items = Array.isArray(res?.data) ? res.data : []
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Sticker search unavailable',
      message: 'Sticker search is unavailable right now — try again in a moment.',
    })
  }
  return items.flatMap((item) => {
    const url = pick(item?.images?.fixed_width) // ~200px wide
    const preview = pick(item?.images?.fixed_width_small) || url // ~100px wide
    if (typeof item?.id !== 'string' || !item.id || !url || !preview) return []
    return [{ id: item.id, url, preview }]
  })
}, {
  maxAge: 300,
  swr: false,
  // default keys drop the query string; q/limit are the whole response
  getKey: (event) => {
    const query = getQuery(event)
    const q = String(query.q ?? '').trim().slice(0, 100).toLowerCase()
    return `stickers:${encodeURIComponent(q)}:${String(query.limit ?? '')}`
  },
})
