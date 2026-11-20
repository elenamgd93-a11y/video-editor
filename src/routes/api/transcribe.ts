import { createFileRoute } from "@tanstack/react-router";
import { jsonError, requireActor } from "@/server/http";
import {
  MAX_TRANSCRIBE_BYTES,
  SpeechUnavailableError,
  transcribe,
} from "@/server/speech";

// The browser sends a clip's audio as 16 kHz mono WAV; the answer is timed lines.
export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { actor, response } = await requireActor(request);
        if (!actor) return response;
        if (
          !(request.headers.get("content-type") ?? "").startsWith("audio/wav")
        )
          return jsonError(415, "Send WAV audio.");
        const body = new Uint8Array(await request.arrayBuffer());
        if (body.byteLength < 44) return jsonError(400, "The audio is empty.");
        if (body.byteLength > MAX_TRANSCRIBE_BYTES)
          return jsonError(
            413,
            "Captions can be made from up to five minutes of audio at a time.",
          );
        try {
          return Response.json({ segments: await transcribe(body) });
        } catch (error) {
          if (error instanceof SpeechUnavailableError)
            return jsonError(503, error.message);
          throw error;
        }
      },
    },
  },
});
