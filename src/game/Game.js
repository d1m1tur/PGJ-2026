import { Room } from './Room.js';
import {
  DEFAULT_DAY_LENGTH_MS,
  DEFAULT_TOTAL_DAYS,
  TICK_RATE_HZ,
} from './constants.js';
import {
  broadcastDayEnd,
  broadcastDayStart,
  broadcastGameEnd,
  broadcastGrassEat,
  broadcastLobby,
  broadcastRoleAssignments,
  broadcastRoom,
  broadcastRoomStart,
} from './broadcasts.js';
import { endDay, endGame, startDay } from './dayCycle.js';
import { createHandlers } from './handlers/index.js';
import { chooseWolfCount, shuffle } from './utils.js';

export class Game {
  constructor({ sendToSocket, dayLengthMs = DEFAULT_DAY_LENGTH_MS, totalDays = DEFAULT_TOTAL_DAYS }) {
    this.rooms = new Map();
    this.playerRoom = new Map();
    this.dayLengthMs = dayLengthMs;
    this.totalDays = totalDays;
    this.intervalHandle = null;
    this.handlers = createHandlers();
    this._sendToSocket = sendToSocket;
  }

  sendToSocket(socket, type, payload) {
    this._sendToSocket(socket, type, payload);
  }

  handleMessage({ socket, type, payload }) {
    const handler = this.handlers.get(type);
    if (!handler) return;
    handler({ game: this, socket, payload });
  }

  getRoom(roomId) {
    return roomId ? this.rooms.get(roomId) : null;
  }

  getRoomIdForSocket(socket) {
    return this.playerRoom.get(socket.id) ?? null;
  }

  getRoomForSocket(socket) {
    const roomId = this.getRoomIdForSocket(socket);
    if (!roomId) return null;
    return this.getRoom(roomId);
  }

  getOrCreateRoom(roomId) {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room({
        roomId,
        dayLengthMs: this.dayLengthMs,
        totalDays: this.totalDays,
      });
      this.rooms.set(roomId, room);
    }
    return room;
  }

  serializeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return { roomId, players: [] };
    return room.serialize();
  }

  leave({ socket }) {
    const roomId = this.getRoomIdForSocket(socket);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.state.players.delete(socket.id);
      room.sockets.delete(socket.id);
      if (room.starting && room.pendingStartAcks) {
        room.pendingStartAcks.delete(socket.id);
        if (room.pendingStartAcks.size === 0) {
          this.finalizeRoomStart(roomId);
        }
      }
      if (room.state.players.size === 0) {
        room.clearStart();
        this.rooms.delete(roomId);
      } else {
        this.broadcastLobby(roomId);
      }
    }

    this.playerRoom.delete(socket.id);
  }

  removePlayerFromRoom(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.state.players.delete(playerId);
    room.sockets.delete(playerId);
    room.pendingStartAcks?.delete(playerId);
    this.playerRoom.delete(playerId);
  }

  tickRoom(roomId, room, dtSec) {
    if (!room.started || room.ended) return;
    for (const player of room.state.players.values()) {
      player.update(dtSec);
    }

    if (room.state.day.endsAt && Date.now() >= room.state.day.endsAt) {
      endDay(this, roomId);
    }

    broadcastRoom(this, roomId);
  }

  broadcastRoom(roomId) {
    broadcastRoom(this, roomId);
  }

  broadcastLobby(roomId) {
    broadcastLobby(this, roomId);
  }

  broadcastRoomStart(roomId, startId, timeoutMs) {
    broadcastRoomStart(this, roomId, startId, timeoutMs);
  }

  broadcastRoleAssignments(roomId) {
    broadcastRoleAssignments(this, roomId);
  }

  broadcastGrassEat(roomId, payload) {
    broadcastGrassEat(this, roomId, payload);
  }

  assignRoles(room) {
    const players = [...room.state.players.values()];
    for (const player of players) player.role = 'sheep';

    const wolves = chooseWolfCount(players.length);
    shuffle(players);
    for (let i = 0; i < wolves; i += 1) {
      if (players[i]) players[i].role = 'wolf';
    }
  }

  endDay(roomId) {
    endDay(this, roomId);
  }

  startDay(roomId, dayNumber) {
    startDay(this, roomId, dayNumber);
  }

  endGame(roomId, gameEndState) {
    endGame(this, roomId, gameEndState);
  }

  finalizeRoomStart(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.started) return;

    const missingAcks = room.pendingStartAcks ? [...room.pendingStartAcks] : [];
    for (const playerId of missingAcks) {
      this.removePlayerFromRoom(roomId, playerId);
    }

    if (room.state.players.size === 0) {
      room.clearStart();
      this.rooms.delete(roomId);
      return;
    }

    room.clearStart();
    room.ended = false;
    room.started = true;
    for (const player of room.state.players.values()) {
      player.isAlive = true;
      player.inPen = false;
      player.penId = null;
      player.deathReason = null;
    }
    this.assignRoles(room);
    this.broadcastRoleAssignments(roomId);
    this.startDay(roomId, 1);
  }

  broadcastDayStart(roomId, day, dayEndsAt) {
    broadcastDayStart(this, roomId, day, dayEndsAt);
  }

  broadcastDayEnd(roomId, day) {
    broadcastDayEnd(this, roomId, day);
  }

  broadcastGameEnd(roomId, gameEndState) {
    broadcastGameEnd(this, roomId, gameEndState);
  }

  start() {
    if (this.intervalHandle) return;

    const tickMs = Math.floor(1000 / TICK_RATE_HZ);

    this.intervalHandle = setInterval(() => {
      const now = Date.now();

      for (const [roomId, room] of this.rooms.entries()) {
        const dtMs = now - room.lastUpdateMs;
        room.lastUpdateMs = now;
        const dtSec = Math.min(0.25, Math.max(0, dtMs / 1000));

        this.tickRoom(roomId, room, dtSec);
      }
    }, tickMs);

    this.intervalHandle.unref?.();
  }

  stop() {
    if (!this.intervalHandle) return;
    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }
}

export function createGame(options) {
  return new Game(options);
}
