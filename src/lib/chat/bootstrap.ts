import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Idempotent schema bootstrap. Render free-tier web services have no shell
 * access, so instead of a manual `drizzle-kit push` step the server creates
 * the tables (if missing) during boot. Statements mirror src/db/schema.ts.
 */
export async function ensureChatTables(): Promise<boolean> {
  if (!db) return false;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rooms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL UNIQUE,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS room_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_code text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
        username text NOT NULL,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS room_messages_room_code_created_at_idx
      ON room_messages (room_code, created_at)
    `);
    return true;
  } catch (error) {
    console.error("[relay] schema bootstrap failed — running in memory only", error);
    return false;
  }
}
