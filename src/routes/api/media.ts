import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db";
import { exports } from "@/db/schema";
import { jsonError, requireActor } from "@/server/http";
import {
  MAX_UPLOAD_BYTES,
  kindOfMime,
  storeMedia,
  type MediaSource,
} from "@/server/media";
import { canExportInto } from "@/server/projects";

const SOURCES: MediaSource[] = ["upload", "export", "photo"];

function positiveInt(value: string | null, max: number) {
  if (!value) return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
}

// Uploads go straight to object storage: the browser sends the file as the body.
export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { actor, response } = await requireActor(request);
        if (!actor) return response;
        const url = new URL(request.url);
        const mime = (request.headers.get("content-type") ?? "")
          .split(";")[0]!
          .trim()
          .toLowerCase();
        const kind = kindOfMime(mime);
        if (!kind) return jsonError(415, "That file type isn't supported.");
        const length = Number(request.headers.get("content-length") ?? "0");
        if (length > MAX_UPLOAD_BYTES)
          return jsonError(413, "Files can be up to 95 MB.");
        const source = (url.searchParams.get("source") ??
          "upload") as MediaSource;
        if (!SOURCES.includes(source)) return jsonError(400, "Unknown source.");
        let name = "Untitled";
        try {
          name =
            decodeURIComponent(request.headers.get("x-file-name") ?? "")
              .trim()
              .slice(0, 255) || name;
        } catch {
          /* keep the default */
        }
        const projectId = url.searchParams.get("projectId");
        if (source === "export") {
          if (!projectId) return jsonError(400, "An export needs its project.");
          const access = await canExportInto(actor.id, projectId);
          if (access === "missing") return jsonError(404, "Not found");
          if (access === "forbidden")
            return jsonError(403, "Viewers can't export this project.");
          if (kind !== "video") return jsonError(415, "An export is a video.");
        }
        const body = await request.arrayBuffer();
        if (body.byteLength === 0) return jsonError(400, "The file is empty.");
        if (body.byteLength > MAX_UPLOAD_BYTES)
          return jsonError(413, "Files can be up to 95 MB.");
        const settings = (url.searchParams.get("settings") ?? "{}").slice(
          0,
          500,
        );
        const stored = await storeMedia(
          {
            ownerId: actor.id,
            name,
            mime,
            kind,
            size: body.byteLength,
            durationMs: positiveInt(
              request.headers.get("x-media-duration"),
              24 * 3600 * 1000,
            ),
            width: positiveInt(request.headers.get("x-media-width"), 20000),
            height: positiveInt(request.headers.get("x-media-height"), 20000),
            source,
          },
          body,
          (mediaId) =>
            source === "export" && projectId
              ? [
                  db
                    .insert(exports)
                    .values({
                      id: crypto.randomUUID(),
                      projectId,
                      mediaId,
                      ownerId: actor.id,
                      settings,
                    }),
                ]
              : [],
        );
        return Response.json(
          { id: stored.id, name, kind, size: stored.size },
          { status: 201 },
        );
      },
    },
  },
});
