/**
 * Keep the server alive through socket-level noise.
 *
 * The signaling relay's clients drop abruptly all the time (page reloads,
 * sleeping laptops), which can surface as ECONNRESET in places we can't wrap.
 * This server is intentionally stateless — the only in-process state is the
 * relay's in-memory topic map — so logging and continuing is always safer
 * than letting Node's default kill the process for every room at once.
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
