import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { roomMessages, rooms } from "@/db/schema";
import type { RoomInfo, StoredMessage } from "./types";

/**
 * Optional Postgres persistence. Every helper degrades gracefully (returns
 * null / false) when DATABASE_URL is unset or the database is unreachable,
 * which keeps the free-tier single-process deployment fully functional.
 */

export async function persistRoom(info: RoomInfo): Promise<boolean> {
  if (!db) return false;
  try {
    await db
      .insert(rooms)
      .values({ code: info.code, name: info.name })
      .onConflictDoNothing({ target: rooms.code });
    return true;
  } catch (error) {
    console.error("[relay] failed to persist room", error);
    return false;
  }
}

export async function persistRoomMessage(
  roomCode: string,
  message: StoredMessage,
): Promise<boolean> {
  if (!db) return false;
  try {
    await db.insert(roomMessages).values({
      roomCode,
      username: message.username,
      body: message.text,
    });
    return true;
  } catch (error) {
    console.error("[relay] failed to persist message", error);
    return false;
  }
}

/** Look up a room row — used to revive codes after a process restart. */
export async function findPersistedRoom(code: string): Promise<RoomInfo | null> {
  if (!db) return null;
  try {
    const rows = await db
      .select({ code: rooms.code, name: rooms.name, createdAt: rooms.createdAt })
      .from(rooms)
      .where(eq(rooms.code, code))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { code: row.code, name: row.name, createdAt: row.createdAt.getTime() };
  } catch (error) {
    console.error("[relay] failed to load room", error);
    return null;
  }
}

export async function loadRecentMessages(
  code: string,
  limit: number,
): Promise<StoredMessage[] | null> {
  if (!db) return null;
  try {
    const rows = await db
      .select({
        id: roomMessages.id,
        username: roomMessages.username,
        body: roomMessages.body,
        createdAt: roomMessages.createdAt,
      })
      .from(roomMessages)
      .where(eq(roomMessages.roomCode, code))
      .orderBy(desc(roomMessages.createdAt))
      .limit(limit);
    return rows
      .reverse()
      .map((row) => ({
        id: row.id,
        username: row.username,
        text: row.body,
        at: row.createdAt.getTime(),
      }));
  } catch (error) {
    console.error("[relay] failed to load messages", error);
    return null;
  }
}

/** True when Postgres is configured (used for status surfaces only). */
export function isPersistenceEnabled(): boolean {
  return db !== null;
}
