import crypto from 'node:crypto';

import { Grass } from '../entities/Grass.js';
import { Pen } from '../entities/Pen.js';

export function randomColor() {
  const bytes = crypto.randomBytes(3);
  const light = Array.from(bytes, (b) => Math.floor(160 + (b / 255) * 95));
  return `#${light.map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function chooseWolfCount(playerCount) {
  return 1;

  if (playerCount >= 4) return Math.max(1, Math.floor(playerCount / 5));
  return Math.random() < 0.2 ? 1 : 0;
}

export function safeRoomId(roomId) {
  if (typeof roomId !== 'string') return null;
  const trimmed = roomId.trim();
  if (!trimmed) return null;
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(trimmed)) return null;
  return trimmed;
}

export function safeName(name) {
  if (typeof name !== 'string') return 'Player';
  const trimmed = name.trim().slice(0, 24);
  return trimmed || 'Player';
}

export function buildGrassMap(grass) {
  const items = Array.isArray(grass) ? grass : [];
  const map = new Map();

  for (const item of items) {
    const id = typeof item === 'string' && item ? item : null;
    if (!id) continue;
    map.set(id, new Grass({ id }));
  }

  return map;
}

export function buildPenMap(pens) {
  const items = Array.isArray(pens) ? pens : [];
  const map = new Map();

  for (const item of items) {
    const id = typeof item === 'string' && item ? item : null;
    if (!id) continue;

    map.set(id, new Pen({ id }));
  }

  return map;
}
