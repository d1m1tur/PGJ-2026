import { Player } from '../../entities/Player.js';
import { randomColor, safeName, safeRoomId } from '../utils.js';

export function handleRoomJoin({ game, socket, payload }) {
  const { roomId, name, requestId, create } = payload ?? {};
  try {
    const cleanRoomId = safeRoomId(roomId);
    if (!cleanRoomId) throw new Error('Invalid roomId (use letters/numbers/_/- up to 32 chars)');

    const cleanName = safeName(name);

    game.leave({ socket });

    const existingRoom = game.getRoom(cleanRoomId);
    if (create && existingRoom) {
      throw new Error('Room already exists');
    }

    const room = existingRoom ?? game.getOrCreateRoom(cleanRoomId);
    if (room.started || room.starting || room.ended) {
      throw new Error('Room already started');
    }

    const player = new Player({
      id: socket.id,
      name: cleanName,
      role: 'sheep',
      color: randomColor(),
      x: 0,
      y: 0,
      z: 0,
    });

    room.state.players.set(socket.id, player);
    room.sockets.set(socket.id, socket);
    game.playerRoom.set(socket.id, cleanRoomId);

    if (!room.hostId) {
      room.hostId = socket.id;
    }

    game.broadcastLobby(cleanRoomId);

    game.sendToSocket(socket, 'RoomJoinAck', {
      requestId,
      ok: true,
      roomId: cleanRoomId,
      playerId: socket.id,
      color: player.color,
    });
  } catch (err) {
    game.sendToSocket(socket, 'RoomJoinAck', {
      requestId,
      ok: false,
      error: err?.message ?? String(err),
    });
  }
}
