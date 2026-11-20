import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  text(name)
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/** Members the app has seen, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at"),
});

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["video", "audio", "image"] }).notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    r2Key: text("r2_key").notNull(),
    source: text("source", {
      enum: ["upload", "voiceover", "export", "photo"],
    }).notNull(),
    createdAt: timestamp("created_at"),
  },
  (t) => [index("media_owner_idx").on(t.ownerId, t.createdAt)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    aspect: text("aspect", { enum: ["16:9", "9:16", "1:1", "4:5"] }).notNull(),
    timeline: text("timeline").notNull(),
    version: integer("version").notNull().default(1),
    saveId: text("save_id").notNull().default(""),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [index("projects_owner_idx").on(t.ownerId)],
);

export const projectShares = sqliteTable(
  "project_shares",
  {
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["viewer", "editor"] }).notNull(),
    createdAt: timestamp("created_at"),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_shares_user_idx").on(t.userId),
  ],
);

/** Which media a project's timeline uses: who may stream them follows the project. */
export const projectMedia = sqliteTable(
  "project_media",
  {
    projectId: text("project_id").notNull(),
    mediaId: text("media_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.mediaId] }),
    index("project_media_media_idx").on(t.mediaId),
  ],
);

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  aspect: text("aspect", { enum: ["16:9", "9:16", "1:1", "4:5"] }).notNull(),
  timeline: text("timeline").notNull(),
  createdAt: timestamp("created_at"),
});

export const templateMedia = sqliteTable(
  "template_media",
  {
    templateId: text("template_id").notNull(),
    mediaId: text("media_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.templateId, t.mediaId] }),
    index("template_media_media_idx").on(t.mediaId),
  ],
);

export const exports = sqliteTable(
  "exports",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    mediaId: text("media_id").notNull(),
    ownerId: text("owner_id").notNull(),
    settings: text("settings").notNull(),
    createdAt: timestamp("created_at"),
  },
  (t) => [
    index("exports_project_idx").on(t.projectId),
    index("exports_media_idx").on(t.mediaId),
  ],
);
