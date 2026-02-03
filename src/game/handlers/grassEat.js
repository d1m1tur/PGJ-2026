export function handleGrassEat({ game, socket, payload }) {
  const room = game.getRoomForSocket(socket);
  if (!room || !room.started || room.ended) return;

  const grassId = payload?.grassId;
  const grass = room.state.grass.get(grassId);
  if (!grass) return;

  grass.setHealth(grass.health - 1);

  const player = room.state.players.get(socket.id);
  if (player && player.role === 'sheep' && player.isAlive) {
    const eaten = room.state.stats.grassEatenByPlayer.get(socket.id) ?? 0;
    room.state.stats.grassEatenByPlayer.set(socket.id, eaten + 1);
  }

  if (grass.health > 0) return;

  room.state.grass.delete(grassId);
  game.broadcastGrassEat(room.roomId, { grassId });
}
