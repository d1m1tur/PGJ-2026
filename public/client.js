const statusEl = document.querySelector('#status');
const socketIdEl = document.querySelector('#socketId');
const playersEl = document.querySelector('#players');
const roomStateEl = document.querySelector('#roomState');
const nameEl = document.querySelector('#name');
const roomEl = document.querySelector('#room');
const joinBtn = document.querySelector('#join');
const leaveBtn = document.querySelector('#leave');
const startBtn = document.querySelector('#start');

const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d');

let socket = null;
let currentState = null;
let localPlayerId = null;
let localRole = 'sheep';
const pendingRequests = new Map();

function getSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function ensureSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return socket;
  }

  socket = new WebSocket(getSocketUrl());
  setStatus('connecting');

  socket.addEventListener('open', () => {
    setStatus('connected');
  });

  socket.addEventListener('close', () => {
    setStatus('disconnected');
    socketIdEl.textContent = '';
    localPlayerId = null;
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

    const { type, payload, requestId } = message ?? {};

    if (type === 'session:welcome') {
      socketIdEl.textContent = `session: ${payload?.sessionId ?? ''}`;
      return;
    }

    if (type === 'room:state') {
      currentState = payload;
      renderSidebar();
      return;
    }

    if (type === 'room:start') {
      currentState = currentState ? { ...currentState, started: true } : currentState;
      renderSidebar();
      return;
    }

    if (type === 'room:join:ack' && requestId && pendingRequests.has(requestId)) {
      const { resolve } = pendingRequests.get(requestId);
      pendingRequests.delete(requestId);
      resolve?.(payload);
    }
  });

  return socket;
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

function renderSidebar() {
  if (!currentState) {
    playersEl.innerHTML = '';
    roomStateEl.textContent = '(none)';
    return;
  }

  const status = currentState.started ? 'started' : 'waiting';
  roomStateEl.textContent = `${currentState.roomId} (${currentState.players.length} players, ${status})`;

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

async function joinRoom() {
  const s = ensureSocket();
  await waitForOpen(s);

  const roomId = roomEl.value;
  const name = nameEl.value;

  const requestId = createRequestId();
  const ack = await new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
    sendMessage('room:join', { roomId, name }, requestId);
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
  localRole = ack.role ?? 'sheep';
}

function disconnect() {
  if (!socket) return;
  socket.close();
}

joinBtn.addEventListener('click', () => {
  joinRoom();
});

leaveBtn.addEventListener('click', () => {
  disconnect();
});

startBtn.addEventListener('click', () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  sendMessage('room:start', { roomId: roomEl.value });
});

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

setInterval(() => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const x = (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0);
  const y = (keyState.down ? 1 : 0) - (keyState.up ? 1 : 0);
  sendMessage('player:input', { x, y });
}, 50);

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

  if (currentState?.players) {
    for (const p of currentState.players) {
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
