import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getRoomManager } from "@/lib/chat/rooms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/health — liveness probe (Render/platform healthcheck target). */
export async function GET() {
  let database: "up" | "down" | "unconfigured" = "unconfigured";
  if (db) {
    try {
      await db.execute(sql`select 1`);
      database = "up";
    } catch {
      database = "down";
    }
  }

  const stats = getRoomManager().stats();

  return Response.json({
    ok: true,
    service: "relay",
    database,
    ws: "/ws",
    uptime: Math.round(process.uptime()),
    stats,
  });
}
