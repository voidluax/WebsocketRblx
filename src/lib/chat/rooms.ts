import { randomInt, randomUUID } from "node:crypto";
import { CODE_ALPHABET } from "./validate";
import type {
  PresenceUser,
  RoomInfo,
  RoomSummary,
  StoredMessage,
} from "./types";

const HISTORY_BUFFER = 100;

/** Minimal transport surface the manager needs — satisfied by `ws` sockets. */
export interface ChatTransport {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface LiveClient {
  id: string;
  username: string;
  joinedAt: number;
  transport: ChatTransport;
  /** sliding-window timestamps used for rate limiting */
  recentMessages: number[];
}

export class LiveRoom {
  readonly code: string;
  readonly name: string;
  readonly createdAt: number;
  readonly clients = new Set<LiveClient>();
  /** ring buffer of the most recent messages for fast welcome payloads */
  readonly messages: StoredMessage[] = [];
  hydrated = false;

  constructor(info: RoomInfo) {
    this.code = info.code;
    this.name = info.name;
    this.createdAt = info.createdAt;
  }

  pushMessage(message: StoredMessage) {
    this.messages.push(message);
    if (this.messages.length > HISTORY_BUFFER) {
      this.messages.splice(0, this.messages.length - HISTORY_BUFFER);
    }
  }

  /** presence list, deduped by username (a user may hold several sockets) */
  presence(): PresenceUser[] {
    const byUsername = new Map<string, number>();
    for (const client of this.clients) {
      const existing = byUsername.get(client.username);
      if (existing === undefined || client.joinedAt < existing) {
        byUsername.set(client.username, client.joinedAt);
      }
    }
    return [...byUsername.entries()]
      .map(([username, joinedAt]) => ({ username, joinedAt }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  connectionsOf(username: string): number {
    let count = 0;
    for (const client of this.clients) {
      if (client.username === username) count += 1;
    }
    return count;
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, LiveRoom>();

  generateCode(): string {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      let code = "";
      for (let i = 0; i < 6; i += 1) {
        code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    // practically unreachable — fall back to a longer code
    let code = "";
    for (let i = 0; i < 8; i += 1) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return code;
  }

  createRoom(name?: string): LiveRoom {
    const code = this.generateCode();
    const room = new LiveRoom({
      code,
      name: name?.trim() || `Room ${code}`,
      createdAt: Date.now(),
    });
    room.hydrated = true;
    this.rooms.set(code, room);
    return room;
  }

  /** Adopt a room that exists in persistent storage but not yet in memory. */
  adoptRoom(info: RoomInfo): LiveRoom {
    const existing = this.rooms.get(info.code);
    if (existing) return existing;
    const room = new LiveRoom(info);
    this.rooms.set(info.code, room);
    return room;
  }

  get(code: string): LiveRoom | undefined {
    return this.rooms.get(code);
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  makeClient(username: string, transport: ChatTransport): LiveClient {
    return {
      id: randomUUID(),
      username,
      joinedAt: Date.now(),
      transport,
      recentMessages: [],
    };
  }

  join(room: LiveRoom, client: LiveClient): { firstForUsername: boolean } {
    const firstForUsername = room.connectionsOf(client.username) === 0;
    room.clients.add(client);
    return { firstForUsername };
  }

  leave(room: LiveRoom, client: LiveClient): { lastForUsername: boolean } {
    room.clients.delete(client);
    return { lastForUsername: room.connectionsOf(client.username) === 0 };
  }

  summaries(): RoomSummary[] {
    return [...this.rooms.values()]
      .map((room) => ({
        code: room.code,
        name: room.name,
        createdAt: room.createdAt,
        users: room.presence().length,
      }))
      .sort((a, b) => b.users - a.users || b.createdAt - a.createdAt);
  }

  stats() {
    let connections = 0;
    let users = 0;
    for (const room of this.rooms.values()) {
      connections += room.clients.size;
      users += room.presence().length;
    }
    return { rooms: this.rooms.size, connections, users };
  }
}

const globalKey = "__relayRoomManager__";

type GlobalWithManager = typeof globalThis & {
  [globalKey]?: RoomManager;
};

/**
 * Single source of truth shared by the WS gateway (server.ts) and the Next.js
 * route handlers. Stored on globalThis because both sides load this module
 * through different bundlers but run in the same Node process.
 */
export function getRoomManager(): RoomManager {
  const g = globalThis as GlobalWithManager;
  if (!g[globalKey]) {
    g[globalKey] = new RoomManager();
  }
  return g[globalKey];
}
