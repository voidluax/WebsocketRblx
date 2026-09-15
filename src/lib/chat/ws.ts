import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { getRoomManager, type LiveClient, type LiveRoom } from "./rooms";
import {
  findPersistedRoom,
  isPersistenceEnabled,
  loadRecentMessages,
  persistRoomMessage,
} from "./persistence";
import {
  normalizeRoomCode,
  sanitizeMessageText,
  sanitizeUsername,
} from "./validate";
import {
  HISTORY_LIMIT,
  MAX_CLIENTS_PER_ROOM,
  WS_CLOSE,
  WS_PATH,
  type ClientEvent,
  type ServerEvent,
  type StoredMessage,
} from "./types";

const ACCEPTED_PATHS = new Set([WS_PATH, "/api/ws"]);
const KEEPALIVE_INTERVAL_MS = 30_000;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 30;

type RelaySocket = WebSocket & {
  isAlive?: boolean;
  relayClient?: LiveClient;
  relayRoom?: LiveRoom;
};

function sendEvent(socket: WebSocket, event: ServerEvent) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}

function broadcast(room: LiveRoom, event: ServerEvent, except?: LiveClient) {
  const payload = JSON.stringify(event);
  for (const client of room.clients) {
    if (except && client.id === except.id) continue;
    client.transport.send(payload);
  }
}

/** bridge between the transport-agnostic manager and a real ws socket */
function makeTransport(ws: WebSocket) {
  return {
    send(data: string) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    },
    close(code?: number, reason?: string) {
      ws.close(code, reason);
    },
  };
}

function rawSize(raw: unknown): number {
  if (Array.isArray(raw)) return raw.reduce((n, b) => n + b.length, 0);
  if (raw instanceof ArrayBuffer) return raw.byteLength;
  if (raw && typeof raw === "object" && "byteLength" in raw) {
    return (raw as { byteLength: number }).byteLength;
  }
  return 0;
}

function isRateLimited(client: LiveClient): boolean {
  const now = Date.now();
  client.recentMessages = client.recentMessages.filter(
    (at) => now - at < RATE_WINDOW_MS,
  );
  if (client.recentMessages.length >= RATE_MAX_MESSAGES) return true;
  client.recentMessages.push(now);
  return false;
}

async function resolveRoom(
  code: string,
): Promise<LiveRoom | null> {
  const manager = getRoomManager();
  const existing = manager.get(code);
  if (existing) return existing;
  // revive rooms that were created before a restart / cold start
  const persisted = await findPersistedRoom(code);
  if (!persisted) return null;
  return manager.adoptRoom(persisted);
}

async function hydrateHistory(room: LiveRoom) {
  if (room.hydrated) return;
  room.hydrated = true;
  const persisted = await loadRecentMessages(room.code, HISTORY_LIMIT);
  if (persisted) {
    for (const message of persisted) room.pushMessage(message);
  }
}

async function handleConnection(ws: RelaySocket, req: IncomingMessage) {
  const manager = getRoomManager();
  const url = new URL(req.url ?? "/", "http://localhost");

  const code = normalizeRoomCode(url.searchParams.get("room"));
  const username = sanitizeUsername(url.searchParams.get("username"));

  if (!code || !username) {
    sendEvent(ws, {
      type: "error",
      code: "BAD_QUERY",
      message:
        "Provide ?room=CODE (4-8 chars) and &username=NAME (letters, numbers, space, _ . -)",
    });
    ws.close(WS_CLOSE.BAD_QUERY, "room and username query params required");
    return;
  }

  const room = await resolveRoom(code);
  if (!room) {
    sendEvent(ws, {
      type: "error",
      code: "ROOM_NOT_FOUND",
      message: `Room ${code} does not exist. Create it first with POST /api/rooms.`,
    });
    ws.close(WS_CLOSE.ROOM_NOT_FOUND, "room not found");
    return;
  }

  if (room.clients.size >= MAX_CLIENTS_PER_ROOM) {
    sendEvent(ws, {
      type: "error",
      code: "ROOM_FULL",
      message: `Room ${code} is full (${MAX_CLIENTS_PER_ROOM} connections).`,
    });
    ws.close(WS_CLOSE.ROOM_FULL, "room full");
    return;
  }

  await hydrateHistory(room);

  const client = manager.makeClient(username, makeTransport(ws));
  ws.relayClient = client;
  ws.relayRoom = room;

  const { firstForUsername } = manager.join(room, client);
  const presence = room.presence();

  sendEvent(ws, {
    type: "welcome",
    room: { code: room.code, name: room.name, createdAt: room.createdAt },
    you: { username: client.username, joinedAt: client.joinedAt },
    users: presence,
    messages: room.messages.slice(-HISTORY_LIMIT),
  });

  if (firstForUsername) {
    broadcast(
      room,
      { type: "user_joined", user: { username, joinedAt: client.joinedAt } },
      client,
    );
  }
  broadcast(room, { type: "presence", users: presence }, client);

  ws.on("message", (raw) => {
    if (rawSize(raw) > 16 * 1024) return;
    let event: ClientEvent;
    try {
      event = JSON.parse(raw.toString()) as ClientEvent;
    } catch {
      sendEvent(ws, { type: "error", code: "BAD_JSON", message: "Messages must be valid JSON." });
      return;
    }

    if (event.type === "ping") {
      sendEvent(ws, { type: "pong", at: Date.now() });
      return;
    }

    if (event.type === "typing") {
      broadcast(
        room,
        { type: "typing", username: client.username, isTyping: Boolean(event.isTyping) },
        client,
      );
      return;
    }

    if (event.type === "message") {
      const text = sanitizeMessageText(event.text);
      if (!text) return;
      if (isRateLimited(client)) {
        sendEvent(ws, {
          type: "error",
          code: "RATE_LIMITED",
          message: "You are sending messages too fast — slow down.",
        });
        return;
      }
      const message: StoredMessage = {
        id: randomUUID(),
        username: client.username,
        text,
        at: Date.now(),
      };
      room.pushMessage(message);
      broadcast(room, { type: "message", message });
      void persistRoomMessage(room.code, message);
    }
  });

  const cleanup = () => {
    if (!ws.relayClient || !ws.relayRoom) return;
    const leavingClient = ws.relayClient;
    const leavingRoom = ws.relayRoom;
    ws.relayClient = undefined;
    ws.relayRoom = undefined;
    const { lastForUsername } = manager.leave(leavingRoom, leavingClient);
    if (lastForUsername) {
      broadcast(leavingRoom, {
        type: "typing",
        username: leavingClient.username,
        isTyping: false,
      });
      broadcast(leavingRoom, {
        type: "user_left",
        username: leavingClient.username,
      });
    }
    broadcast(leavingRoom, { type: "presence", users: leavingRoom.presence() });
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

/**
 * Attaches the RELAY WebSocket gateway to an existing Node HTTP server.
 * Handles the upgrade only on /ws (and /api/ws); everything else is left
 * for Next.js or rejected.
 */
export function attachRelayWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on("upgrade", (req, socket, head) => {
    let pathname = "/";
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      // fall through with default
    }

    if (ACCEPTED_PATHS.has(pathname)) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        const relay = ws as RelaySocket;
        relay.isAlive = true;
        relay.on("pong", () => {
          relay.isAlive = true;
        });
        wss.emit("connection", relay, req);
      });
      return;
    }

    if (process.env.NODE_ENV === "production") {
      socket.destroy();
      return;
    }
    // in dev, leave the socket alone so Next.js HMR websockets still work
  });

  wss.on("connection", (ws: RelaySocket, req: IncomingMessage) => {
    void handleConnection(ws, req).catch((error) => {
      console.error("[relay] connection error", error);
      try {
        ws.close(1011, "internal error");
      } catch {
        // socket already gone
      }
    });
  });

  // Render's proxy drops idle connections — ping every client regularly.
  const keepAlive = setInterval(() => {
    for (const ws of wss.clients) {
      const relay = ws as RelaySocket;
      if (relay.isAlive === false) {
        relay.terminate();
        continue;
      }
      relay.isAlive = false;
      relay.ping();
    }
  }, KEEPALIVE_INTERVAL_MS);
  keepAlive.unref();

  console.log(
    `[relay] websocket gateway attached on ${WS_PATH} (persistence: ${
      isPersistenceEnabled() ? "postgres" : "in-memory"
    })`,
  );

  return wss;
}
