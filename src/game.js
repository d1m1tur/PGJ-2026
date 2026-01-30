import crypto from 'node:crypto';

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

export function createGame({ io }) {
  const rooms = new Map(); // roomId -> { players: Map(socketId->player), lastUpdateMs }
  const playerRoom = new Map(); // socketId -> roomId

  function getOrCreateRoom(roomId) {
    let room = rooms.get(roomId);
    if (!room) {
      room = {
        players: new Map(),
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
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: Math.round(p.x),
        y: Math.round(p.y)
      }))
    };
  }

  function joinRoom({ socket, roomId, name }) {
    const cleanRoomId = safeRoomId(roomId);
    if (!cleanRoomId) throw new Error('Invalid roomId (use letters/numbers/_/- up to 32 chars)');

    const cleanName = safeName(name);

    // If already in a room, leave it first
    leave({ socket });

    const room = getOrCreateRoom(cleanRoomId);

    const player = {
      id: socket.id,
      name: cleanName,
      color: randomColor(),
      x: 100 + Math.random() * (WORLD.width - 200),
      y: 100 + Math.random() * (WORLD.height - 200),
      input: { up: false, down: false, left: false, right: false }
    };

    room.players.set(socket.id, player);
    playerRoom.set(socket.id, cleanRoomId);

    socket.join(cleanRoomId);

    io.to(cleanRoomId).emit('room:state', serializeRoom(cleanRoomId));

    return { roomId: cleanRoomId, playerId: socket.id, world: WORLD };
  }

  function leave({ socket }) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      room.players.delete(socket.id);
      if (room.players.size === 0) {
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit('room:state', serializeRoom(roomId));
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

    const next = input ?? {};

    player.input = {
      up: Boolean(next.up),
      down: Boolean(next.down),
      left: Boolean(next.left),
      right: Boolean(next.right)
    };
  }

  function tickRoom(roomId, room, dtSec) {
    const speed = 220; // pixels/sec

    for (const player of room.players.values()) {
      const vx = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
      const vy = (player.input.down ? 1 : 0) - (player.input.up ? 1 : 0);

      player.x = clamp(player.x + vx * speed * dtSec, 10, WORLD.width - 10);
      player.y = clamp(player.y + vy * speed * dtSec, 10, WORLD.height - 10);
    }

    io.to(roomId).emit('room:state', serializeRoom(roomId));
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
