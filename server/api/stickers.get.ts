interface GiphyRendition { url?: string, webp?: string }
interface GiphyItem { id?: string, images?: Record<string, GiphyRendition | undefined> }
interface GiphyPagination { total_count?: number, count?: number, offset?: number }

/** smallest useful file per rendition — webp when GIPHY provides one */
function pick(r: GiphyRendition | undefined): string | null {
  if (!r || typeof r !== 'object') return null
  if (typeof r.webp === 'string' && r.webp) return r.webp
  if (typeof r.url === 'string' && r.url) return r.url
  return null
}

/**
 * Sticker search for the picker, proxying the GIPHY Stickers API so the key
 * never reaches the browser. `q` searches, no `q` returns trending; `offset`
 * pages. The response is { items: [{ id, url, preview }], hasMore }.
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
  const rawOffset = Number(query.offset)
  // GIPHY caps search paging at 4999
  const offset = Number.isFinite(rawOffset) ? Math.min(4999, Math.max(0, Math.round(rawOffset))) : 0
  let items: GiphyItem[]
  let pagination: GiphyPagination | undefined
  try {
    const res = await $fetch<{ data?: GiphyItem[], pagination?: GiphyPagination }>(
      q ? 'https://api.giphy.com/v1/stickers/search' : 'https://api.giphy.com/v1/stickers/trending',
      { query: { api_key: giphyApiKey, limit, offset, rating: 'g', ...(q ? { q } : {}) }, timeout: 8000 },
    )
    items = Array.isArray(res?.data) ? res.data : []
    pagination = res?.pagination
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Sticker search unavailable',
      message: 'Sticker search is unavailable right now — try again in a moment.',
    })
  }
  const mapped = items.flatMap((item) => {
    const url = pick(item?.images?.fixed_width) // ~200px wide
    const preview = pick(item?.images?.fixed_width_small) || url // ~100px wide
    if (typeof item?.id !== 'string' || !item.id || !url || !preview) return []
    return [{ id: item.id, url, preview }]
  })
  // a short page means GIPHY ran out; otherwise trust the reported total
  const total = pagination?.total_count
  const hasMore = items.length >= limit
    && offset + items.length < Math.min(typeof total === 'number' ? total : Infinity, 5000)
  return { items: mapped, hasMore }
}, {
  maxAge: 300,
  swr: false,
  // default keys drop the query string; q/limit/offset are the whole response
  getKey: (event) => {
    const query = getQuery(event)
    const q = String(query.q ?? '').trim().slice(0, 100).toLowerCase()
    return `stickers:${encodeURIComponent(q)}:${String(query.limit ?? '')}:${String(query.offset ?? '')}`
  },
})
