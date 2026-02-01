import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';

import { createGame } from './game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.br')) {
        res.setHeader('Content-Encoding', 'br');
        if (filePath.endsWith('.wasm.br')) res.setHeader('Content-Type', 'application/wasm');
        else if (filePath.endsWith('.js.br')) res.setHeader('Content-Type', 'application/javascript');
        else if (filePath.endsWith('.data.br')) res.setHeader('Content-Type', 'application/octet-stream');
      }
    }
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

function sendToSocket(socket, type, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;
  const message = { type, payload };
  socket.send(JSON.stringify(message));
}

function parseMessage(data) {
  try {
    const text = typeof data === 'string' ? data : data.toString();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const game = createGame({
  sendToSocket,
});

game.start();

wss.on('connection', (socket) => {
  socket.id = crypto.randomUUID();
  sendToSocket(socket, 'SessionWelcome', {
    sessionId: socket.id,
    serverTime: Date.now(),
    protocolVersion: '1.0.0',
    authRequired: false
  });

  socket.on('message', (data) => {
    const message = parseMessage(data);
    if (!message || typeof message !== 'object') return;

    const { type, payload } = message;

    // eslint-disable-next-line no-console
    console.log('[ws] incoming', { type, payload });

    if (type === 'RoomJoin') {
      const { roomId, name, requestId } = payload ?? {};
      try {
        const result = game.joinRoom({ socket, roomId, name });
        sendToSocket(socket, 'RoomJoinAck', { requestId, ok: true, ...result });
      } catch (err) {
        sendToSocket(socket, 'RoomJoinAck', { requestId, ok: false, error: err?.message ?? String(err) });
      }
      return;
    }

    if (type === 'PlayerPosition') {
      game.handlePosition({ socket, position: payload });
      return;
    }

    if (type === 'PenUpdate') {
      game.handlePenUpdate({
        socket,
        inPen: payload?.inPen,
        penId: payload?.penId
      });
      return;
    }

    if (type === 'RoomStart') {
      try {
        game.startRoom({ socket, grass: payload?.grass, pens: payload?.pens });
      } catch {
        // Ignore invalid start requests
      }
      return;
    }

    if (type === 'RoomStartAck') {
      game.handleStartAck({
        socket,
        startId: payload?.startId,
        position: payload?.position
      });
      return;
    }

    if (type === 'GrassEat') {
      game.handleGrassEat({
        socket,
        grassId: payload?.grassId
      });
    }
  });

  socket.on('close', () => {
    game.leave({ socket });
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
