import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';

import { createGame } from './game/Game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const publicDir = path.join(__dirname, '..', 'public');

function getUnityContentType(filePath) {
  if (filePath.includes('.wasm.')) return 'application/wasm';
  if (filePath.includes('.js.')) return 'application/javascript';
  if (filePath.includes('.data.')) return 'application/octet-stream';
  if (filePath.includes('.json.')) return 'application/json';
  return 'application/octet-stream';
}

function setUnityEncodingHeaders(res, filePath) {
  if (filePath.endsWith('.br')) {
    res.setHeader('Content-Encoding', 'br');
  } else if (filePath.endsWith('.gz')) {
    res.setHeader('Content-Encoding', 'gzip');
  } else {
    return;
  }

  res.setHeader('Content-Type', getUnityContentType(filePath));
  res.setHeader('Vary', 'Accept-Encoding');
}

app.use((req, res, next) => {
  const urlPath = req.path ?? '';
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

  if (!isHttps && urlPath.endsWith('.br')) {
    const safePath = path.normalize(urlPath).replace(/^\/+/, '');
    const filePath = path.join(publicDir, safePath);
    if (!filePath.startsWith(publicDir)) return next();

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) return next();
      res.setHeader('Content-Type', getUnityContentType(filePath));
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => next());
      stream.pipe(zlib.createBrotliDecompress()).pipe(res);
    });
    return;
  }

  if (urlPath.endsWith('.br') || urlPath.endsWith('.gz')) {
    setUnityEncodingHeaders(res, urlPath);
  }
  next();
});

app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res, filePath) => {
      setUnityEncodingHeaders(res, filePath);
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
    // console.log('[ws] incoming', { type, payload });

    game.handleMessage({ socket, type, payload });
  });

  socket.on('close', () => {
    game.leave({ socket });
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
