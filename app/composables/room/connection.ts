import type * as Y from 'yjs'
import type { Ref } from 'vue'
import type { WebrtcProvider } from 'y-webrtc'
import type { IndexeddbPersistence } from 'y-indexeddb'
import type { RemotePointer } from './types'

export function createRoomConnection(opts: {
  code: string
  roomName: string
  doc: Y.Doc
  uid: string
  myColor: string
  name: Ref<string>
  /** runs once the local cache has loaded, before the provider connects */
  onLoaded: () => void
}) {
  const { code, roomName, doc, uid, myColor, name, onLoaded } = opts
  const config = useRuntimeConfig()

  const connected = ref(false) // signaling reachable
  const loaded = ref(false) // local IndexedDB cache loaded
  const peerCount = ref(0) // direct WebRTC peers
  const onlineIds = ref<string[]>([uid])
  /** live cursors of other participants (awareness only, never persisted) */
  const pointers = ref<RemotePointer[]>([])

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
    provider?.awareness.setLocalStateField('user', { id: uid, name: name.value || 'Anonymous', color: myColor })
  }

  function refreshOnline() {
    if (!provider) return
    const ids = new Set<string>([uid])
    const pts: RemotePointer[] = []
    provider.awareness.getStates().forEach((state) => {
      const user = state?.user
      if (!user?.id) return
      ids.add(user.id)
      if (user.id !== uid && state.pointer) {
        pts.push({
          id: user.id,
          name: user.name || 'Anonymous',
          x: state.pointer.x,
          y: state.pointer.y,
        })
      }
    })
    onlineIds.value = [...ids]
    pointers.value = pts
  }

  let lastPointerSent = 0
  /** broadcast this client's cursor in board-content coordinates (null = left the board) */
  function setPointer(x: number | null, y = 0) {
    if (!provider) return
    if (x === null) {
      provider.awareness.setLocalStateField('pointer', null)
      return
    }
    const now = Date.now()
    if (now - lastPointerSent < 60) return
    lastPointerSent = now
    provider.awareness.setLocalStateField('pointer', { x: Math.round(x), y: Math.round(y) })
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
    connect,
    destroy,
    setPointer,
    setAwarenessUser,
  }
}
