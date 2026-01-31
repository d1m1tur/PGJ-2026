import crypto from 'node:crypto';

import { Player } from './entities/Player.js';

const TICK_RATE_HZ = 20;
const WORLD = {
  width: 800,
  height: 450
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomColor() {
  const bytes = crypto.randomBytes(3);
  return `#${bytes.toString('hex')}`;
}

function countWolves(room) {
  let wolves = 0;
  for (const p of room.players.values()) {
    if (p.role === 'wolf') wolves += 1;
  }
  return wolves;
}

function chooseRoleForJoin(room) {
  // Prototype-friendly heuristic:
  // - Keep imposters rare
  // - Allow at least 1 wolf once a room has a few players
  const playerCountAfterJoin = room.players.size + 1;
  const wolvesNow = countWolves(room);

  // Ensure at least one wolf once the room reaches 4+ players
  if (playerCountAfterJoin >= 4 && wolvesNow === 0) return 'wolf';

  // Cap wolf density to about 1 per 5 players
  const maxWolves = Math.max(1, Math.floor(playerCountAfterJoin / 5));
  if (wolvesNow >= maxWolves) return 'sheep';

  // Otherwise, small chance to join as wolf
  return Math.random() < 0.2 ? 'wolf' : 'sheep';
}

function safeRoomId(roomId) {
  if (typeof roomId !== 'string') return null;
  const trimmed = roomId.trim();
  if (!trimmed) return null;
  // Keep room ids simple and URL-safe
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(trimmed)) return null;
  return trimmed;
}

function safeName(name) {
  if (typeof name !== 'string') return 'Player';
  const trimmed = name.trim().slice(0, 24);
  return trimmed || 'Player';
}

export function createGame({ sendToSocket }) {
  const rooms = new Map(); // roomId -> { players: Map(socketId->Player), sockets: Map(socketId->socket), lastUpdateMs }
  const playerRoom = new Map(); // socketId -> roomId

  function getOrCreateRoom(roomId) {
    let room = rooms.get(roomId);
    if (!room) {
      room = {
        players: new Map(),
        sockets: new Map(),
        lastUpdateMs: Date.now()
      };
      rooms.set(roomId, room);
    }
    return room;
  }

  function serializeRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return { roomId, world: WORLD, players: [] };

    return {
      roomId,
      world: WORLD,
      players: [...room.players.values()].map((p) => p.serialize())
    };
  }

  function joinRoom({ socket, roomId, name }) {
    const cleanRoomId = safeRoomId(roomId);
    if (!cleanRoomId) throw new Error('Invalid roomId (use letters/numbers/_/- up to 32 chars)');

    const cleanName = safeName(name);

    // If already in a room, leave it first
    leave({ socket });

    const room = getOrCreateRoom(cleanRoomId);

    const role = chooseRoleForJoin(room);

    const player = new Player({
      id: socket.id,
      name: cleanName,
      role,
      appearance: 'sheep',
      color: randomColor(),
      x: 100 + Math.random() * (WORLD.width - 200),
      y: 100 + Math.random() * (WORLD.height - 200)
    });

    room.players.set(socket.id, player);
    room.sockets.set(socket.id, socket);
    playerRoom.set(socket.id, cleanRoomId);

    broadcastRoom(cleanRoomId);

    return { roomId: cleanRoomId, playerId: socket.id, world: WORLD };
  }

  function leave({ socket }) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      room.players.delete(socket.id);
      room.sockets.delete(socket.id);
      if (room.players.size === 0) {
        rooms.delete(roomId);
      } else {
        broadcastRoom(roomId);
      }
    }

    playerRoom.delete(socket.id);
  }

  function handleInput({ socket, input }) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    player.setInput(input);
  }

  function tickRoom(roomId, room, dtSec) {
    for (const player of room.players.values()) {
      player.update(dtSec, WORLD);
    }

    broadcastRoom(roomId);
  }

  function broadcastRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const state = serializeRoom(roomId);

    for (const socket of room.sockets.values()) {
      sendToSocket(socket, 'room:state', state);
    }
  }

  let intervalHandle = null;

  function start() {
    if (intervalHandle) return;

    const tickMs = Math.floor(1000 / TICK_RATE_HZ);

    intervalHandle = setInterval(() => {
      const now = Date.now();

      for (const [roomId, room] of rooms.entries()) {
        const dtMs = now - room.lastUpdateMs;
        room.lastUpdateMs = now;
        const dtSec = Math.min(0.25, Math.max(0, dtMs / 1000));

        tickRoom(roomId, room, dtSec);
      }
    }, tickMs);

    // Keep Node from hanging on shutdown in some environments
    intervalHandle.unref?.();
  }

  function stop() {
    if (!intervalHandle) return;
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  return {
    start,
    stop,
    joinRoom,
    leave,
    handleInput
  };
}
