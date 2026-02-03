import { DeathReason } from '../entities/Player.js';
import {
  GAME_END_REASONS,
  GOD_MODE,
  GRASS_PER_SHEEP_PER_DAY,
} from './constants.js';

export function startDay(game, roomId, dayNumber) {
  const room = game.getRoom(roomId);
  if (!room || room.ended) return;

  room.state.day.current = dayNumber;
  room.state.day.endsAt = Date.now() + room.state.day.lengthMs;
  for (const player of room.state.players.values()) {
    player.inPen = false;
    player.penId = null;
    if (player.isAlive) player.deathReason = null;
  }
  room.resetDayCounters();
  game.broadcastDayStart(roomId, room.state.day.current, room.state.day.endsAt);
  game.broadcastRoom(roomId);
}

export function endGame(game, roomId, gameEndState) {
  const room = game.getRoom(roomId);
  if (!room) return;

  room.ended = true;
  room.started = false;
  room.state.day.endsAt = 0;
  game.broadcastGameEnd(roomId, gameEndState);
  game.broadcastRoom(roomId);
}

export function endDay(game, roomId) {
  const room = game.getRoom(roomId);
  if (!room || room.ended) return;

  const sheepInPenCount = new Map();
  for (const player of room.state.players.values()) {
    if (!player.isAlive) continue;
    if (player.role !== 'sheep') continue;
    if (!player.inPen || !player.penId) continue;
    sheepInPenCount.set(player.penId, (sheepInPenCount.get(player.penId) ?? 0) + 1);
  }

  const wolfPens = new Set();
  for (const player of room.state.players.values()) {
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
    for (const player of room.state.players.values()) {
      if (!player.isAlive) continue;
      if (player.role !== 'sheep') continue;
      if (!player.inPen || !player.penId) continue;
      if (wolfPens.has(player.penId)) {
        player.isAlive = GOD_MODE ? player.isAlive : false;
        player.deathReason = DeathReason.WOLF_IN_PEN;
      }
    }
  }

  for (const player of room.state.players.values()) {
    if (!player.isAlive) continue;

    if (!player.inPen || !player.penId) {
      player.isAlive = GOD_MODE ? player.isAlive : false;
      player.deathReason = DeathReason.NOT_IN_PEN;
      continue;
    }

    if (player.role !== 'sheep') continue;

    const eaten = room.state.stats.grassEatenByPlayer.get(player.id) ?? 0;
    if (eaten < GRASS_PER_SHEEP_PER_DAY) {
      player.isAlive = GOD_MODE ? player.isAlive : false;
      player.deathReason = DeathReason.NOT_ENOUGH_GRASS;
    }
  }

  game.broadcastDayEnd(roomId, room.state.day.current);

  const aliveWolves = [...room.state.players.values()].filter((p) => p.isAlive && p.role === 'wolf').length;
  const aliveSheep = [...room.state.players.values()].filter((p) => p.isAlive && p.role === 'sheep').length;

  if (aliveWolves === 0) {
    endGame(game, roomId, { winner: 'sheep', reason: GAME_END_REASONS.WOLVES_ELIMINATED });
    return;
  }

  if (aliveSheep === 0) {
    endGame(game, roomId, { winner: 'wolves', reason: GAME_END_REASONS.SHEEP_ELIMINATED });
    return;
  }

  if (room.state.day.current >= room.state.day.totalDays) {
    endGame(game, roomId, { winner: 'sheep', reason: GAME_END_REASONS.SURVIVED_DAYS });
    return;
  }

  startDay(game, roomId, room.state.day.current + 1);
}
