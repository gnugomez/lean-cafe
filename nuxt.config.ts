import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxt/icon', '@vueuse/nuxt'],
  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // Secret used to derive room-code checksums and signaling room names.
    // Override in production with NUXT_ROOM_SECRET.
    roomSecret: 'lean-cafe-dev-secret',
    // GIPHY API key for the sticker picker, kept server-side (/api/stickers
    // proxies the search). Empty = sticker search off with a friendly 503.
    // Override with NUXT_GIPHY_API_KEY.
    giphyApiKey: '',
    public: {
      // Comma-separated list of y-webrtc signaling servers. Empty = use this
      // app's own built-in relay at /signal. Override with NUXT_PUBLIC_SIGNALING.
      signaling: '',
      // JSON array of RTCIceServer entries. Add a TURN server here if peers
      // sit behind restrictive NATs/VPNs. Override with NUXT_PUBLIC_ICE_SERVERS.
      iceServers: '[{"urls":["stun:stun.l.google.com:19302","stun:stun.cloudflare.com:3478"]}]',
    },
  },

  nitro: {
    experimental: {
      // WebSocket support for the built-in signaling relay (server/routes/signal.ts)
      websocket: true,
    },
  },

  routeRules: {
    // The board is peer-to-peer and browser-only: never rendered on the server.
    '/room/**': { ssr: false },
  },

  app: {
    head: {
      title: 'Lean Café',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Peer-to-peer Lean Coffee boards — no accounts, no server-side storage.' },
      ],
      link: [
        { rel: 'icon', href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>☕</text></svg>' },
      ],
    },
  },

  vite: {
    plugins: [
      // y-webrtc → simple-peer expects node globals/builtins in the browser bundle
      nodePolyfills({
        include: ['buffer', 'events', 'process', 'stream', 'util'],
        globals: { Buffer: true, global: true, process: true },
      }),
    ],
  },
})
