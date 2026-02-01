const statusEl = document.querySelector('#status');
const socketIdEl = document.querySelector('#socketId');
const playersEl = document.querySelector('#players');
const roomStateEl = document.querySelector('#roomState');
const nameEl = document.querySelector('#name');
const roomEl = document.querySelector('#room');
const joinBtn = document.querySelector('#join');
const leaveBtn = document.querySelector('#leave');
const startBtn = document.querySelector('#start');
const deathScreenEl = document.querySelector('#deathScreen');
const deathReasonEl = document.querySelector('#deathReason');
const endScreenEl = document.querySelector('#endScreen');
const endTitleEl = document.querySelector('#endTitle');
const endReasonEl = document.querySelector('#endReason');
const mapLoaderEl = document.querySelector('#mapLoader');
const touchUpEl = document.querySelector('#touchUp');
const touchDownEl = document.querySelector('#touchDown');
const touchLeftEl = document.querySelector('#touchLeft');
const touchRightEl = document.querySelector('#touchRight');

const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d');

let socket = null;
let currentState = null;
let localPlayerId = null;
let localRole = 'sheep';
let localPosition = null;
let lobbyInfo = null;
let localGrassIds = [];
let eatingState = null;
let dayInfo = null;
let grassEatenToday = 0;
let gameEndState = null;
const localSpeed = 220;
const pendingRequests = new Map();
const grassCount = 24;
let pens = [];
let inPen = false;
let currentPenId = null;
const penCount = 4;
const penSize = 30;
const spawnPoints = buildSpawnPoints();
const spawnPointsById = new Map(spawnPoints.map((point) => [point.id, point]));
const grassEatRadius = 14;
const grassEatDurationMs = 1000;

export const DeathReason = Object.freeze({
  WOLF_IN_PEN: 0,
  NOT_IN_PEN: 1,
  NOT_ENOUGH_GRASS: 2,
  WOLF_HUNGER: 3
});

function getSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setLoading(isLoading) {
  if (!mapLoaderEl) return;
  mapLoaderEl.classList.toggle('is-visible', Boolean(isLoading));
}

function updateControlState() {
  const connected = socket && socket.readyState === WebSocket.OPEN;
  joinBtn.disabled = connected;
  leaveBtn.disabled = !connected;
  startBtn.disabled = !connected;
}

function formatDeathReason(reason) {
  if (reason === null || reason === undefined) return 'Unknown cause.';
  if (reason === DeathReason.WOLF_IN_PEN) return 'A wolf was in your pen.';
  if (reason === DeathReason.NOT_IN_PEN) return 'You were not in a pen.';
  if (reason === DeathReason.NOT_ENOUGH_GRASS) return 'You did not eat enough grass.';
  if (reason === DeathReason.WOLF_HUNGER) return 'You starved in an empty pen.';
  return String(reason);
}

function formatGameEndTitle(state) {
  if (!state?.winner) return 'Game ended';
  return state.winner === 'sheep' ? 'Sheep win' : 'Wolves win';
}

function formatGameEndReason(state) {
  if (state.reason === null || state.reason === undefined) return 'Unknown cause. Everyone Wins???';
  if (state.reason === 0) return 'All wolves were eliminated.';
  if (state.reason === 1) return 'All sheep were eliminated.';
  if (state.reason === 2) return 'Sheep survived all days.';
  return state.reason;
}

function updateEndScreen() {
  if (!endScreenEl || !endTitleEl || !endReasonEl) return;
  if (gameEndState) {
    endTitleEl.textContent = formatGameEndTitle(gameEndState);
    endReasonEl.textContent = formatGameEndReason(gameEndState);
    endScreenEl.classList.add('is-visible');
    return;
  }
  endScreenEl.classList.remove('is-visible');
}

function updateDeathScreen() {
  if (!deathScreenEl || !deathReasonEl) return;

  const me = currentState?.players?.find((p) => p.id === localPlayerId);
  if (me && me.isAlive === false && me.deathReason !== null) {
    deathReasonEl.textContent = formatDeathReason(me.deathReason);
    deathScreenEl.classList.add('is-visible');
    return;
  }

  deathScreenEl.classList.remove('is-visible');
}

function ensureSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return socket;
  }

  socket = new WebSocket(getSocketUrl());
  setStatus('connecting');

  socket.addEventListener('open', () => {
    setStatus('connected');
    updateControlState();
  });

  socket.addEventListener('close', () => {
    setStatus('disconnected');
    socketIdEl.textContent = '';
    localPlayerId = null;
    setLoading(false);
    updateControlState();
    for (const { reject } of pendingRequests.values()) {
      reject?.(new Error('socket closed'));
    }
    pendingRequests.clear();
  });

  socket.addEventListener('message', (event) => {
    let message = null;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    const { type, payload } = message ?? {};

    if (type === 'SessionWelcome') {
      socketIdEl.textContent = `session: ${payload?.sessionId ?? ''}`;
      return;
    }

    if (type === 'RoomState') {
      currentState = payload;
      dayInfo = {
        day: payload?.day,
        totalDays: payload?.totalDays,
        dayEndsAt: payload?.dayEndsAt,
        ended: payload?.ended,
        started: payload?.started
      };
      setLoading(false);
      syncLocalPositionFromState();
      updateDeathScreen();
      updateEndScreen();
      renderSidebar();
      return;
    }

    if (type === 'RoomLobby') {
      lobbyInfo = payload;
      renderSidebar();
      return;
    }

    if (type === 'RoomStart') {
      setLoading(true);
      if (Array.isArray(payload?.grass)) {
        localGrassIds = payload.grass.map((item) => (typeof item === 'string' ? item : item?.id)).filter(Boolean);
      }
      if (Array.isArray(payload?.pens)) {
        const penIds = payload.pens.map((item) => (typeof item === 'string' ? item : item?.id)).filter(Boolean);
        pens = buildPensFromIds(penIds);
      } else {
        pens = [];
      }
      inPen = false;
      currentPenId = null;
      const padding = 30;
      const randX = padding + Math.random() * (canvas.width - padding * 2);
      const randY = padding + Math.random() * (canvas.height - padding * 2);
      localPosition = { x: randX, y: randY, z: 0 };
      sendMessage('RoomStartAck', {
        startId: payload?.startId,
        position: localPosition
      });
      renderSidebar();
      return;
    }

    if (type === 'PlayerRole') {
      if (payload?.role) {
        localRole = payload.role;
        renderSidebar();
      }
      return;
    }

    if (type === 'GrassEat') {
      const grassId = payload?.grassId;
      if (grassId) {
        localGrassIds = localGrassIds.filter((id) => id !== grassId);
        renderSidebar();
      }
      return;
    }

    if (type === 'DayStart') {
      dayInfo = {
        day: payload?.day,
        totalDays: dayInfo?.totalDays,
        dayEndsAt: payload?.dayEndsAt,
        ended: false,
        started: true
      };
      grassEatenToday = 0;
      renderSidebar();
      return;
    }

    if (type === 'DayEnd') {
      dayInfo = {
        day: payload?.day,
        totalDays: dayInfo?.totalDays,
        dayEndsAt: null,
        ended: false,
        started: true
      };
      grassEatenToday = 0;
      renderSidebar();
      return;
    }

    if (type === 'GameEnd') {
      if (payload?.winner || payload?.reason !== undefined) {
        gameEndState = { winner: payload?.winner, reason: payload?.reason };
      } else {
        gameEndState = null;
      }
      dayInfo = {
        day: dayInfo?.day ?? currentState?.day,
        totalDays: dayInfo?.totalDays ?? currentState?.totalDays,
        dayEndsAt: null,
        ended: true,
        started: false
      };
      grassEatenToday = 0;
      updateEndScreen();
      renderSidebar();
      return;
    }

    if (type === 'RoomJoinAck' && payload?.requestId && pendingRequests.has(payload.requestId)) {
      const { resolve } = pendingRequests.get(payload.requestId);
      pendingRequests.delete(payload.requestId);
      resolve?.(payload);
    }
  });

  return socket;
}

function bindTouchButton(element, direction) {
  if (!element) return;
  const setPressed = (pressed) => {
    setKey(direction, pressed);
  };

  element.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    setPressed(true);
  });

  const release = () => setPressed(false);

  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('pointerleave', release);
}

function resizeCanvasToDisplaySize() {
  const ratio = window.devicePixelRatio || 1;
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  const width = Math.max(1, Math.round(displayWidth * ratio));
  const height = Math.max(1, Math.round(displayHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function sendMessage(type, payload, requestId) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const message = { type, payload };
  if (requestId) message.requestId = requestId;
  socket.send(JSON.stringify(message));
}

function waitForOpen(ws) {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onOpen = () => resolve();
    const onError = () => reject(new Error('socket error'));
    ws.addEventListener('open', onOpen, { once: true });
    ws.addEventListener('error', onError, { once: true });
  });
}

function createRequestId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return `req_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function buildSpawnPoints() {
  const points = [];
  const cols = 8;
  const rows = 5;
  const paddingX = canvas.width * 0.08;
  const paddingY = canvas.height * 0.12;
  const usableW = canvas.width - paddingX * 2;
  const usableH = canvas.height - paddingY * 2;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = paddingX + (usableW * x) / Math.max(1, cols - 1);
      const py = paddingY + (usableH * y) / Math.max(1, rows - 1);
      points.push({ id: `spawn_${y}_${x}`, x: px, y: py });
    }
  }
  return points;
}

function isPointInPen(point, pen) {
  const half = pen.size / 2;
  return (
    point.x >= pen.x - half &&
    point.x <= pen.x + half &&
    point.y >= pen.y - half &&
    point.y <= pen.y + half
  );
}

function buildPensFromIds(ids) {
  const items = [];
  for (const id of ids) {
    const point = spawnPointsById.get(id);
    if (!point) continue;
    items.push({ id, x: point.x, y: point.y, size: penSize });
  }
  return items;
}

function findPenId(point) {
  if (!point) return null;
  for (const pen of pens) {
    if (isPointInPen(point, pen)) return pen.id;
  }
  return null;
}
function pickRandomSpawnIds(count) {
  const shuffled = [...spawnPoints];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((p) => ({ id: p.id }));
}
function generateGrassPositions() {
  return pickRandomSpawnIds(grassCount);
}

function generatePenPositions() {
  return pickRandomSpawnIds(penCount);
}

function renderSidebar() {
  if (!currentState && !lobbyInfo) {
    playersEl.innerHTML = '';
    roomStateEl.textContent = '(none)';
    return;
  }

  if (!currentState) {
    const status = lobbyInfo?.started ? 'started' : 'waiting';
    const roomId = lobbyInfo?.roomId ?? '(unknown)';
    const names = Array.isArray(lobbyInfo?.players) ? lobbyInfo.players : [];
    roomStateEl.textContent = `${roomId} (${names.length} players, ${status})`;
    playersEl.innerHTML = '';
    for (const name of names) {
      const li = document.createElement('li');
      li.textContent = name;
      li.style.opacity = '0.7';
      playersEl.appendChild(li);
    }
    return;
  }

  const status = currentState.started ? 'started' : 'waiting';
  const day = dayInfo?.day ?? currentState.day;
  const totalDays = dayInfo?.totalDays ?? currentState.totalDays;
  const dayEndsAt = dayInfo?.dayEndsAt ?? currentState.dayEndsAt;
  const ended = dayInfo?.ended ?? currentState.ended;
  const timeLeftSec = dayEndsAt ? Math.max(0, Math.ceil((dayEndsAt - Date.now()) / 1000)) : null;
  const dayText = day && totalDays ? `day ${day}/${totalDays}` : 'day ?';
  const timeText = timeLeftSec !== null ? `${timeLeftSec}s left` : '';
  const endText = ended ? 'game ended' : '';
  const grassText = currentState.started ? `grass ${Math.min(grassEatenToday, 3)}/3` : '';
  const extra = [dayText, timeText, endText, grassText].filter(Boolean).join(', ');
  roomStateEl.textContent = `${currentState.roomId} (${currentState.players.length} players, ${status}${extra ? `, ${extra}` : ''})`;

  playersEl.innerHTML = '';
  for (const p of currentState.players) {
    const li = document.createElement('li');
    const me = p.id === localPlayerId ? ' (you)' : '';
    const roleNote = p.id === localPlayerId && localRole === 'wolf' ? ' (wolf)' : '';
    li.textContent = `${p.name}${me}${roleNote}`;
    li.style.color = p.color;
    playersEl.appendChild(li);
  }
}

function syncLocalPositionFromState() {
  if (!currentState?.players || !localPlayerId) return;
  const me = currentState.players.find((p) => p.id === localPlayerId);
  if (!me) return;
  localPosition = { x: me.x, y: me.y, z: Number.isFinite(me.z) ? me.z : 0 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function findNearbyGrassId() {
  if (!localPosition) return null;
  for (const id of localGrassIds) {
    const point = spawnPointsById.get(id);
    if (!point) continue;
    if (distance(localPosition, point) <= grassEatRadius) return id;
  }
  return null;
}

async function joinRoom() {
  const s = ensureSocket();
  await waitForOpen(s);

  const roomId = roomEl.value;
  const name = nameEl.value;

  const requestId = createRequestId();
  const ack = await new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
    sendMessage('RoomJoin', { roomId, name, requestId });
    setTimeout(() => {
      if (!pendingRequests.has(requestId)) return;
      pendingRequests.delete(requestId);
      reject(new Error('Join timed out'));
    }, 5000);
  }).catch((err) => ({ ok: false, error: err?.message ?? String(err) }));

  if (!ack?.ok) {
    alert(ack?.error ?? 'Failed to join');
    return;
  }

  localPlayerId = ack.playerId;
  localRole = 'sheep';
  currentState = null;
  lobbyInfo = null;
  setLoading(false);
}

function disconnect() {
  if (!socket) return;
  socket.close();
  localPosition = null;
  lobbyInfo = null;
  currentState = null;
  dayInfo = null;
  gameEndState = null;
  pens = [];
  inPen = false;
  currentPenId = null;
  setLoading(false);
  updateDeathScreen();
  updateEndScreen();
}

joinBtn.addEventListener('click', () => {
  joinRoom();
});

leaveBtn.addEventListener('click', () => {
  disconnect();
});

startBtn.addEventListener('click', () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  sendMessage('RoomStart', {
    roomId: roomEl.value,
    grass: generateGrassPositions(),
    pens: generatePenPositions()
  });
});

bindTouchButton(touchUpEl, 'KeyW');
bindTouchButton(touchDownEl, 'KeyS');
bindTouchButton(touchLeftEl, 'KeyA');
bindTouchButton(touchRightEl, 'KeyD');

const keyState = {
  up: false,
  down: false,
  left: false,
  right: false
};

function setKey(code, value) {
  if (code === 'KeyW' || code === 'ArrowUp') keyState.up = value;
  if (code === 'KeyS' || code === 'ArrowDown') keyState.down = value;
  if (code === 'KeyA' || code === 'ArrowLeft') keyState.left = value;
  if (code === 'KeyD' || code === 'ArrowRight') keyState.right = value;
}

window.addEventListener('keydown', (e) => {
  setKey(e.code, true);
});

window.addEventListener('keyup', (e) => {
  setKey(e.code, false);
});

window.addEventListener('resize', () => {
  resizeCanvasToDisplaySize();
});

updateControlState();
setLoading(false);
resizeCanvasToDisplaySize();

setInterval(() => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!localPosition) return;

  const inputX = (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0);
  const inputY = (keyState.down ? 1 : 0) - (keyState.up ? 1 : 0);
  const len = Math.hypot(inputX, inputY) || 1;
  const vx = inputX / len;
  const vy = inputY / len;

  const dtSec = 0.05;
  localPosition.x = localPosition.x + vx * localSpeed * dtSec;
  localPosition.y = localPosition.y + vy * localSpeed * dtSec;

  sendMessage('PlayerPosition', { x: localPosition.x, y: localPosition.y, z: localPosition.z });

  if (currentState?.started) {
    const penId = findPenId(localPosition);
    if (penId !== currentPenId) {
      currentPenId = penId;
      inPen = Boolean(penId);
      sendMessage('PenUpdate', { inPen, penId });
    }
  }

  if (localRole !== 'sheep' || !currentState?.started) {
    eatingState = null;
    return;
  }

  if (grassEatenToday >= 3) {
    eatingState = null;
    return;
  }

  const nearbyGrassId = findNearbyGrassId();
  if (!nearbyGrassId) {
    eatingState = null;
    return;
  }

  if (!eatingState || eatingState.grassId !== nearbyGrassId) {
    eatingState = { grassId: nearbyGrassId, startedAt: Date.now() };
    return;
  }

  if (Date.now() - eatingState.startedAt >= grassEatDurationMs) {
    sendMessage('GrassEat', { grassId: eatingState.grassId });
    grassEatenToday += 1;
    eatingState = null;
  }
}, 50);

setInterval(() => {
  if (!dayInfo) return;
  renderSidebar();
}, 1000);

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background grid
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#88a0ff';
  for (let x = 0; x <= canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.restore();

  if (localGrassIds.length > 0) {
    ctx.save();
    ctx.fillStyle = '#58c76f';
    for (const id of localGrassIds) {
      const point = spawnPointsById.get(id);
      if (!point) continue;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (pens.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#ffd66d';
    ctx.lineWidth = 2;
    for (const pen of pens) {
      const half = pen.size / 2;
      ctx.strokeRect(pen.x - half, pen.y - half, pen.size, pen.size);
    }
    ctx.restore();
  }

  if (currentState?.players) {
    for (const p of currentState.players) {
      if (p.isAlive === false) continue;
      const isLocalWolf = p.id === localPlayerId && localRole === 'wolf';

      ctx.fillStyle = p.color;
      if (isLocalWolf) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 12);
        ctx.lineTo(p.x + 12, p.y + 12);
        ctx.lineTo(p.x - 12, p.y + 12);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = '12px ui-sans-serif, system-ui, Segoe UI, Arial';
      const label = p.id === localPlayerId ? `${p.name} (you)` : p.name;
      ctx.fillText(label, p.x + 14, p.y + 4);
    }
  }

  requestAnimationFrame(draw);
}

draw();

setStatus('disconnected');
