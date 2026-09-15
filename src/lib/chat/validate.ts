/**
 * Input sanitizers shared by the HTTP API, the WS handshake and the client.
 * Pure & dependency-free — safe to import anywhere.
 */

import {
  MESSAGE_LIMIT,
  ROOM_NAME_LIMIT,
  USERNAME_LIMIT,
} from "./types";

/** Alphabet without ambiguous characters (no 0/O, 1/I/L). */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const CODE_RE = /^[A-Z2-9]{4,8}$/;
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.\-]{0,23}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);
const ROOM_NAME_ALLOWED_RE = /[^\p{L}\p{N} _.\-#]/gu;

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export function isValidRoomCode(input: unknown): boolean {
  return normalizeRoomCode(input) !== null;
}

export function sanitizeUsername(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const username = input.trim().replace(/\s+/g, " ");
  if (!username || username.length > USERNAME_LIMIT) return null;
  return USERNAME_RE.test(username) ? username : null;
}

export function sanitizeRoomName(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const name = input
    .replace(ROOM_NAME_ALLOWED_RE, "")
    .trim()
    .replace(/\s+/g, " ");
  if (!name) return fallback;
  return name.slice(0, ROOM_NAME_LIMIT);
}

export function sanitizeMessageText(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.replace(CONTROL_CHARS_RE, "").trim();
  if (!text) return null;
  return text.slice(0, MESSAGE_LIMIT);
}
