import crypto from 'node:crypto';

import { Grass } from './entities/Grass.js';
import { Pen } from './entities/Pen.js';
import { DeathReason, Player } from './entities/Player.js';
import { stat } from 'node:fs';

const TICK_RATE_HZ = 20;
const DEFAULT_DAY_LENGTH_MS = 60000;
const DEFAULT_TOTAL_DAYS = 5;
const GRASS_PER_SHEEP_PER_DAY = 3;
const USER_START_TIMEOUT_MS = 3000;
const GOD_MODE = false;

const GAME_END_REASONS = Object.freeze({
  WOLVES_ELIMINATED: 0,
  SHEEP_ELIMINATED: 1,
  SURVIVED_DAYS: 2,
});

function randomColor() {
  const bytes = crypto.randomBytes(3);
  const light = Array.from(bytes, (b) => Math.floor(160 + (b / 255) * 95));
  return `#${light.map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function chooseWolfCount(playerCount) {
  return 1;

  if (playerCount >= 4) return Math.max(1, Math.floor(playerCount / 5));
  return Math.random() < 0.2 ? 1 : 0;
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

export function createGame({ sendToSocket, dayLengthMs = DEFAULT_DAY_LENGTH_MS, totalDays = DEFAULT_TOTAL_DAYS }) {
  const rooms = new Map(); // roomId -> { players, sockets, grass, pens, lastUpdateMs, started, starting, startId, pendingStartAcks, startTimeout, currentDay, dayEndsAt, ended, dayLengthMs, totalDays, grassEatenByPlayer }
  const playerRoom = new Map(); // socketId -> roomId

  function getOrCreateRoom(roomId) {
    let room = rooms.get(roomId);
    if (!room) {
      room = {
        players: new Map(),
        sockets: new Map(),
        grass: new Map(),
        pens: new Map(),
        lastUpdateMs: Date.now(),
        started: false,
        starting: false,
        startId: null,
        pendingStartAcks: null,
        startTimeout: null,
        currentDay: 0,
        dayEndsAt: 0,
        ended: false,
        dayLengthMs,
        totalDays,
        grassEatenByPlayer: new Map()
      };
      rooms.set(roomId, room);
    }
    return room;
  }

  function serializeRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return { roomId, players: [] };

    return {
      roomId,
      started: Boolean(room.started),
      ended: Boolean(room.ended),
      day: room.currentDay,
      totalDays: room.totalDays,
      dayEndsAt: room.dayEndsAt,
      players: [...room.players.values()],
    };
  }

  function joinRoom({ socket, roomId, name }) {
    const cleanRoomId = safeRoomId(roomId);
    if (!cleanRoomId) throw new Error('Invalid roomId (use letters/numbers/_/- up to 32 chars)');

    const cleanName = safeName(name);

    // If already in a room, leave it first
    leave({ socket });

    const room = getOrCreateRoom(cleanRoomId);
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
      z: 0
    });

    room.players.set(socket.id, player);
    room.sockets.set(socket.id, socket);
    playerRoom.set(socket.id, cleanRoomId);

    broadcastLobby(cleanRoomId);

    return { roomId: cleanRoomId, playerId: socket.id };
  }

  function leave({ socket }) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      room.players.delete(socket.id);
      room.sockets.delete(socket.id);
      if (room.starting && room.pendingStartAcks) {
        room.pendingStartAcks.delete(socket.id);
        if (room.pendingStartAcks.size === 0) {
          finalizeRoomStart(roomId);
        }
      }
      if (room.players.size === 0) {
        clearRoomStart(room);
        rooms.delete(roomId);
      } else {
        broadcastLobby(roomId);
      }
    }

    playerRoom.delete(socket.id);
  }

  function removePlayerFromRoom(roomId, playerId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.players.delete(playerId);
    room.sockets.delete(playerId);
    room.pendingStartAcks?.delete(playerId);
    playerRoom.delete(playerId);
  }

  function handlePosition({ socket, position }) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    if (!room.started || room.ended) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    const x = Number.isFinite(position?.x) ? position.x : player.x;
    const y = Number.isFinite(position?.y) ? position.y : player.y;
    const z = Number.isFinite(position?.z) ? position.z : player.z;

    player.x = x;
    player.y = y;
    player.z = z;
  }

  function handlePenUpdate({ socket, inPen, penId }) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || !room.started || room.ended) return;

    const player = room.players.get(socket.id);
    if (!player || !player.isAlive) return;

    // const validPenId = typeof penId === 'string' && room.pens.has(penId) ? penId : null;
    validPenId = penId;
    const nextInPen = Boolean(inPen) && Boolean(validPenId);

    player.inPen = nextInPen;
    player.penId = nextInPen ? validPenId : null;
  }

  function handleGrassEat({ socket, grassId }) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || !room.started || room.ended) return;

    const grass = room.grass[grassId];
    if (!grass) return;

    grass.setHealth(grass.health - 1);

    const player = room.players.get(socket.id);
    if (player && player.role === 'sheep' && player.isAlive) {
      const eaten = room.grassEatenByPlayer.get(socket.id) ?? 0;
      room.grassEatenByPlayer.set(socket.id, eaten + 1);
    }

    if (grass.health > 0) return;

    delete room.grass[grassId];
    broadcastGrassEat(roomId, { grassId });
  }

  function startRoom({ socket, grass, pens }) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) throw new Error('Not in a room');

    const room = rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    if (room.started || room.starting || room.ended) return { roomId };

    room.starting = true;
    room.startId = crypto.randomUUID();
    room.pendingStartAcks = new Set(room.players.keys());
    room.grass = grass;
    room.pens = pens;
    broadcastRoomStart(roomId, room.startId, Date.now() + USER_START_TIMEOUT_MS);

    room.startTimeout = setTimeout(() => {
      finalizeRoomStart(roomId);
    }, USER_START_TIMEOUT_MS);
    room.startTimeout.unref?.();

    return { roomId };
  }

  function handleStartAck({ socket, startId, position }) {
    const roomId = playerRoom.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || !room.starting || room.startId !== startId) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    const x = Number.isFinite(position?.x) ? position.x : player.x;
    const y = Number.isFinite(position?.y) ? position.y : player.y;
    const z = Number.isFinite(position?.z) ? position.z : player.z;
    player.x = x;
    player.y = y;
    player.z = z;

    room.pendingStartAcks?.delete(socket.id);
    if (room.pendingStartAcks?.size === 0) {
      // finalizeRoomStart(roomId);
    }
  }

  function tickRoom(roomId, room, dtSec) {
    if (!room.started || room.ended) return;
    for (const player of room.players.values()) {
      player.update(dtSec);
    }

    if (room.dayEndsAt && Date.now() >= room.dayEndsAt) {
      endDay(roomId);
    }

    broadcastRoom(roomId);
  }

  function broadcastRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const state = serializeRoom(roomId);

    for (const socket of room.sockets.values()) {
      sendToSocket(socket, 'RoomState', state);
    }
  }

  function broadcastLobby(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const payload = {
      roomId,
      players: [...room.players.values()].map((player) => player.name),
      started: Boolean(room.started)
    };

    for (const socket of room.sockets.values()) {
      sendToSocket(socket, 'RoomLobby', payload);
    }
  }

  function broadcastRoomStart(roomId, startId, timeoutMs) {
    const room = rooms.get(roomId);
    if (!room) return;

    const grassIds = room.grass;
    const penIds = room.pens;

    console.log(grassIds, penIds);

    for (const socket of room.sockets.values()) {
      sendToSocket(socket, 'RoomStart', { roomId, startId, timeoutMs, grass: grassIds, pens: penIds });
    }
  }

  function broadcastRoleAssignments(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const [playerId, socket] of room.sockets.entries()) {
      const player = room.players.get(playerId);
      console.log(playerId, player);
      if (!player) continue;
      sendToSocket(socket, 'PlayerRole', { roomId, role: player.role });
    }
  }

  function broadcastGrassEat(roomId, payload) {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const socket of room.sockets.values()) {
      sendToSocket(socket, 'GrassEat', payload);
    }
  }

  function assignRoles(room) {
    const players = [...room.players.values()];
    for (const player of players) player.role = 'sheep';

    const wolves = chooseWolfCount(players.length);
    shuffle(players);
    for (let i = 0; i < wolves; i += 1) {
      if (players[i]) players[i].role = 'wolf';
    }
  }

  function resetDayCounters(room) {
    room.grassEatenByPlayer = new Map();
    for (const player of room.players.values()) {
      if (player.role === 'sheep' && player.isAlive) {
        room.grassEatenByPlayer.set(player.id, 0);
      }
    }
  }

  function endDay(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.ended) return;

    const sheepInPenCount = new Map();
    for (const player of room.players.values()) {
      if (!player.isAlive) continue;
      if (player.role !== 'sheep') continue;
      if (!player.inPen || !player.penId) continue;
      sheepInPenCount.set(player.penId, (sheepInPenCount.get(player.penId) ?? 0) + 1);
    }

    const wolfPens = new Set();
    for (const player of room.players.values()) {
      if (!player.isAlive) continue;
      if (player.role !== 'wolf') continue;
      if (!player.inPen || !player.penId) continue;
      wolfPens.add(player.penId);
      if ((sheepInPenCount.get(player.penId) ?? 0) === 0) {
        player.isAlive = GOD_MODE ? player.isAlive : false;
        player.deathReason = DeathReason.WOLF_HUNGER;
      }
    }

    if (wolfPens.size > 0) {
      for (const player of room.players.values()) {
        if (!player.isAlive) continue;
        if (player.role !== 'sheep') continue;
        if (!player.inPen || !player.penId) continue;
        if (wolfPens.has(player.penId)) {
          player.isAlive = GOD_MODE ? player.isAlive : false;
          player.deathReason = DeathReason.WOLF_IN_PEN;
        }
      }
    }

    for (const player of room.players.values()) {
      if (!player.isAlive) continue;

      if (!player.inPen || !player.penId) {
        player.isAlive = GOD_MODE ? player.isAlive : false;
        player.deathReason = DeathReason.NOT_IN_PEN;
        continue;
      }

      if (player.role !== 'sheep') continue;

      const eaten = room.grassEatenByPlayer.get(player.id) ?? 0;
      if (eaten < GRASS_PER_SHEEP_PER_DAY) {
        player.isAlive = GOD_MODE ? player.isAlive : false;
        player.deathReason = DeathReason.NOT_ENOUGH_GRASS;
      }
    }

    broadcastDayEnd(roomId, room.currentDay);

    const aliveWolves = [...room.players.values()].filter((p) => p.isAlive && p.role === 'wolf').length;
    const aliveSheep = [...room.players.values()].filter((p) => p.isAlive && p.role === 'sheep').length;

    if (aliveWolves === 0) {
      endGame(roomId, { winner: 'sheep', reason: GAME_END_REASONS.WOLVES_ELIMINATED });
      return;
    }

    if (aliveSheep === 0) {
      endGame(roomId, { winner: 'wolves', reason: GAME_END_REASONS.SHEEP_ELIMINATED });
      return;
    }

    if (room.currentDay >= room.totalDays) {
      endGame(roomId, { winner: 'sheep', reason: GAME_END_REASONS.SURVIVED_DAYS });
      return;
    }

    startDay(roomId, room.currentDay + 1);
  }

  function startDay(roomId, dayNumber) {
    const room = rooms.get(roomId);
    if (!room || room.ended) return;

    room.currentDay = dayNumber;
    room.dayEndsAt = Date.now() + room.dayLengthMs;
    for (const player of room.players.values()) {
      player.inPen = false;
      player.penId = null;
      if (player.isAlive) player.deathReason = null;
    }
    resetDayCounters(room);
    broadcastDayStart(roomId, room.currentDay, room.dayEndsAt);
    broadcastRoom(roomId);
  }

  function endGame(roomId, gameEndState) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.ended = true;
    room.started = false;
    room.dayEndsAt = 0;
    broadcastGameEnd(roomId, gameEndState);
    broadcastRoom(roomId);
  }

  function buildGrassMap(grass) {
    const items = Array.isArray(grass) ? grass : [];
    const map = new Map();

    for (const item of items) {
      // const id = typeof item?.id === 'string' && item.id ? item.id : null;
      // if (!id) continue;
      const id = item.id;
      map.set(id, new Grass({ id }));
    }

    return map;
  }

  function buildPenMap(pens) {
    const items = Array.isArray(pens) ? pens : [];
    const map = new Map();

    for (const item of items) {
      // const id = typeof item?.id === 'string' && item.id ? item.id : null;
      // if (!id) continue;
      const id = item.id;
      map.set(id, new Pen({ id }));
    }

    return map;
  }

  function clearRoomStart(room) {
    if (room.startTimeout) clearTimeout(room.startTimeout);
    room.startTimeout = null;
    room.starting = false;
    room.startId = null;
    room.pendingStartAcks = null;
  }

  function finalizeRoomStart(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.started) return;

    const missingAcks = room.pendingStartAcks ? [...room.pendingStartAcks] : [];
    for (const playerId of missingAcks) {
      removePlayerFromRoom(roomId, playerId);
    }

    if (room.players.size === 0) {
      clearRoomStart(room);
      rooms.delete(roomId);
      return;
    }

    clearRoomStart(room);
    room.ended = false;
    room.started = true;
    for (const player of room.players.values()) {
      player.isAlive = true;
      player.inPen = false;
      player.penId = null;
      player.deathReason = null;
    }
    assignRoles(room);
    broadcastRoleAssignments(roomId);
    startDay(roomId, 1);
  }

  function broadcastDayStart(roomId, day, dayEndsAt) {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const socket of room.sockets.values()) {
      sendToSocket(socket, 'DayStart', { roomId, day, dayEndsAt });
    }
  }

  function broadcastDayEnd(roomId, day) {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const socket of room.sockets.values()) {
      sendToSocket(socket, 'DayEnd', { roomId, day });
    }
  }

  function broadcastGameEnd(roomId, gameEndState) {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const socket of room.sockets.values()) {
      sendToSocket(socket, 'GameEnd', { roomId, ...gameEndState });
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
    handlePosition,
    handlePenUpdate,
    handleGrassEat,
    handleStartAck,
    startRoom
  };
}
