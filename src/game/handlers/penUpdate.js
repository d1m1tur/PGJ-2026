export function handlePenUpdate({ game, socket, payload }) {
  const room = game.getRoomForSocket(socket);
  if (!room || !room.started || room.ended) return;

  const player = room.state.players.get(socket.id);
  if (!player || !player.isAlive) return;

  const penId = payload?.penId;
  const validPenId = typeof penId === 'string' && room.state.pens.has(penId) ? penId : null;
  const nextInPen = Boolean(payload?.inPen) && Boolean(validPenId);

  player.inPen = nextInPen;
  player.penId = nextInPen ? validPenId : null;
}
