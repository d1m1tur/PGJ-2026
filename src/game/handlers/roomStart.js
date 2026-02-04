import crypto from 'node:crypto';

import { USER_START_TIMEOUT_MS } from '../constants.js';
import { buildGrassMap, buildPenMap, generateSpawnIds } from '../utils.js';

export function handleRoomStart({ game, socket, payload }) {
  try {
    const roomId = game.getRoomIdForSocket(socket);
    if (!roomId) throw new Error('Not in a room');

    const room = game.getRoom(roomId);
    if (!room) throw new Error('Room not found');

    if (room.hostId && room.hostId !== socket.id) throw new Error('Only host can start');

    if (room.started || room.starting || room.ended) return;

    room.starting = true;
    room.startId = crypto.randomUUID();
    room.pendingStartAcks = new Set(room.state.players.keys());
    const seed = Number.isFinite(payload?.seed) ? payload.seed : Date.now();
    room.state.mapSeed = seed;
    const grassIds = Array.isArray(payload?.grass) && payload.grass.length
      ? payload.grass
      : generateSpawnIds(seed, 24, 101);
    const penIds = Array.isArray(payload?.pens) && payload.pens.length
      ? payload.pens
      : generateSpawnIds(seed, 4, 707);
    room.state.grass = buildGrassMap(grassIds);
    room.state.pens = buildPenMap(penIds);
    game.broadcastRoomStart(roomId, room.startId, Date.now() + USER_START_TIMEOUT_MS);

    room.startTimeout = setTimeout(() => {
      game.finalizeRoomStart(roomId);
    }, USER_START_TIMEOUT_MS);
    room.startTimeout.unref?.();
  } catch {
    // Ignore invalid start requests
  }
}
