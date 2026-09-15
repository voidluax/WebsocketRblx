import { getRoomManager } from "@/lib/chat/rooms";
import { isPersistenceEnabled, persistRoom } from "@/lib/chat/persistence";
import { sanitizeRoomName } from "@/lib/chat/validate";
import { WS_PATH } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/rooms
 * Lists live rooms (with online user counts) plus server stats.
 */
export async function GET(request: Request) {
  const manager = getRoomManager();
  const stats = manager.stats();
  const origin = new URL(request.url).origin;

  return Response.json({
    ok: true,
    persistence: isPersistenceEnabled() ? "postgres" : "in-memory",
    stats,
    rooms: manager.summaries().map((room) => ({
      ...room,
      httpUrl: `${origin}/r/${room.code}`,
      wsUrl: `${origin.replace(/^http/, "ws")}${WS_PATH}?room=${room.code}&username=YOUR_USERNAME`,
    })),
  });
}

/**
 * POST /api/rooms
 * Body (JSON, all optional): { "name": "Lobby", "username": "neo" }
 * Creates a room and returns its join code.
 */
export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — everything is optional
  }

  const rawName =
    body && typeof body === "object" && "name" in body
      ? (body as { name?: unknown }).name
      : undefined;

  const manager = getRoomManager();
  // empty fallback → manager names it `Room ${code}` with the real code
  const name = sanitizeRoomName(rawName, "");
  const room = manager.createRoom(name || undefined);
  const persisted = await persistRoom({
    code: room.code,
    name: room.name,
    createdAt: room.createdAt,
  });

  const origin = new URL(request.url).origin;
  const wsOrigin = origin.replace(/^http/, "ws");

  return Response.json(
    {
      ok: true,
      room: {
        code: room.code,
        name: room.name,
        createdAt: room.createdAt,
        httpUrl: `${origin}/r/${room.code}`,
        wsUrl: `${wsOrigin}${WS_PATH}?room=${room.code}&username=YOUR_USERNAME`,
      },
      meta: {
        persistence: persisted ? "postgres" : "in-memory",
        hint: "Connect a WebSocket with ?room=CODE&username=NAME to start chatting.",
      },
    },
    { status: 201 },
  );
}
