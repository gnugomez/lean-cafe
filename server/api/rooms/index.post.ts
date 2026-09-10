export default defineEventHandler((event) => {
  const { roomSecret } = useRuntimeConfig(event)
  const code = generateRoomCode(roomSecret)
  return { code, room: signalingRoomName(code, roomSecret) }
})
