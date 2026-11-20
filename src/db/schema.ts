import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

// The app's record of each member, keyed by the Gateway's user id.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

// One run of the image model: a creation from a prompt, or an edit of a source image.
export const generations = sqliteTable(
  "generations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind", { enum: ["generate", "edit"] }).notNull(),
    prompt: text("prompt").notNull(),
    style: text("style").notNull().default("none"),
    aspectRatio: text("aspect_ratio").notNull().default("1:1"),
    count: integer("count").notNull(),
    // For an edit started from a past image: that image's id.
    sourceImageId: text("source_image_id"),
    status: text("status", { enum: ["running", "succeeded", "failed"] })
      .notNull()
      .default("running"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (table) => [
    index("generations_user_created").on(table.userId, table.createdAt),
  ],
);

// The pictures a generation produced, stored in R2.
export const images = sqliteTable(
  "images",
  {
    id: text("id").primaryKey(),
    generationId: text("generation_id").notNull(),
    userId: text("user_id").notNull(),
    position: integer("position").notNull(),
    r2Key: text("r2_key").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("images_generation").on(table.generationId)],
);

// What went into a generation: reference images, or the source of an edit.
export const inputs = sqliteTable(
  "inputs",
  {
    id: text("id").primaryKey(),
    generationId: text("generation_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["reference", "source"] }).notNull(),
    position: integer("position").notNull(),
    r2Key: text("r2_key").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("inputs_generation").on(table.generationId)],
);

// Images each member made per UTC day, held against the daily limit.
export const dailyUsage = sqliteTable(
  "daily_usage",
  {
    userId: text("user_id").notNull(),
    day: text("day").notNull(),
    images: integer("images").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);

// Workspace settings: a single row, id 1.
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  dailyImageLimit: integer("daily_image_limit").notNull(),
});
