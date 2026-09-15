import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The database is optional by design: RELAY targets free-tier hosting where
 * a Postgres add-on may or may not be provisioned. When DATABASE_URL is set
 * we expose a pooled Drizzle client; otherwise `db` is null and the app
 * falls back to in-memory state.
 */
const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __relayPgPool?: Pool;
};

function createPool(): Pool | null {
  if (!databaseUrl) return null;
  if (globalForDb.__relayPgPool) return globalForDb.__relayPgPool;
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__relayPgPool = pool;
  }
  return pool;
}

export const pool = createPool();
export const db = pool ? drizzle(pool) : null;

export type Db = NonNullable<typeof db>;
