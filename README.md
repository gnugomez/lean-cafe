# ☕ Lean Café

A shared [Lean Coffee](https://leancoffee.org/) board. Open a room, send the link, and run your discussion: add sticky notes, vote on what to talk about, and keep time. The board syncs straight between browsers — board content never touches a server.

## What you can do

- Put sticky notes anywhere on a column. Drag them around, or double-click empty space to add one right there.
- Write in the same note together, at the same time. Type `/` for blocks (headings, lists, tasks, quotes, code) or use markdown shortcuts. New notes open ready to type; an empty note deletes itself.
- Vote anonymously. The host starts a round with a vote budget, everyone spends their votes, and the results are ranked on the board and kept in a history anyone can browse.
- Host tools: a countdown timer, columns (add, rename, resize, delete, describe), hiding author names, and picking which round's results show on the cards.
- Refreshing is safe. The board is cached in your browser and re-syncs when you reconnect.
- Pick up where you left off. The home screen lists the sessions this browser has been in, each with a small map of the board, and lets you forget one when you're done with it.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, start a session, and open the invite link in a second browser to see the sync.

## Deploy

```bash
npm run build
node .output/server/index.mjs
```

Needs Node `^22.19.0 || ^24.11.0` (see `engines`). A multi-stage `Dockerfile` is included; the container listens on port 3000. Set `NUXT_ROOM_SECRET`, and make sure your proxy passes WebSocket connections through to `/signal`.

### Settings

| Env var | Default | What it does |
| --- | --- | --- |
| `NUXT_ROOM_SECRET` | dev secret | Signs room codes. Set a real one in production; changing it invalidates existing codes. |
| `NUXT_PUBLIC_SIGNALING` | *(empty — use built-in `/signal`)* | Comma-separated y-webrtc signaling server URLs, e.g. `wss://signaling.example.com`. |
| `NUXT_PUBLIC_ICE_SERVERS` | Google + Cloudflare STUN | JSON array of `RTCIceServer` entries. Add a TURN server for strict networks: `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]` |
| `NUXT_GIPHY_API_KEY` | *(empty — stickers off)* | [GIPHY API](https://developers.giphy.com/) key for the sticker tool. The key stays on the server; without one, the sticker picker just says it isn't set up. |

## How it works

The board lives in the participants' browsers and syncs peer-to-peer over WebRTC (Yjs + y-webrtc). The server never sees board content. It does two small jobs:

- **Room codes.** Codes carry their own checksum, so the server can check them without storing anything — a room exists as soon as people meet in it.
- **The `/signal` relay.** Browsers use it once, to find each other. The handshake it relays is encrypted with a key derived from the room code, so the relay can't read it. Any y-webrtc signaling server works instead (`NUXT_PUBLIC_SIGNALING`).

Each browser keeps a local copy of the board (IndexedDB), so a refresh or a dropped connection loses nothing. The home screen reads those copies to list your past sessions — they never leave the device, so the list differs from browser to browser. If every participant clears their browser storage, the board is gone — that's the point.

## If sync doesn't work

- Two windows of the **same browser profile** sync directly, even offline — that says nothing about WebRTC. Test with two different browsers or machines.
- **"ICE failed, add a TURN server"** in the console: the browsers found each other but couldn't open a direct connection, usually a VPN or firewall blocking UDP. Try without the VPN, or set a TURN server in `NUXT_PUBLIC_ICE_SERVERS` — TURN only relays encrypted traffic, so board content stays private.
- `patches/y-webrtc+10.3.0.patch` (applied on `npm install`) fixes an upstream crash that broke reconnects after a failed connection attempt.

## License

[Eclipse Public License 2.0](LICENSE) (SPDX: `EPL-2.0`).
