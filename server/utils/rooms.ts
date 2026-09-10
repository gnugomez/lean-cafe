import { createHmac, randomInt } from 'node:crypto'

// Unambiguous alphabet: no 0/O, 1/I/L.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const CODE_LENGTH = 6 // 5 random chars + 1 check char

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

function checkChar(body: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(`check:${body}`).digest()
  return CODE_ALPHABET[digest[0]! % CODE_ALPHABET.length]!
}

export function generateRoomCode(secret: string): string {
  let body = ''
  for (let i = 0; i < CODE_LENGTH - 1; i++) {
    body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return body + checkChar(body, secret)
}

export function isValidRoomCode(code: string, secret: string): boolean {
  if (code.length !== CODE_LENGTH) return false
  for (const ch of code) {
    if (!CODE_ALPHABET.includes(ch)) return false
  }
  return code[CODE_LENGTH - 1] === checkChar(code.slice(0, CODE_LENGTH - 1), secret)
}

// The y-webrtc room name for a code. Derived, never stored — the server keeps
// no room state and never sees board content.
export function signalingRoomName(code: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(`room:${code}`).digest('hex')
  return `leancafe-${digest.slice(0, 20)}`
}
