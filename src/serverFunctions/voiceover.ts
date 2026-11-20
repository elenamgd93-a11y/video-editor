import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { listMedia, storeMedia } from "@/server/media";
import {
  MAX_SPEECH_CHARS,
  SpeechUnavailableError,
  VOICES,
  synthesize,
  type Voice,
} from "@/server/speech";
import { actorOf } from "@/server/users";

export const getVoiceovers = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    const actor = await actorOf(context.user);
    return listMedia(actor.id, "voiceover");
  });

const generateInput = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Type something to read out")
      .max(MAX_SPEECH_CHARS),
    voice: z.enum(Object.keys(VOICES) as [Voice, ...Voice[]]),
  })
  .strict();

export const generateVoiceover = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => generateInput.parse(data))
  .handler(async ({ data, context }) => {
    const actor = await actorOf(context.user);
    try {
      const audio = await synthesize(data.text, data.voice);
      const words = data.text.replace(/\s+/g, " ").slice(0, 48).trim();
      const name = `${words}${data.text.length > 48 ? "…" : ""}`;
      const stored = await storeMedia(
        {
          ownerId: actor.id,
          name,
          mime: audio.mime,
          kind: "audio",
          size: audio.bytes.byteLength,
          source: "voiceover",
        },
        audio.bytes,
      );
      return { id: stored.id, error: null };
    } catch (error) {
      if (error instanceof SpeechUnavailableError)
        return { id: null, error: error.message };
      throw error;
    }
  });
