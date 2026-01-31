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

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

function sendToSocket(socket, type, payload, requestId) {
  if (socket.readyState !== WebSocket.OPEN) return;
  const message = { type, payload };
  if (requestId) message.requestId = requestId;
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

const game = createGame({ sendToSocket });

game.start();

wss.on('connection', (socket) => {
  socket.id = crypto.randomUUID();
  sendToSocket(socket, 'session:welcome', {
    sessionId: socket.id,
    serverTime: Date.now(),
    protocolVersion: '1.0.0',
    authRequired: false
  });

  socket.on('message', (data) => {
    const message = parseMessage(data);
    if (!message || typeof message !== 'object') return;

    const { type, payload, requestId } = message;

    if (type === 'room:join') {
      const { roomId, name } = payload ?? {};
      try {
        const result = game.joinRoom({ socket, roomId, name });
        sendToSocket(socket, 'room:join:ack', { ok: true, ...result }, requestId);
      } catch (err) {
        sendToSocket(socket, 'room:join:ack', { ok: false, error: err?.message ?? String(err) }, requestId);
      }
      return;
    }

    if (type === 'player:input') {
      game.handleInput({ socket, input: payload });
      return;
    }

    if (type === 'room:start') {
      try {
        game.startRoom({ socket });
      } catch {
        // Ignore invalid start requests
      }
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
