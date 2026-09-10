/**
 * Minimal y-webrtc signaling relay (same protocol as y-webrtc/bin/server.js).
 *
 * Peers subscribe to room-name topics and publish WebRTC handshake messages to
 * each other. Everything is held in memory and relayed as-is — no board data
 * ever reaches this endpoint, and the handshake payloads are additionally
 * end-to-end encrypted by y-webrtc's room password, so they are opaque here.
 */
import type { Peer } from 'crossws'

const topics = new Map<string, Set<Peer>>()
const peerTopics = new Map<string, Set<string>>()
const peers = new Map<string, Peer>()

const MAX_TOPICS_PER_PEER = 32
const MAX_TOPIC_LENGTH = 100

function send(peer: Peer, msg: unknown) {
  try {
    // send may fail synchronously or as a rejected promise (e.g. ECONNRESET
    // when a peer vanishes mid-relay) — swallow both; close() cleans up
    const result = peer.send(JSON.stringify(msg)) as unknown
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      ;(result as Promise<unknown>).catch(() => {})
    }
  } catch {
    // peer gone; close handler cleans up
  }
}

export default defineWebSocketHandler({
  open(peer) {
    peers.set(peer.id, peer)
    peerTopics.set(peer.id, new Set())
  },

  message(peer, message) {
    let msg: any
    try {
      msg = JSON.parse(message.text())
    } catch {
      return
    }
    if (!msg || typeof msg.type !== 'string') return

    switch (msg.type) {
      case 'subscribe': {
        const mine = peerTopics.get(peer.id)
        if (!mine) return
        for (const topicName of Array.isArray(msg.topics) ? msg.topics : []) {
          if (typeof topicName !== 'string' || topicName.length > MAX_TOPIC_LENGTH) continue
          if (mine.size >= MAX_TOPICS_PER_PEER) break
          let topic = topics.get(topicName)
          if (!topic) {
            topic = new Set()
            topics.set(topicName, topic)
          }
          topic.add(peer)
          mine.add(topicName)
        }
        break
      }
      case 'unsubscribe': {
        for (const topicName of Array.isArray(msg.topics) ? msg.topics : []) {
          if (typeof topicName !== 'string') continue
          const topic = topics.get(topicName)
          if (topic) {
            topic.delete(peer)
            if (!topic.size) topics.delete(topicName)
          }
          peerTopics.get(peer.id)?.delete(topicName)
        }
        break
      }
      case 'publish': {
        if (typeof msg.topic !== 'string') return
        const receivers = topics.get(msg.topic)
        if (receivers) {
          msg.clients = receivers.size
          receivers.forEach(receiver => send(receiver, msg))
        }
        break
      }
      case 'ping':
        send(peer, { type: 'pong' })
        break
    }
  },

  error(peer, error) {
    // abrupt disconnects (ECONNRESET etc.) are normal churn, not failures
    console.warn('[signal] peer error:', (error as any)?.message || error)
  },

  close(peer) {
    const mine = peerTopics.get(peer.id)
    if (mine) {
      for (const topicName of mine) {
        const topic = topics.get(topicName)
        if (topic) {
          topic.delete(peer)
          if (!topic.size) topics.delete(topicName)
        }
      }
    }
    peerTopics.delete(peer.id)
    peers.delete(peer.id)
  },
})
