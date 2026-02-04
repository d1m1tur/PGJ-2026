export function broadcastRoom(game, roomId) {
  const room = game.getRoom(roomId);
  if (!room) return;

  const state = game.serializeRoom(roomId);

  for (const socket of room.sockets.values()) {
    game.sendToSocket(socket, 'RoomState', state);
  }
}

export function broadcastLobby(game, roomId) {
  const room = game.getRoom(roomId);
  if (!room) return;

  const payload = {
    roomId,
    players: [...room.state.players.values()].map((player) => player.name),
    started: Boolean(room.started),
    hostId: room.hostId ?? null,
  };

  for (const socket of room.sockets.values()) {
    game.sendToSocket(socket, 'RoomLobby', payload);
  }
}

export function broadcastRoomStart(game, roomId, startId, timeoutMs) {
  const room = game.getRoom(roomId);
  if (!room) return;

  const grassIds = [...room.state.grass.keys()];
  const penIds = [...room.state.pens.keys()];

  for (const socket of room.sockets.values()) {
    game.sendToSocket(socket, 'RoomStart', {
      roomId,
      startId,
      timeoutMs,
      grass: grassIds,
      pens: penIds,
      seed: room.state.mapSeed,
    });
  }
}

export function broadcastRoleAssignments(game, roomId) {
  const room = game.getRoom(roomId);
  if (!room) return;

  for (const [playerId, socket] of room.sockets.entries()) {
    const player = room.state.players.get(playerId);
    if (!player) continue;
    game.sendToSocket(socket, 'PlayerRole', { roomId, role: player.role });
  }
}

export function broadcastGrassEat(game, roomId, payload) {
  const room = game.getRoom(roomId);
  if (!room) return;

  for (const socket of room.sockets.values()) {
    game.sendToSocket(socket, 'GrassEat', payload);
  }
}

export function broadcastDayStart(game, roomId, day, dayEndsAt) {
  const room = game.getRoom(roomId);
  if (!room) return;

  for (const socket of room.sockets.values()) {
    game.sendToSocket(socket, 'DayStart', { roomId, day, dayEndsAt });
  }
}

export function broadcastDayEnd(game, roomId, day) {
  const room = game.getRoom(roomId);
  if (!room) return;

  for (const socket of room.sockets.values()) {
    game.sendToSocket(socket, 'DayEnd', { roomId, day });
  }
}

export function broadcastGameEnd(game, roomId, gameEndState) {
  const room = game.getRoom(roomId);
  if (!room) return;

  for (const socket of room.sockets.values()) {
    game.sendToSocket(socket, 'GameEnd', { roomId, ...gameEndState });
  }
}
