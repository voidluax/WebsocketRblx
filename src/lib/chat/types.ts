/**
 * RELAY protocol — shared type contract between the custom WebSocket server
 * and the browser client. Keep this module dependency-free so it can be
 * imported from both Node (server.ts / route handlers) and the browser bundle.
 */

export const WS_PATH = "/ws";

export const MESSAGE_LIMIT = 2000;
export const USERNAME_LIMIT = 24;
export const ROOM_NAME_LIMIT = 48;
export const HISTORY_LIMIT = 50;
export const MAX_CLIENTS_PER_ROOM = 64;

/** Close codes used by the server during the handshake phase. */
export const WS_CLOSE = {
  BAD_QUERY: 4400,
  ROOM_NOT_FOUND: 4404,
  ROOM_FULL: 4409,
} as const;

export interface PresenceUser {
  username: string;
  joinedAt: number;
}

export interface StoredMessage {
  id: string;
  username: string;
  text: string;
  at: number;
}

export interface RoomInfo {
  code: string;
  name: string;
  createdAt: number;
}

export interface RoomSummary extends RoomInfo {
  users: number;
}

/** Events the client sends over the socket. */
export type ClientEvent =
  | { type: "message"; text: string }
  | { type: "typing"; isTyping: boolean }
  | { type: "ping" };

/** Events the server broadcasts over the socket. */
export type ServerEvent =
  | {
      type: "welcome";
      room: RoomInfo;
      you: PresenceUser;
      users: PresenceUser[];
      messages: StoredMessage[];
    }
  | { type: "message"; message: StoredMessage }
  | { type: "user_joined"; user: PresenceUser }
  | { type: "user_left"; username: string }
  | { type: "presence"; users: PresenceUser[] }
  | { type: "typing"; username: string; isTyping: boolean }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; at: number };

/** Payload returned by POST /api/rooms. */
export interface CreateRoomResponse {
  ok: true;
  room: RoomInfo & {
    httpUrl: string;
    wsUrl: string;
  };
}

/** Shape the client keeps per typing user. */
export interface TypingState {
  username: string;
  until: number;
}
