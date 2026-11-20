import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  exports,
  media,
  projectMedia,
  projectShares,
  projects,
  templateMedia,
  templates,
  users,
} from "@/db/schema";
import {
  ASPECTS,
  emptyTimeline,
  mediaIdsOf,
  parseTimeline,
  timelineSchema,
  type Aspect,
  type Timeline,
} from "@/lib/timeline";
import { BUILT_IN_TEMPLATES } from "@/server/builtinTemplates";
import { getOwnMedia, mediaShown, type MediaItem } from "@/server/media";
import type { Actor } from "@/server/users";
import { userByEmail } from "@/server/users";

export type Role = "owner" | "editor" | "viewer";

export class NotFoundError extends Error {
  constructor() {
    super("Not found");
  }
}
export class ForbiddenError extends Error {}

const title = z.string().trim().min(1, "Name is required").max(120);
const uuid = z.string().uuid();

/** The user's role on a project, or null when they can't open it. */
export async function roleOn(userId: string, projectId: string) {
  const rows = await db.all<{ owner_id: string; role: string | null }>(sql`
    SELECT p.owner_id, s.role FROM projects p
    LEFT JOIN project_shares s ON s.project_id = p.id AND s.user_id = ${userId}
    WHERE p.id = ${projectId} LIMIT 1`);
  const row = rows[0];
  if (!row) return null;
  if (row.owner_id === userId) return "owner" as Role;
  return (row.role as Role | null) ?? null;
}

async function requireRole(userId: string, projectId: string, allowed: Role[]) {
  const role = await roleOn(userId, projectId);
  if (!role) throw new NotFoundError();
  if (!allowed.includes(role))
    throw new ForbiddenError("You can't do that on this project.");
  return role;
}

export async function listProjects(userId: string) {
  const rows = await db.all<{
    id: string;
    title: string;
    aspect: Aspect;
    updated_at: string;
    owner_id: string;
    owner_email: string | null;
    role: string | null;
  }>(sql`
    SELECT p.id, p.title, p.aspect, p.updated_at, p.owner_id, u.email AS owner_email, s.role
    FROM projects p
    LEFT JOIN project_shares s ON s.project_id = p.id AND s.user_id = ${userId}
    LEFT JOIN users u ON u.id = p.owner_id
    WHERE p.owner_id = ${userId} OR s.user_id IS NOT NULL
    ORDER BY p.updated_at DESC, p.id`);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    aspect: r.aspect,
    updatedAt: r.updated_at,
    role: (r.owner_id === userId ? "owner" : r.role) as Role,
    ownerEmail: r.owner_id === userId ? null : r.owner_email,
  }));
}

export async function getProject(userId: string, projectId: string) {
  const role = await roleOn(userId, projectId);
  if (!role) return null;
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) return null;
  const timeline = parseTimeline(row.timeline);
  const used = await db
    .select({ mediaId: projectMedia.mediaId })
    .from(projectMedia)
    .where(eq(projectMedia.projectId, projectId));
  const usedIds = used.map((u) => u.mediaId);
  const mediaRows: MediaItem[] = usedIds.length
    ? await db.select(mediaShown).from(media).where(inArray(media.id, usedIds))
    : [];
  return {
    id: row.id,
    title: row.title,
    aspect: row.aspect,
    version: row.version,
    role,
    timeline,
    media: Object.fromEntries(mediaRows.map((m) => [m.id, m])),
  };
}

export const createProjectInput = z
  .object({
    title,
    aspect: z.enum(ASPECTS),
    template: z.union([
      z.literal("blank"),
      z.string().regex(/^builtin-[a-z-]+$/),
      uuid,
    ]),
  })
  .strict();

/** Copy another member's template media into the user's library, so the new project owns what it uses. */
async function adoptMedia(
  userId: string,
  timeline: Timeline,
  mediaIds: string[],
) {
  const foreign = mediaIds.length
    ? await db.select().from(media).where(inArray(media.id, mediaIds))
    : [];
  const map = new Map<string, string>();
  for (const item of foreign) {
    if (item.ownerId === userId) continue;
    const object = await env.files.get(item.r2Key);
    if (!object) continue;
    const id = crypto.randomUUID();
    const r2Key = `media/${userId}/${id}`;
    await env.files.put(r2Key, object.body, {
      httpMetadata: { contentType: item.mime },
    });
    await db
      .insert(media)
      .values({ ...item, id, r2Key, ownerId: userId, createdAt: undefined });
    map.set(item.id, id);
  }
  const swap = (clips: Timeline["visual"]) =>
    clips
      .filter((c) => foreign.some((f) => f.id === c.mediaId))
      .map((c) => ({ ...c, mediaId: map.get(c.mediaId) ?? c.mediaId }));
  return {
    ...timeline,
    visual: swap(timeline.visual),
    audio: swap(timeline.audio),
  };
}

export async function createProject(
  actor: Actor,
  input: z.infer<typeof createProjectInput>,
) {
  let timeline = emptyTimeline();
  if (input.template.startsWith("builtin-")) {
    const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === input.template);
    if (!builtIn) throw new NotFoundError();
    timeline = builtIn.timeline;
  } else if (input.template !== "blank") {
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, input.template))
      .limit(1);
    if (!template) throw new NotFoundError();
    const parsed = parseTimeline(template.timeline);
    timeline = await adoptMedia(actor.id, parsed, mediaIdsOf(parsed));
  }
  const id = crypto.randomUUID();
  await db.batch([
    db
      .insert(projects)
      .values({
        id,
        ownerId: actor.id,
        title: input.title,
        aspect: input.aspect,
        timeline: JSON.stringify(timeline),
      }),
    ...mediaIdsOf(timeline).map((mediaId) =>
      db.insert(projectMedia).values({ projectId: id, mediaId }),
    ),
  ]);
  return { id };
}

export const projectIdInput = z.object({ id: uuid }).strict();
export const renameProjectInput = z.object({ id: uuid, title }).strict();

export async function renameProject(
  userId: string,
  { id, title }: z.infer<typeof renameProjectInput>,
) {
  await requireRole(userId, id, ["owner"]);
  await db
    .update(projects)
    .set({ title, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` })
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)));
}

export async function duplicateProject(userId: string, { id }: { id: string }) {
  await requireRole(userId, id, ["owner"]);
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) throw new NotFoundError();
  const copyId = crypto.randomUUID();
  const used = await db
    .select()
    .from(projectMedia)
    .where(eq(projectMedia.projectId, id));
  await db.batch([
    db
      .insert(projects)
      .values({
        id: copyId,
        ownerId: userId,
        title: `${row.title} (copy)`.slice(0, 120),
        aspect: row.aspect,
        timeline: row.timeline,
      }),
    ...used.map((u) =>
      db.insert(projectMedia).values({ projectId: copyId, mediaId: u.mediaId }),
    ),
  ]);
  return { id: copyId };
}

export async function deleteProject(userId: string, { id }: { id: string }) {
  await requireRole(userId, id, ["owner"]);
  await db.batch([
    db.delete(projectShares).where(eq(projectShares.projectId, id)),
    db.delete(projectMedia).where(eq(projectMedia.projectId, id)),
    db.delete(exports).where(eq(exports.projectId, id)),
    db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, userId))),
  ]);
}

export const saveTimelineInput = z
  .object({
    id: uuid,
    baseVersion: z.number().int().min(1),
    timeline: timelineSchema,
  })
  .strict();

/**
 * Save only over the version the editor loaded. A stale save is refused
 * (`conflict`) so two editors never silently overwrite each other.
 */
export async function saveTimeline(
  userId: string,
  input: z.infer<typeof saveTimelineInput>,
) {
  await requireRole(userId, input.id, ["owner", "editor"]);
  const ids = mediaIdsOf(input.timeline);
  if (ids.length) {
    const already = new Set(
      (
        await db
          .select()
          .from(projectMedia)
          .where(eq(projectMedia.projectId, input.id))
      ).map((r) => r.mediaId),
    );
    const own = new Set(
      (
        await db
          .select({ id: media.id })
          .from(media)
          .where(and(inArray(media.id, ids), eq(media.ownerId, userId)))
      ).map((r) => r.id),
    );
    if (ids.some((m) => !already.has(m) && !own.has(m)))
      throw new ForbiddenError("A clip uses media you can't add.");
  }
  const saveId = crypto.randomUUID();
  const D = env.DB;
  const mine = "(SELECT save_id FROM projects WHERE id = ?) = ?";
  const results = await D.batch([
    D.prepare(
      "UPDATE projects SET timeline = ?, version = version + 1, save_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND version = ?",
    ).bind(JSON.stringify(input.timeline), saveId, input.id, input.baseVersion),
    D.prepare(
      `DELETE FROM project_media WHERE project_id = ? AND ${mine}`,
    ).bind(input.id, input.id, saveId),
    ...ids.map((mediaId) =>
      D.prepare(
        `INSERT INTO project_media (project_id, media_id) SELECT ?, ? WHERE ${mine}`,
      ).bind(input.id, mediaId, input.id, saveId),
    ),
  ]);
  if (!results[0]?.meta.changes) return { conflict: true as const };
  return { conflict: false as const, version: input.baseVersion + 1 };
}

// Sharing

export async function listShares(userId: string, projectId: string) {
  await requireRole(userId, projectId, ["owner"]);
  return db
    .select({
      userId: projectShares.userId,
      email: users.email,
      role: projectShares.role,
    })
    .from(projectShares)
    .innerJoin(users, eq(users.id, projectShares.userId))
    .where(eq(projectShares.projectId, projectId))
    .orderBy(users.email);
}

export const shareInput = z
  .object({
    id: uuid,
    email: z.string().trim().email("Enter an email address"),
    role: z.enum(["viewer", "editor"]),
  })
  .strict();

export class ShareError extends Error {}

export async function shareProject(
  userId: string,
  input: z.infer<typeof shareInput>,
) {
  await requireRole(userId, input.id, ["owner"]);
  const target = await userByEmail(input.email);
  if (!target)
    throw new ShareError("No member with that email has opened this app yet.");
  if (target.id === userId)
    throw new ShareError("You already own this project.");
  await db
    .insert(projectShares)
    .values({ projectId: input.id, userId: target.id, role: input.role })
    .onConflictDoUpdate({
      target: [projectShares.projectId, projectShares.userId],
      set: { role: input.role },
    });
}

export const setShareRoleInput = z
  .object({
    id: uuid,
    userId: z.string().min(1).max(200),
    role: z.enum(["viewer", "editor"]),
  })
  .strict();

export async function setShareRole(
  userId: string,
  input: z.infer<typeof setShareRoleInput>,
) {
  await requireRole(userId, input.id, ["owner"]);
  await db
    .update(projectShares)
    .set({ role: input.role })
    .where(
      and(
        eq(projectShares.projectId, input.id),
        eq(projectShares.userId, input.userId),
      ),
    );
}

export const revokeShareInput = z
  .object({ id: uuid, userId: z.string().min(1).max(200) })
  .strict();

export async function revokeShare(
  userId: string,
  input: z.infer<typeof revokeShareInput>,
) {
  await requireRole(userId, input.id, ["owner"]);
  await db
    .delete(projectShares)
    .where(
      and(
        eq(projectShares.projectId, input.id),
        eq(projectShares.userId, input.userId),
      ),
    );
}

// Exports

export async function listExports(userId: string, projectId: string) {
  await requireRole(userId, projectId, ["owner", "editor", "viewer"]);
  return db
    .select({
      id: exports.id,
      mediaId: exports.mediaId,
      name: media.name,
      size: media.size,
      settings: exports.settings,
      createdAt: exports.createdAt,
    })
    .from(exports)
    .innerJoin(media, eq(media.id, exports.mediaId))
    .where(eq(exports.projectId, projectId))
    .orderBy(desc(exports.createdAt));
}

export async function canExportInto(userId: string, projectId: string) {
  const role = await roleOn(userId, projectId);
  if (!role) return "missing" as const;
  return role === "viewer" ? ("forbidden" as const) : ("ok" as const);
}

// Templates

export async function listTemplates(actor: Actor) {
  const rows = await db
    .select({
      id: templates.id,
      title: templates.title,
      aspect: templates.aspect,
      authorId: templates.authorId,
      authorEmail: users.email,
      createdAt: templates.createdAt,
    })
    .from(templates)
    .leftJoin(users, eq(users.id, templates.authorId))
    .orderBy(desc(templates.createdAt));
  return [
    ...BUILT_IN_TEMPLATES.map((t) => ({
      id: t.id,
      title: t.title,
      aspect: t.aspect,
      builtIn: true,
      authorEmail: null as string | null,
      canDelete: false,
    })),
    ...rows.map((t) => ({
      id: t.id,
      title: t.title,
      aspect: t.aspect,
      builtIn: false,
      authorEmail: t.authorEmail,
      canDelete: t.authorId === actor.id || actor.admin,
    })),
  ];
}

export const publishInput = z.object({ id: uuid, title }).strict();

export async function publishTemplate(
  userId: string,
  input: z.infer<typeof publishInput>,
) {
  await requireRole(userId, input.id, ["owner"]);
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, input.id))
    .limit(1);
  if (!row) throw new NotFoundError();
  const timeline = parseTimeline(row.timeline);
  const ids = mediaIdsOf(timeline);
  for (const mediaId of ids)
    if (!(await getOwnMedia(userId, mediaId)))
      throw new ForbiddenError("Only your own media can go into a template.");
  const id = crypto.randomUUID();
  await db.batch([
    db
      .insert(templates)
      .values({
        id,
        authorId: userId,
        title: input.title,
        aspect: row.aspect,
        timeline: row.timeline,
      }),
    ...ids.map((mediaId) =>
      db.insert(templateMedia).values({ templateId: id, mediaId }),
    ),
  ]);
  return { id };
}

export async function deleteTemplate(actor: Actor, { id }: { id: string }) {
  const [row] = await db
    .select({ authorId: templates.authorId })
    .from(templates)
    .where(eq(templates.id, id))
    .limit(1);
  if (!row) throw new NotFoundError();
  if (row.authorId !== actor.id && !actor.admin)
    throw new ForbiddenError(
      "Only its author or an admin can delete this template.",
    );
  await db.batch([
    db.delete(templateMedia).where(eq(templateMedia.templateId, id)),
    db.delete(templates).where(or(eq(templates.id, id))),
  ]);
}
