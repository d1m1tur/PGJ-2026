# PGJ Multiplayer Server (Node + WebSocket)

Minimal multiplayer web game server for prototyping: a server-authoritative tick updates player positions and broadcasts room state.

## Requirements

- Node.js 18+ recommended

## Run

```bash
npm install
npm run dev
```

Then open:

- http://localhost:3000

## Protocol (overview)

- Client -> Server
  - `room:join` `{ roomId, name }` (ack: `{ ok, roomId, playerId }`)
  - `player:input` `{ up, down, left, right }`
- Server -> Client
  - `room:state` `{ roomId, world, players: [{ id, name, color, x, y }] }`

## Notes

- Rooms are created on demand and removed when empty.
- Room IDs are constrained to `a-zA-Z0-9_-` (max 32 chars).
