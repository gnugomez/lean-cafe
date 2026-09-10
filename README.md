# ☕ Lean Café

A lightweight, peer-to-peer [Lean Coffee](https://leancoffee.org/) board. Teams add
idea cards to columns, discuss, vote, and move cards around in real time —
**no board data ever touches a server**.

## How it works

- **Nuxt 4** serves the app shell and one tiny API: generating and validating
  short room codes. Codes are stateless (HMAC checksum + derived signaling room
  name), so the server stores nothing at all — not even the code.
- **Yjs** is the CRDT holding all board state: columns, cards, votes, names,
  timer, and ownership. Card bodies are collaborative rich text — a Tiptap
  editor bound per card to a `Y.XmlFragment` (Notion-style markdown shortcuts:
  `#` headings, `-` lists, `[ ]` task lists, `>` quotes, ``` code blocks) —
  so two people can type in the same card at once.
- Columns (add/rename/delete) can only be changed by the room host; anyone can
  add, edit, move and delete cards.
- **y-webrtc** syncs the Yjs doc directly between browsers over WebRTC. A
  signaling server is used only for the initial peer handshake (and the
  handshake payload is encrypted with a room-derived password, so the signaling
  server can't read it). By default the app uses its own built-in relay at
  `/signal` — the public `signaling.yjs.dev` server has been unreliable — but
  any y-webrtc-compatible server can be configured instead.
- **y-indexeddb** caches the doc locally so a refresh or dropped connection
  doesn't lose state. It's a cache, not a source of truth — peers re-merge on
  reconnect.

### Ownership

When you create a room, a random owner token is stored in your browser's
localStorage. The shared doc records that token (plus your participant id), so
peers can see who the host is and your browser can re-claim the host role after
a refresh. The host can start countdown timers and run voting rounds.

### Voting

The host starts a voting round with a chosen number of votes per person.
Voting is **anonymous**: each browser writes its allocation under a random
one-off voter key per round, so the shared doc never links votes to names —
the host only sees an anonymous "n/m voted" progress count. When the host ends
a round, cards are re-ordered in place (most-voted first per column) and a
snapshot of the results is archived. Past rounds are never cleared by new ones;
anyone can browse them via the Results popover, where the host can also delete
individual rounds. Cards keep showing the votes of the most recent round by
default: the host picks which round is displayed for everyone, and each
participant can locally override that (a different round, or hidden) or go back
to following the host.

The host can also toggle card-author visibility for the whole room — while
hidden, other people's names are replaced by a blurred placeholder (the real
name is not rendered at all).

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000, start a session, and open the invite link in a
second browser/profile to see the p2p sync.

## Production

```bash
npm run build
node .output/server/index.mjs
```

### Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NUXT_ROOM_SECRET` | dev secret | HMAC secret for room-code checksums and signaling room names. Set a real one in production; changing it invalidates existing codes. |
| `NUXT_PUBLIC_SIGNALING` | *(empty — use built-in `/signal`)* | Comma-separated y-webrtc signaling server URLs, e.g. `wss://signaling.example.com`. |
| `NUXT_PUBLIC_ICE_SERVERS` | Google + Cloudflare STUN | JSON array of `RTCIceServer` entries. Add a TURN server for restrictive networks: `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]` |

The built-in relay (`server/routes/signal.ts`) speaks the standard y-webrtc
signaling protocol: peers subscribe to a room topic and exchange encrypted
WebRTC handshakes through it. It keeps nothing but in-memory topic
subscriptions and never sees board content. To use an external server instead
(e.g. `node node_modules/y-webrtc/bin/server.js`), set
`NUXT_PUBLIC_SIGNALING=wss://your-host`.

## Troubleshooting sync

- **Two windows of the same browser profile** sync via `BroadcastChannel`, not
  WebRTC — that path always works, even offline. Cross-browser or
  cross-machine sync needs WebRTC to connect.
- **`WebRTC: ICE failed, add a TURN server`** in the console means the peers
  found each other through signaling but couldn't open a direct data channel.
  Typical culprits: a VPN or corporate firewall blocking UDP, or strict browser
  privacy settings. Check `about:webrtc` (Firefox) / `chrome://webrtc-internals`
  for candidate details, try without the VPN, or configure a TURN server via
  `NUXT_PUBLIC_ICE_SERVERS` — TURN only relays the encrypted stream, so board
  content still never leaves the peers in readable form.
- `patches/y-webrtc+10.3.0.patch` (applied automatically on `npm install`)
  fixes an upstream crash — `TypeError: existingConn is undefined` — that broke
  reconnection attempts after a failed ICE round.

## Notes & limits

- New cards open ready to type; leaving a card empty deletes it.
- UI icons come from `@nuxt/icon` with the Lucide collection bundled locally —
  no runtime calls to third-party icon CDNs.

- Room codes are validated by checksum, not by a registry — the server keeps no
  state, so a code "exists" as soon as peers meet in it.
- WebRTC connects directly between peers using public STUN; on very restrictive
  networks a TURN server would be needed (not configured by default).
- A room's board lives only in its participants' browsers (IndexedDB). If
  everyone clears their storage, the board is gone — that's by design.

## License

This project is licensed under the [Eclipse Public License 2.0](LICENSE)
(SPDX: `EPL-2.0`).
