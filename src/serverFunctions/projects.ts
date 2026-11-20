import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as projects from "@/server/projects";
import { listMedia } from "@/server/media";
import { actorOf } from "@/server/users";

export const getProjects = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorOf(context.user);
    const [list, templates] = await Promise.all([
      projects.listProjects(actor.id),
      projects.listTemplates(actor),
    ]);
    return { projects: list, templates };
  });

/** The editor's data: the project, its role, and the member's own library. */
export const getEditor = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const actor = await actorOf(context.user);
    if (!z.string().uuid().safeParse(data.id).success) return null;
    const project = await projects.getProject(actor.id, data.id);
    if (!project) return null;
    const [library, exportList] = await Promise.all([
      project.role === "viewer" ? Promise.resolve([]) : listMedia(actor.id),
      projects.listExports(actor.id, data.id),
    ]);
    return { project, library, exports: exportList };
  });

export const getExports = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) =>
    projects.listExports(context.user.id, data.id),
  );

export const createProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.createProjectInput.parse(data))
  .handler(async ({ data, context }) =>
    projects.createProject(await actorOf(context.user), data),
  );

export const renameProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.renameProjectInput.parse(data))
  .handler(({ data, context }) =>
    projects.renameProject(context.user.id, data),
  );

export const duplicateProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) =>
    projects.duplicateProject(context.user.id, data),
  );

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) =>
    projects.deleteProject(context.user.id, data),
  );

export const saveTimeline = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.saveTimelineInput.parse(data))
  .handler(({ data, context }) => projects.saveTimeline(context.user.id, data));

export const getShares = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) =>
    projects.listShares(context.user.id, data.id),
  );

export const shareProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.shareInput.parse(data))
  .handler(async ({ data, context }) => {
    try {
      await projects.shareProject(context.user.id, data);
      return { error: null };
    } catch (error) {
      if (error instanceof projects.ShareError) return { error: error.message };
      throw error;
    }
  });

export const setShareRole = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.setShareRoleInput.parse(data))
  .handler(({ data, context }) => projects.setShareRole(context.user.id, data));

export const revokeShare = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.revokeShareInput.parse(data))
  .handler(({ data, context }) => projects.revokeShare(context.user.id, data));

export const publishTemplate = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.publishInput.parse(data))
  .handler(({ data, context }) =>
    projects.publishTemplate(context.user.id, data),
  );

export const getTemplates = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) =>
    projects.listTemplates(await actorOf(context.user)),
  );

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context }) =>
    projects.deleteTemplate(await actorOf(context.user), data),
  );
