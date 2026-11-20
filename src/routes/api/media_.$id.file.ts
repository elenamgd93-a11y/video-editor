import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { jsonError, requireActor } from "@/server/http";
import { getReadableMedia } from "@/server/media";

function parseRange(header: string | null, size: number) {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, a, b] = match;
  if (!a && !b) return null;
  let start: number, end: number;
  if (!a) {
    start = Math.max(0, size - Number(b));
    end = size - 1;
  } else {
    start = Number(a);
    end = b ? Math.min(Number(b), size - 1) : size - 1;
  }
  if (start > end || start >= size) return "unsatisfiable" as const;
  return { start, end };
}

// Streams a file to whoever may read it, with byte ranges so video can seek.
export const Route = createFileRoute("/api/media_/$id/file")({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request;
        params: { id: string };
      }) => {
        const { actor, response } = await requireActor(request);
        if (!actor) return response;
        const item = await getReadableMedia(actor.id, params.id);
        if (!item) return jsonError(404, "Not found");
        const head = await env.files.head(item.r2_key);
        if (!head) return jsonError(404, "Not found");
        const size = head.size;
        const headers = new Headers({
          "content-type": item.mime,
          "accept-ranges": "bytes",
          "cache-control": "private, max-age=3600",
          "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(item.name)}`,
          "x-content-type-options": "nosniff",
        });
        const range = parseRange(request.headers.get("range"), size);
        if (range === "unsatisfiable") {
          headers.set("content-range", `bytes */${size}`);
          return new Response(null, { status: 416, headers });
        }
        if (range) {
          const object = await env.files.get(item.r2_key, {
            range: { offset: range.start, length: range.end - range.start + 1 },
          });
          if (!object) return jsonError(404, "Not found");
          headers.set(
            "content-range",
            `bytes ${range.start}-${range.end}/${size}`,
          );
          headers.set("content-length", String(range.end - range.start + 1));
          return new Response(object.body, { status: 206, headers });
        }
        const object = await env.files.get(item.r2_key);
        if (!object) return jsonError(404, "Not found");
        headers.set("content-length", String(size));
        return new Response(object.body, { status: 200, headers });
      },
    },
  },
});
