import { createFileRoute } from "@tanstack/react-router";
import { toSrt } from "@/lib/timeline";
import { jsonError, requireActor } from "@/server/http";
import { getProject } from "@/server/projects";

export const Route = createFileRoute("/api/projects/$id/captions.srt")({
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
        if (!/^[0-9a-f-]{36}$/.test(params.id))
          return jsonError(404, "Not found");
        const project = await getProject(actor.id, params.id);
        if (!project) return jsonError(404, "Not found");
        const filename = `${project.title.replace(/[^\w .-]+/g, "").trim() || "captions"}.srt`;
        return new Response(toSrt(project.timeline.captions), {
          headers: {
            "content-type": "application/x-subrip; charset=utf-8",
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          },
        });
      },
    },
  },
});
