const statusEl = document.querySelector('#status');
const socketIdEl = document.querySelector('#socketId');
const playersEl = document.querySelector('#players');
const roomStateEl = document.querySelector('#roomState');
const nameEl = document.querySelector('#name');
const roomEl = document.querySelector('#room');
const joinBtn = document.querySelector('#join');
const leaveBtn = document.querySelector('#leave');

const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d');

let socket = null;
let currentState = null;
let localPlayerId = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function ensureSocket() {
  if (socket && socket.connected) return socket;

  socket = io({
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    setStatus('connected');
    socketIdEl.textContent = `socket: ${socket.id}`;
  });

  socket.on('disconnect', () => {
    setStatus('disconnected');
    socketIdEl.textContent = '';
    localPlayerId = null;
  });

  socket.on('hello', (payload) => {
    // eslint-disable-next-line no-console
    console.log('hello', payload);
  });

  socket.on('room:state', (state) => {
    currentState = state;
    renderSidebar();
  });

  return socket;
}

function renderSidebar() {
  if (!currentState) {
    playersEl.innerHTML = '';
    roomStateEl.textContent = '(none)';
    return;
  }

  roomStateEl.textContent = `${currentState.roomId} (${currentState.players.length} players)`;

  playersEl.innerHTML = '';
  for (const p of currentState.players) {
    const li = document.createElement('li');
    const me = p.id === localPlayerId ? ' (you)' : '';
    li.textContent = `${p.name}${me}`;
    li.style.color = p.color;
    playersEl.appendChild(li);
  }
}

async function joinRoom() {
  const s = ensureSocket();

  const roomId = roomEl.value;
  const name = nameEl.value;

  const ack = await new Promise((resolve) => {
    s.emit('room:join', { roomId, name }, resolve);
  });

  if (!ack?.ok) {
    alert(ack?.error ?? 'Failed to join');
    return;
  }

  localPlayerId = ack.playerId;
}

function disconnect() {
  if (!socket) return;
  socket.disconnect();
}

joinBtn.addEventListener('click', () => {
  joinRoom();
});

leaveBtn.addEventListener('click', () => {
  disconnect();
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
  if (!socket || !socket.connected) return;
  socket.emit('player:input', keyState);
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
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fill();

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
