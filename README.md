<div align="center">

# ⚡ RELAY

**Realtime chat over a raw WebSocket gateway — built to run on Render's free tier.**

One Node process serves the Next.js app **and** the WebSocket server on the same port.
Create a room over HTTP, get a 6-char code, chat over `wss://`.

</div>

---

## Why one process?

Render's free tier runs a **single long-lived Node process** per web service — which is
exactly what a `ws` WebSocket gateway needs. No Redis, no adapters, no external pub/sub.
The custom server (`server.ts`) boots Next.js and attaches a `WebSocketServer` to the
same HTTP server by intercepting `upgrade` events on `/ws`.

```
┌────────────────────────── Render Web Service (1 process) ──────────────────────────┐
│                                                                                    │
│   HTTP   https://name.onrender.com ──────────────►  Next.js (UI + /api routes)     │
│   WSS    wss://name.onrender.com/ws ────────────►  ws gateway (rooms, presence)    │
│                                                                                    │
│   Rooms + history live in memory ──► optionally persisted to Postgres (DATABASE_URL)│
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Deploy on Render (free tier)

1. Push this repo to GitHub → **Render Dashboard → New → Web Service** → pick the repo.
2. Use these settings:

| Setting          | Value                            |
| ---------------- | -------------------------------- |
| **Build Command**| `npm install && npm run build`   |
| **Start Command**| `npm run start`                  |
| Runtime          | Node                             |
| Instance Type    | Free                             |

`npm run start` runs `NODE_ENV=production tsx server.ts` — Next.js + WebSocket, one port.
Render injects `PORT` automatically; the server binds `0.0.0.0` for you.

3. **(Optional, recommended)** Add a free Postgres instance (*New → PostgreSQL*) and set:

| Env var        | Value                                            |
| -------------- | ------------------------------------------------ |
| `DATABASE_URL` | the *Internal Database URL* from Render Postgres |

> No DATABASE_URL? Everything still works — rooms and history stay in memory.
> With a database, room **codes survive restarts** and schema is created automatically
> at boot (`CREATE TABLE IF NOT EXISTS`, see `src/lib/chat/bootstrap.ts`).

### Free-tier notes (read me!)

- **Cold starts:** free instances sleep after ~15 min idle. First request/connection
  after sleep takes ~30–60s. The client auto-reconnects with backoff.
- **Keepalive:** the gateway pings every client every 30s so idle sockets aren't
  dropped by proxies.

Your endpoints once deployed (replace `name` with your service name):

```
UI          https://name.onrender.com
Rooms API   https://name.onrender.com/api/rooms
WebSocket   wss://name.onrender.com/ws
Health      https://name.onrender.com/api/health
```

---

## Run locally

```bash
npm install
cp .env.example .env        # optional: set DATABASE_URL for persistence
```

| Command               | What you get                                              |
| --------------------- | --------------------------------------------------------- |
| `npm run dev`         | Plain `next dev` (UI + API with HMR, **no WS gateway**)   |
| `npm run dev:server`  | Custom server in dev mode — **WS gateway included**       |
| `npm run build`       | Production build                                          |
| `npm run start`       | Production server (Next.js + WS gateway)                  |

Open http://localhost:3000 — create a room, share the code, chat.
Or skip the UI entirely and drive the API yourself ↓

---

# HTTP API

Base URL: `https://name.onrender.com` (or `http://localhost:3000`)

### `POST /api/rooms` — create a room, get a code

All fields optional. `name` (≤48 chars) gets a sensible default.

```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "content-type: application/json" \
  -d '{"name":"war room"}'
```

```jsonc
// 201 Created
{
  "ok": true,
  "room": {
    "code": "K7X2QM",                                    // ← the join code
    "name": "war room",
    "createdAt": 1767225600000,
    "httpUrl": "http://localhost:3000/r/K7X2QM",
    "wsUrl": "ws://localhost:3000/ws?room=K7X2QM&username=YOUR_USERNAME"
  },
  "meta": {
    "persistence": "postgres",                            // or "in-memory"
    "hint": "Connect a WebSocket with ?room=CODE&username=NAME to start chatting."
  }
}
```

### `GET /api/rooms` — list live rooms + stats

```bash
curl http://localhost:3000/api/rooms
```

```jsonc
{
  "ok": true,
  "persistence": "postgres",
  "stats": { "rooms": 3, "connections": 7, "users": 5 },
  "rooms": [
    { "code": "K7X2QM", "name": "war room", "createdAt": 1767225600000, "users": 4, "httpUrl": "…", "wsUrl": "…" }
  ]
}
```

### `GET /api/rooms/:code` — room info + presence

```bash
curl http://localhost:3000/api/rooms/K7X2QM
```

```jsonc
{
  "ok": true,
  "room": {
    "code": "K7X2QM",
    "name": "war room",
    "createdAt": 1767225600000,
    "users": [{ "username": "neo", "joinedAt": 1767225610000 }],
    "connections": 1,
    "httpUrl": "…",
    "wsUrl": "…"
  }
}
```

`404` → `{ "ok": false, "error": "ROOM_NOT_FOUND" }`

### `GET /api/rooms/:code/messages?limit=50` — history

Newest last, `limit` capped at 50. `404` for unknown codes.

### `GET /api/health` — liveness probe

```jsonc
{ "ok": true, "service": "relay", "database": "up", "ws": "/ws", "uptime": 421, "stats": { … } }
```

---

# WebSocket protocol

```
wss://name.onrender.com/ws?room=CODE&username=NAME
```

| Query param | Rules                                                        |
| ----------- | ------------------------------------------------------------ |
| `room`      | Room code from `POST /api/rooms` — 4–8 chars, `A–Z` and `2–9` |
| `username`  | 1–24 chars; letters, numbers, spaces, `_ . -`                 |

Handshake failures close the socket immediately with one of:

| Close code | Meaning                                  |
| ---------- | ---------------------------------------- |
| `4400`     | missing/invalid `room` or `username`     |
| `4404`     | room does not exist (create it via HTTP) |
| `4409`     | room is full (64 connections)            |

All frames are **JSON text messages**.

### Client → Server

```jsonc
{ "type": "message", "text": "hello room" }   // ≤2000 chars, trimmed
{ "type": "typing", "isTyping": true }        // broadcast to others
{ "type": "ping" }                            // app-level heartbeat → pong
```

### Server → Client

```jsonc
// sent once, right after joining
{ "type": "welcome",
  "room": { "code": "K7X2QM", "name": "war room", "createdAt": 1767225600000 },
  "you":  { "username": "neo", "joinedAt": 1767225610000 },
  "users": [{ "username": "trinity", "joinedAt": 1767225555000 }],
  "messages": [{ "id": "…", "username": "trinity", "text": "hi", "at": 1767225599000 }] }

{ "type": "message",  "message": { "id": "…", "username": "neo", "text": "hello room", "at": 1767225620000 } }
{ "type": "user_joined", "user": { "username": "morpheus", "joinedAt": 1767225630000 } }
{ "type": "user_left",   "username": "morpheus" }
{ "type": "presence",    "users": [ … ] }        // full deduped roster
{ "type": "typing",      "username": "trinity", "isTyping": true }
{ "type": "error",       "code": "RATE_LIMITED", "message": "…" }
{ "type": "pong",        "at": 1767225640000 }
```

**Rate limit:** max 30 messages per 10s per connection (`RATE_LIMITED` error event, socket stays open).

---

## Usage examples

### wscat

```bash
npx wscat -c "wss://name.onrender.com/ws?room=K7X2QM&username=neo"

> {"type":"message","text":"the matrix has you"}
< {"type":"message","message":{"username":"neo","text":"the matrix has you", …}}
```

### Browser / Node

```js
const ws = new WebSocket(
  "wss://name.onrender.com/ws?room=K7X2QM&username=neo"
);

ws.onopen = () => ws.send(JSON.stringify({ type: "message", text: "hello" }));
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

### Python (websockets)

```python
import asyncio, json, websockets

async def main():
    url = "wss://name.onrender.com/ws?room=K7X2QM&username=neo"
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps({"type": "message", "text": "hello from python"}))
        print(await ws.recv())

asyncio.run(main())
```

---

## Project structure

```
server.ts                       # custom server: HTTP (Next.js) + WS gateway on one port
src/
├─ app/
│  ├─ page.tsx                  # landing — create/join rooms, live stats, protocol docs
│  ├─ r/[code]/page.tsx         # chat room page
│  └─ api/
│     ├─ rooms/route.ts         # POST create room · GET list rooms
│     ├─ rooms/[code]/route.ts  # GET room info + presence
│     ├─ rooms/[code]/messages/route.ts  # GET history
│     └─ health/route.ts        # liveness probe
├─ components/                  # landing, chat room UI, backdrop, copy button, logo
├─ db/                          # drizzle schema (rooms, room_messages) — optional persistence
└─ lib/chat/
   ├─ types.ts                  # protocol contract (client ⇄ server frames)
   ├─ ws.ts                     # upgrade handling, routing, keepalive, rate limit
   ├─ rooms.ts                  # in-memory room manager (globalThis singleton)
   ├─ persistence.ts            # Postgres helpers (all gracefully optional)
   ├─ bootstrap.ts              # CREATE TABLE IF NOT EXISTS at boot
   └─ validate.ts               # code/username/message sanitizers
```

## Tech

Next.js (App Router) · `ws` WebSocketServer · Drizzle ORM + Postgres (optional) · Tailwind CSS · Render free tier ready.

<div align="center">MIT — stay on the air. ⚡</div>
