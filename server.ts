import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadEnvConfig } from "@next/env";

/**
 * RELAY custom server — one Node process serving:
 *   • Next.js (UI + HTTP API)                    → https://name.onrender.com
 *   • the chat WebSocket gateway (path: /ws)     → wss://name.onrender.com/ws
 *
 * Render free tier runs a single long-lived Node process, which is exactly
 * what a ws gateway needs: no adapters, no external pub/sub.
 *
 *   npm run build   →  next build
 *   npm run start   →  NODE_ENV=production tsx server.ts
 */
async function main() {
  // Load .env / .env.local before any module that reads process.env (db pool).
  loadEnvConfig(process.cwd());

  const dev = process.env.NODE_ENV !== "production";
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const hostname = process.env.HOSTNAME ?? "0.0.0.0";

  const { default: next } = await import("next");
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const { ensureChatTables } = await import("./src/lib/chat/bootstrap");
  const { attachRelayWebSocketServer } = await import("./src/lib/chat/ws");

  const persistence = await ensureChatTables();
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handle(req, res);
  });

  attachRelayWebSocketServer(server);

  server.listen(port, hostname, () => {
    console.log(`[relay] http  → http://${hostname}:${port}`);
    console.log(`[relay] ws    → ws://${hostname}:${port}/ws?room=CODE&username=NAME`);
    console.log(`[relay] db    → ${persistence ? "postgres (durable rooms)" : "in-memory"}`);
  });

  const shutdown = () => {
    console.log("[relay] shutting down…");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("[relay] fatal boot error", error);
  process.exit(1);
});
