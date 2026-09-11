import type * as Y from 'yjs'
import type { Ref } from 'vue'
import type { WebrtcProvider } from 'y-webrtc'
import type { IndexeddbPersistence } from 'y-indexeddb'
import type { RemoteMarquee, RemotePointer, RemoteSelection } from './types'

export function createRoomConnection(opts: {
  code: string
  roomName: string
  doc: Y.Doc
  uid: string
  name: Ref<string>
  /** runs once the local cache has loaded, before the provider connects */
  onLoaded: () => void
}) {
  const { code, roomName, doc, uid, name, onLoaded } = opts
  const config = useRuntimeConfig()

  const connected = ref(false) // signaling reachable
  const loaded = ref(false) // local IndexedDB cache loaded
  const peerCount = ref(0) // direct WebRTC peers
  const onlineIds = ref<string[]>([uid])
  /** live cursors of other participants (awareness only, never persisted) */
  const pointers = ref<RemotePointer[]>([])
  /** other participants' live card selections and rubber-band rectangles */
  const remoteSelections = ref<RemoteSelection[]>([])
  const remoteMarquees = ref<RemoteMarquee[]>([])

  let provider: WebrtcProvider | null = null
  let persistence: IndexeddbPersistence | null = null
  let destroyed = false

  async function connect() {
    if (import.meta.server || provider || destroyed) return
    const [{ WebrtcProvider }, { IndexeddbPersistence }] = await Promise.all([
      import('y-webrtc'),
      import('y-indexeddb'),
    ])
    if (destroyed) return

    // Local cache is best-effort: without IndexedDB (some private-browsing
    // modes) the board still works, it just won't survive a reload alone.
    // y-indexeddb's whenSynced never settles when the DB fails to open; its
    // _db rejection is the only failure signal, so race the two.
    try {
      const idb = new IndexeddbPersistence(`leancafe-${code}`, doc)
      persistence = idb
      await Promise.race([idb.whenSynced, idb._db.then(() => idb.whenSynced)])
    } catch (err) {
      console.warn('[lean-cafe] IndexedDB unavailable, the board is not cached locally', err)
      persistence?.destroy().catch(() => {}) // detaches doc listeners; rejects with the same open error
      persistence = null
    }
    if (destroyed) return
    loaded.value = true
    onLoaded()

    const configured = String(config.public.signaling || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const signaling = configured.length
      ? configured
      : [`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/signal`]

    // Both branches below are only reachable when NUXT_PUBLIC_ICE_SERVERS is
    // overridden with something broken — warn instead of masking the misconfig.
    let iceServers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }]
    try {
      const parsed = JSON.parse(String(config.public.iceServers))
      if (Array.isArray(parsed) && parsed.length) iceServers = parsed
      else console.warn('[lean-cafe] iceServers config is not a non-empty array, using the STUN fallback')
    } catch {
      console.warn('[lean-cafe] iceServers config is not valid JSON, using the STUN fallback')
    }

    provider = new WebrtcProvider(roomName, doc, {
      signaling,
      // The signaling server only relays encrypted handshakes for this room.
      password: `leancafe:${code}`,
      peerOpts: {
        config: { iceServers },
      },
    })
    provider.on('status', ({ connected: isConnected }) => {
      connected.value = isConnected
    })
    provider.on('peers', ({ webrtcPeers }) => {
      peerCount.value = webrtcPeers.length
    })
    setAwarenessUser()
    provider.awareness.on('change', refreshOnline)
    refreshOnline()
  }

  function setAwarenessUser() {
    provider?.awareness.setLocalStateField('user', { id: uid, name: name.value || 'Anonymous' })
  }

  function refreshOnline() {
    if (!provider) return
    const ids = new Set<string>([uid])
    const pts: RemotePointer[] = []
    const sels: RemoteSelection[] = []
    const mqs: RemoteMarquee[] = []
    // awareness states are peer-controlled: check types and clamp coordinates
    // so a hostile peer can't blow up the UI (canvases clip, but be strict)
    const coord = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(100000, Math.max(-100000, v)) : null
    const size = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(200000, Math.max(0, v)) : null
    provider.awareness.getStates().forEach((state) => {
      const user = state?.user
      if (typeof user?.id !== 'string' || !user.id) return
      ids.add(user.id)
      if (user.id === uid) return
      if (state.pointer) {
        const x = coord(state.pointer.x)
        const y = coord(state.pointer.y)
        const col = state.pointer.col
        if (x !== null && y !== null && typeof col === 'string' && col) {
          pts.push({
            id: user.id,
            name: (typeof user.name === 'string' && user.name.slice(0, 32)) || 'Anonymous',
            col: col.slice(0, 64),
            x,
            y,
          })
        }
      }
      if (Array.isArray(state.select)) {
        const cardIds = state.select
          .filter((s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 64)
          .slice(0, 200)
        if (cardIds.length) sels.push({ id: user.id, cardIds })
      }
      const mq = state.marquee
      if (mq && typeof mq.col === 'string' && mq.col) {
        const x = coord(mq.x)
        const y = coord(mq.y)
        const w = size(mq.w)
        const h = size(mq.h)
        if (x !== null && y !== null && w !== null && h !== null) {
          mqs.push({ id: user.id, col: mq.col.slice(0, 64), x, y, w, h })
        }
      }
    })
    onlineIds.value = [...ids]
    pointers.value = pts
    remoteSelections.value = sels
    remoteMarquees.value = mqs
  }

  let lastPointerSent = 0
  /** broadcast this client's cursor in column-content coordinates (null = left the canvas) */
  function setPointer(col: string | null, x = 0, y = 0) {
    if (!provider) return
    if (col === null) {
      provider.awareness.setLocalStateField('pointer', null)
      return
    }
    const now = Date.now()
    if (now - lastPointerSent < 60) return
    lastPointerSent = now
    provider.awareness.setLocalStateField('pointer', { col, x: Math.round(x), y: Math.round(y) })
  }

  /** broadcast which cards this client has selected */
  function setSelection(cardIds: string[]) {
    provider?.awareness.setLocalStateField('select', cardIds.length ? cardIds.slice(0, 200) : null)
  }

  let lastMarqueeSent = 0
  /** broadcast this client's rubber-band rectangle in column-content px (null = done) */
  function setMarquee(col: string | null, x = 0, y = 0, w = 0, h = 0) {
    if (!provider) return
    if (col === null) {
      provider.awareness.setLocalStateField('marquee', null)
      return
    }
    const now = Date.now()
    if (now - lastMarqueeSent < 60) return
    lastMarqueeSent = now
    provider.awareness.setLocalStateField('marquee', {
      col,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
    })
  }

  function destroy() {
    destroyed = true
    provider?.destroy()
    provider = null
    persistence?.destroy()
    persistence = null
  }

  return {
    connected,
    loaded,
    peerCount,
    onlineIds,
    pointers,
    remoteSelections,
    remoteMarquees,
    connect,
    destroy,
    setPointer,
    setSelection,
    setMarquee,
    setAwarenessUser,
  }
}
