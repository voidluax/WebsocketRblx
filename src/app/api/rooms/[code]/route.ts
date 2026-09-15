import { getRoomManager } from "@/lib/chat/rooms";
import { findPersistedRoom } from "@/lib/chat/persistence";
import { normalizeRoomCode } from "@/lib/chat/validate";
import { WS_PATH } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ code: string }> };

/**
 * GET /api/rooms/:code
 * Room metadata + current presence. Works for rooms created before a restart
 * (revived from Postgres when available).
 */
export async function GET(request: Request, context: RouteContext) {
  const { code: rawCode } = await context.params;
  const code = normalizeRoomCode(rawCode);

  if (!code) {
    return Response.json(
      { ok: false, error: "BAD_CODE", message: "Room codes are 4-8 chars of A-Z and 2-9." },
      { status: 400 },
    );
  }

  const manager = getRoomManager();
  let room = manager.get(code);

  if (!room) {
    const persisted = await findPersistedRoom(code);
    if (persisted) room = manager.adoptRoom(persisted);
  }

  if (!room) {
    return Response.json(
      { ok: false, error: "ROOM_NOT_FOUND", message: `Room ${code} does not exist.` },
      { status: 404 },
    );
  }

  const origin = new URL(request.url).origin;
  const wsOrigin = origin.replace(/^http/, "ws");

  return Response.json({
    ok: true,
    room: {
      code: room.code,
      name: room.name,
      createdAt: room.createdAt,
      users: room.presence(),
      connections: room.clients.size,
      httpUrl: `${origin}/r/${room.code}`,
      wsUrl: `${wsOrigin}${WS_PATH}?room=${room.code}&username=YOUR_USERNAME`,
    },
  });
}
