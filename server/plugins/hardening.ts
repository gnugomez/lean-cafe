/**
 * Keep the server alive through socket-level noise: signaling clients drop
 * abruptly all the time (page reloads, sleeping laptops), surfacing as
 * ECONNRESET in places we can't wrap. The server is stateless apart from the
 * relay's in-memory topic map, so logging and continuing beats letting Node's
 * default kill the process — and every room with it.
 */
const BENIGN_CODES = new Set([
  'EPIPE',
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ERR_STREAM_DESTROYED',
  'ERR_STREAM_WRITE_AFTER_END',
  'UND_ERR_SOCKET',
])

function benignCode(err: unknown): string | null {
  const code = (err as { code?: string } | null)?.code
  return code && BENIGN_CODES.has(code) ? code : null
}

export default defineNitroPlugin(() => {
  process.on('unhandledRejection', (reason) => {
    const code = benignCode(reason)
    if (code) return console.warn(`[net] dropped connection (${code})`)
    console.error('[unhandledRejection]', reason)
  })
  process.on('uncaughtException', (error) => {
    const code = benignCode(error)
    if (code) return console.warn(`[net] dropped connection (${code})`)
    console.error('[uncaughtException]', error)
  })
})
