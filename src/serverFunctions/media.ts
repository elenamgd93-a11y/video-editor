import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as media from "@/server/media";
import { actorOf } from "@/server/users";

export const getLibrary = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorOf(context.user);
    return media.listMedia(actor.id);
  });

export const getMediaItem = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    if (!z.string().uuid().safeParse(data.id).success) return null;
    const item = await media.getOwnMedia(context.user.id, data.id);
    if (!item) return null;
    const { r2Key: _key, ownerId: _owner, ...shown } = item;
    return shown;
  });

export const renameMedia = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => media.renameMediaInput.parse(data))
  .handler(async ({ data, context }) => {
    if (!(await media.renameMedia(context.user.id, data)))
      throw new Error("That file is gone.");
  });

export const setMediaDuration = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => media.setDurationInput.parse(data))
  .handler(({ data, context }) =>
    media.setMediaDuration(context.user.id, data),
  );

export const deleteMedia = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid() }).strict().parse(data),
  )
  .handler(async ({ data, context }) => {
    try {
      await media.deleteMedia(context.user.id, data.id);
      return { error: null };
    } catch (error) {
      if (error instanceof media.InUseError) return { error: error.message };
      throw error;
    }
  });
