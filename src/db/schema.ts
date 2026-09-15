import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * RELAY persistence layer. The app is fully functional without a database
 * (rooms and history live in memory); when DATABASE_URL is present these
 * tables make room codes and message history durable across restarts.
 * Matching CREATE TABLE IF NOT EXISTS statements run at boot in
 * src/lib/chat/bootstrap.ts, so no manual migration step is required.
 */
export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roomMessages = pgTable(
  "room_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomCode: text("room_code")
      .notNull()
      .references(() => rooms.code, { onDelete: "cascade" }),
    username: text("username").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("room_messages_room_code_created_at_idx").on(table.roomCode, table.createdAt),
  ],
);
