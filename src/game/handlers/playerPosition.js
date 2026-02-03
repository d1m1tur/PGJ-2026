export function handlePlayerPosition({ game, socket, payload }) {
  const room = game.getRoomForSocket(socket);
  if (!room || !room.started || room.ended) return;

  const player = room.state.players.get(socket.id);
  if (!player) return;

  const x = Number.isFinite(payload?.x) ? payload.x : player.x;
  const y = Number.isFinite(payload?.y) ? payload.y : player.y;
  const z = Number.isFinite(payload?.z) ? payload.z : player.z;

  player.x = x;
  player.y = y;
  player.z = z;
}
