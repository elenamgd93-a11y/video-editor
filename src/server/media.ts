import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { db } from "@/db";
import { exports, media, projectMedia, templateMedia } from "@/db/schema";

export type MediaKind = "video" | "audio" | "image";
export type MediaSource = "upload" | "voiceover" | "export" | "photo";

export const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;

const ALLOWED: Record<string, MediaKind> = {
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "audio/mpeg": "audio",
  "audio/mp3": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/wave": "audio",
  "audio/ogg": "audio",
  "audio/webm": "audio",
  "audio/mp4": "audio",
  "audio/aac": "audio",
  "audio/x-m4a": "audio",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
};

export function kindOfMime(mime: string): MediaKind | null {
  return ALLOWED[mime.split(";")[0]!.trim().toLowerCase()] ?? null;
}

export const mediaShown = {
  id: media.id,
  name: media.name,
  kind: media.kind,
  mime: media.mime,
  size: media.size,
  durationMs: media.durationMs,
  width: media.width,
  height: media.height,
  source: media.source,
  createdAt: media.createdAt,
};
export type MediaItem = {
  id: string;
  name: string;
  kind: MediaKind;
  mime: string;
  size: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  source: MediaSource;
  createdAt: string;
};

export function listMedia(
  userId: string,
  source?: MediaSource,
): Promise<MediaItem[]> {
  return db
    .select(mediaShown)
    .from(media)
    .where(
      source
        ? and(eq(media.ownerId, userId), eq(media.source, source))
        : eq(media.ownerId, userId),
    )
    .orderBy(desc(media.createdAt), media.id);
}

export async function getOwnMedia(userId: string, id: string) {
  const [row] = await db
    .select({ ...mediaShown, r2Key: media.r2Key, ownerId: media.ownerId })
    .from(media)
    .where(and(eq(media.id, id), eq(media.ownerId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * A media item the user may stream: their own, one used by a project they
 * own or that is shared with them, one exported from such a project, or one
 * used by a published template.
 */
export async function getReadableMedia(userId: string, id: string) {
  const rows = await db.all<{
    id: string;
    r2_key: string;
    mime: string;
    name: string;
    size: number;
  }>(sql`
    SELECT m.id, m.r2_key, m.mime, m.name, m.size FROM media m
    WHERE m.id = ${id} AND (
      m.owner_id = ${userId}
      OR EXISTS (
        SELECT 1 FROM project_media pm JOIN projects p ON p.id = pm.project_id
        WHERE pm.media_id = m.id AND (p.owner_id = ${userId} OR EXISTS (
          SELECT 1 FROM project_shares s WHERE s.project_id = p.id AND s.user_id = ${userId})))
      OR EXISTS (
        SELECT 1 FROM exports e JOIN projects p ON p.id = e.project_id
        WHERE e.media_id = m.id AND (p.owner_id = ${userId} OR EXISTS (
          SELECT 1 FROM project_shares s WHERE s.project_id = p.id AND s.user_id = ${userId})))
      OR EXISTS (SELECT 1 FROM template_media tm WHERE tm.media_id = m.id)
    ) LIMIT 1`);
  return rows[0] ?? null;
}

/** Metadata of the given media ids the user may read, keyed by id. */
export async function readableMediaMap(userId: string, ids: string[]) {
  const out: Record<string, MediaItem> = {};
  if (ids.length === 0) return out;
  const rows = await db
    .select(mediaShown)
    .from(media)
    .where(inArray(media.id, ids));
  for (const row of rows) {
    if (await getReadableMedia(userId, row.id)) out[row.id] = row;
  }
  return out;
}

export interface NewMedia {
  ownerId: string;
  name: string;
  mime: string;
  kind: MediaKind;
  size: number;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  source: MediaSource;
}

/** Store bytes in R2 and record them, with any rows that go with them. The key is always the server's. */
export async function storeMedia(
  input: NewMedia,
  body: ReadableStream | ArrayBuffer | Uint8Array,
  extra: (id: string) => BatchItem<"sqlite">[] = () => [],
) {
  const id = crypto.randomUUID();
  const r2Key = `media/${input.ownerId}/${id}`;
  const stored = await env.files.put(r2Key, body, {
    httpMetadata: { contentType: input.mime },
  });
  const size = stored?.size ?? input.size;
  try {
    await db.batch([
      db.insert(media).values({ ...input, size, id, r2Key }),
      ...extra(id),
    ]);
  } catch (error) {
    await env.files.delete(r2Key);
    throw error;
  }
  return { id, size };
}

export const renameMediaInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1, "Name is required").max(255),
  })
  .strict();

export async function renameMedia(
  userId: string,
  { id, name }: z.infer<typeof renameMediaInput>,
) {
  const [row] = await db
    .update(media)
    .set({ name })
    .where(and(eq(media.id, id), eq(media.ownerId, userId)))
    .returning({ id: media.id });
  return row ?? null;
}

export const setDurationInput = z
  .object({
    id: z.string().uuid(),
    durationMs: z
      .number()
      .int()
      .min(0)
      .max(24 * 3600 * 1000),
  })
  .strict();

export async function setMediaDuration(
  userId: string,
  { id, durationMs }: z.infer<typeof setDurationInput>,
) {
  await db
    .update(media)
    .set({ durationMs })
    .where(and(eq(media.id, id), eq(media.ownerId, userId)));
}

export class InUseError extends Error {}

export async function deleteMedia(userId: string, id: string) {
  const item = await getOwnMedia(userId, id);
  if (!item) return null;
  const [inProjects] = await db
    .select({ n: sql<number>`count(*)` })
    .from(projectMedia)
    .where(eq(projectMedia.mediaId, id));
  const [inTemplates] = await db
    .select({ n: sql<number>`count(*)` })
    .from(templateMedia)
    .where(eq(templateMedia.mediaId, id));
  const projectsUsing = inProjects?.n ?? 0;
  if (projectsUsing > 0)
    throw new InUseError(
      `It's used in ${projectsUsing === 1 ? "a project" : `${projectsUsing} projects`}. Remove it from the timeline first.`,
    );
  if ((inTemplates?.n ?? 0) > 0)
    throw new InUseError(
      "It's used in a published template. Delete the template first.",
    );
  await db.batch([
    db.delete(exports).where(eq(exports.mediaId, id)),
    db.delete(media).where(and(eq(media.id, id), eq(media.ownerId, userId))),
  ]);
  await env.files.delete(item.r2Key);
  return { id };
}
