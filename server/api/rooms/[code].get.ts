export default defineEventHandler((event) => {
  const { roomSecret } = useRuntimeConfig(event)
  const code = normalizeCode(getRouterParam(event, 'code') || '')
  if (!isValidRoomCode(code, roomSecret)) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown room code' })
  }
  return { code, room: signalingRoomName(code, roomSecret) }
})
