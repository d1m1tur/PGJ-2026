import crypto from 'node:crypto';

import { USER_START_TIMEOUT_MS } from '../constants.js';
import { buildGrassMap, buildPenMap } from '../utils.js';

export function handleRoomStart({ game, socket, payload }) {
  try {
    const roomId = game.getRoomIdForSocket(socket);
    if (!roomId) throw new Error('Not in a room');

    const room = game.getRoom(roomId);
    if (!room) throw new Error('Room not found');

    if (room.started || room.starting || room.ended) return;

    room.starting = true;
    room.startId = crypto.randomUUID();
    room.pendingStartAcks = new Set(room.state.players.keys());
    room.state.grass = buildGrassMap(payload?.grass);
    room.state.pens = buildPenMap(payload?.pens);
    game.broadcastRoomStart(roomId, room.startId, Date.now() + USER_START_TIMEOUT_MS);

    room.startTimeout = setTimeout(() => {
      game.finalizeRoomStart(roomId);
    }, USER_START_TIMEOUT_MS);
    room.startTimeout.unref?.();
  } catch {
    // Ignore invalid start requests
  }
}
