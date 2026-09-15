import { getRoomManager } from "@/lib/chat/rooms";
import { findPersistedRoom, loadRecentMessages } from "@/lib/chat/persistence";
import { normalizeRoomCode } from "@/lib/chat/validate";
import { HISTORY_LIMIT } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ code: string }> };

/**
 * GET /api/rooms/:code/messages?limit=50
 * Recent message history (newest last). Sourced from the in-memory ring
 * buffer, falling back to Postgres history when the room was just revived.
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

  const url = new URL(request.url);
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), HISTORY_LIMIT)
    : HISTORY_LIMIT;

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

  let messages = room.messages.slice(-limit);
  if (messages.length === 0) {
    const persisted = await loadRecentMessages(code, limit);
    if (persisted) messages = persisted;
  }

  return Response.json({ ok: true, room: code, count: messages.length, messages });
}
