export function handleRoomStartAck({ game, socket, payload }) {
  const room = game.getRoomForSocket(socket);
  if (!room || !room.starting || room.startId !== payload?.startId) return;

  const player = room.state.players.get(socket.id);
  if (!player) return;

  const x = Number.isFinite(payload?.position?.x) ? payload.position.x : player.x;
  const y = Number.isFinite(payload?.position?.y) ? payload.position.y : player.y;
  const z = Number.isFinite(payload?.position?.z) ? payload.position.z : player.z;
  player.x = x;
  player.y = y;
  player.z = z;

  room.pendingStartAcks?.delete(socket.id);
  if (room.pendingStartAcks?.size === 0) {
    // game.finalizeRoomStart(room.roomId);
  }
}
