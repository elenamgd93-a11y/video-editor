import { env } from "cloudflare:workers";

export const VOICES = {
  en: "English",
  es: "Spanish",
  fr: "French",
  zh: "Chinese",
  jp: "Japanese",
  kr: "Korean",
} as const;
export type Voice = keyof typeof VOICES;

export const MAX_SPEECH_CHARS = 2000;
/** About five minutes of 16 kHz mono 16-bit audio. */
export const MAX_TRANSCRIBE_BYTES = 10 * 1024 * 1024;

export class SpeechUnavailableError extends Error {
  constructor() {
    super("Speech services aren't available right now. Try again in a moment.");
  }
}

interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
const ai = () => env.AI as unknown as AiBinding;

function base64(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function fromBase64(value: string) {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function synthesize(text: string, voice: Voice) {
  let result: unknown;
  try {
    result = await ai().run("@cf/myshell-ai/melotts", {
      prompt: text,
      lang: voice,
    });
  } catch (error) {
    console.error("text to speech failed", error);
    throw new SpeechUnavailableError();
  }
  const audio = (result as { audio?: unknown })?.audio;
  if (typeof audio !== "string" || !audio) throw new SpeechUnavailableError();
  const bytes = fromBase64(audio);
  const isWav =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46;
  return {
    bytes,
    mime: isWav ? "audio/wav" : "audio/mpeg",
    ext: isWav ? "wav" : "mp3",
  };
}

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export async function transcribe(audio: Uint8Array): Promise<Segment[]> {
  let result: unknown;
  try {
    result = await ai().run("@cf/openai/whisper-large-v3-turbo", {
      audio: base64(audio),
    });
  } catch (error) {
    console.error("speech to text failed", error);
    throw new SpeechUnavailableError();
  }
  const segments = (result as { segments?: Segment[] })?.segments ?? [];
  return segments
    .map((s) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      text: String(s.text ?? "").trim(),
    }))
    .filter((s) => s.text && s.end > s.start);
}
