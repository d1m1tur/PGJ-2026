import crypto from 'node:crypto';

import { Grass } from '../entities/Grass.js';
import { Pen } from '../entities/Pen.js';

let colorIndex = Math.floor(Math.random() * 360);
const GOLDEN_ANGLE = 137.508;

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function randomColor() {
  colorIndex = (colorIndex + GOLDEN_ANGLE) % 360;
  const jitter = crypto.randomInt(0, 8);
  const hue = (colorIndex + jitter) % 360;
  const sat = 0.7 + crypto.randomInt(0, 20) / 100;
  const light = 0.55 + crypto.randomInt(0, 15) / 100;
  return hslToHex(hue, sat, light);
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

export function buildSpawnPoints() {
  const points = [];
  const cols = 8;
  const rows = 5;
  const WORLD_WIDTH = 800;
  const WORLD_HEIGHT = 450;
  const paddingX = WORLD_WIDTH * 0.08;
  const paddingY = WORLD_HEIGHT * 0.12;
  const usableW = WORLD_WIDTH - paddingX * 2;
  const usableH = WORLD_HEIGHT - paddingY * 2;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = paddingX + (usableW * x) / Math.max(1, cols - 1);
      const py = paddingY + (usableH * y) / Math.max(1, rows - 1);
      points.push({ id: `spawn_${y}_${x}`, x: px, y: py });
    }
  }
  return points;
}

export function seededShuffle(items, seed, salt = 0) {
  let t = (seed + salt) >>> 0;
  const rng = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function generateSpawnIds(seed, count, salt) {
  const MAP_WIDTH = 100;
  const MAP_HEIGHT = 75;
  const tiles = [];
  for (let y = 1; y < MAP_HEIGHT - 1; y += 1) {
    for (let x = 1; x < MAP_WIDTH - 1; x += 1) {
      tiles.push({ x, y });
    }
  }
  const shuffled = seededShuffle(tiles, seed, salt);
  return shuffled
    .slice(0, Math.min(count, shuffled.length))
    .map((tile) => `tile_${tile.x}_${tile.y}`);
}
