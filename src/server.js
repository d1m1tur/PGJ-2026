import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { Server } from 'socket.io';

import { createGame } from './game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST']
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const game = createGame({ io });

game.start();

io.on('connection', (socket) => {
  socket.emit('hello', { socketId: socket.id });

  socket.on('room:join', (payload, ack) => {
    const { roomId, name } = payload ?? {};
    try {
      const result = game.joinRoom({ socket, roomId, name });
      ack?.({ ok: true, ...result });
    } catch (err) {
      ack?.({ ok: false, error: err?.message ?? String(err) });
    }
  });

  socket.on('player:input', (payload) => {
    game.handleInput({ socket, input: payload });
  });

  socket.on('disconnect', () => {
    game.leave({ socket });
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
