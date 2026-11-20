import { z } from "zod";

export const ASPECTS = ["16:9", "9:16", "1:1", "4:5"] as const;
export type Aspect = (typeof ASPECTS)[number];

export const ASPECT_LABELS: Record<Aspect, string> = {
  "16:9": "Landscape",
  "9:16": "Vertical",
  "1:1": "Square",
  "4:5": "Portrait",
};

/** Canvas size for an aspect, with the short side `short` pixels. */
export function canvasSize(aspect: Aspect, short: number) {
  const [w, h] = aspect.split(":").map(Number) as [number, number];
  const even = (n: number) => Math.round(n / 2) * 2;
  return w >= h
    ? { width: even((short * w) / h), height: short }
    : { width: short, height: even((short * h) / w) };
}

export const FILTERS = {
  none: { label: "None", css: "" },
  mono: { label: "Mono", css: "grayscale(1)" },
  sepia: { label: "Sepia", css: "sepia(0.8)" },
  warm: { label: "Warm", css: "sepia(0.3) saturate(1.3) hue-rotate(-10deg)" },
  cool: {
    label: "Cool",
    css: "saturate(1.1) hue-rotate(15deg) brightness(1.05)",
  },
  vivid: { label: "Vivid", css: "saturate(1.6) contrast(1.1)" },
  fade: { label: "Faded", css: "contrast(0.8) brightness(1.1) saturate(0.7)" },
  noir: { label: "Noir", css: "grayscale(1) contrast(1.5) brightness(0.9)" },
} as const;
export type FilterId = keyof typeof FILTERS;
const filterIds = Object.keys(FILTERS) as [FilterId, ...FilterId[]];

/** The CSS filter for a preset plus brightness/contrast/saturation (100 = unchanged) and blur (px). */
export function filterCss(
  filter: FilterId,
  adjust: {
    brightness: number;
    contrast: number;
    saturation: number;
    blur?: number;
  },
) {
  const parts: string[] = [FILTERS[filter].css];
  if (adjust.brightness !== 100)
    parts.push(`brightness(${adjust.brightness / 100})`);
  if (adjust.contrast !== 100) parts.push(`contrast(${adjust.contrast / 100})`);
  if (adjust.saturation !== 100)
    parts.push(`saturate(${adjust.saturation / 100})`);
  if (adjust.blur) parts.push(`blur(${adjust.blur}px)`);
  return parts.filter(Boolean).join(" ") || "none";
}

const seconds = z
  .number()
  .finite()
  .min(0)
  .max(6 * 3600);
const percent = (max: number) => z.number().finite().min(0).max(max);
const id = z.string().min(1).max(64);

export const clipSchema = z.object({
  id,
  mediaId: z.string().uuid(),
  kind: z.enum(["video", "audio", "image"]),
  name: z.string().max(255),
  gap: seconds.default(0),
  in: seconds,
  out: seconds,
  speed: z.number().min(0.25).max(4).default(1),
  volume: percent(200).default(100),
  muted: z.boolean().default(false),
  reverse: z.boolean().default(false),
  mirror: z.boolean().default(false),
  crop: z
    .object({
      left: percent(45),
      top: percent(45),
      right: percent(45),
      bottom: percent(45),
    })
    .default({ left: 0, top: 0, right: 0, bottom: 0 }),
  x: z.number().min(-100).max(100).default(0),
  y: z.number().min(-100).max(100).default(0),
  scale: z.number().min(10).max(400).default(100),
  fadeIn: seconds.default(0),
  fadeOut: seconds.default(0),
  transition: z.enum(["none", "crossfade"]).default("none"),
  transitionDuration: z.number().min(0.1).max(5).default(0.5),
  filter: z.enum(filterIds).default("none"),
  brightness: percent(200).default(100),
  contrast: percent(200).default(100),
  saturation: percent(200).default(100),
});
export type Clip = z.infer<typeof clipSchema>;

export const TEXT_STYLES = {
  plain: "Plain",
  shadow: "Shadow",
  outline: "Outline",
  box: "Box",
} as const;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const textItemSchema = z.object({
  id,
  text: z.string().max(500),
  start: seconds,
  end: seconds,
  size: z.number().min(8).max(300).default(64),
  color: color.default("#ffffff"),
  style: z.enum(["plain", "shadow", "outline", "box"]).default("shadow"),
  bold: z.boolean().default(true),
  x: percent(100).default(50),
  y: percent(100).default(50),
});
export type TextItem = z.infer<typeof textItemSchema>;

export const captionSchema = z.object({
  id,
  start: seconds,
  end: seconds,
  text: z.string().max(500),
});
export type Caption = z.infer<typeof captionSchema>;

export const CAPTION_STYLES = {
  clean: "Clean",
  boxed: "Boxed",
  bold: "Bold",
  highlight: "Highlight",
} as const;
export const CAPTION_POSITIONS = {
  bottom: "Bottom",
  middle: "Middle",
  top: "Top",
} as const;

export const timelineSchema = z.object({
  background: color.default("#000000"),
  visual: z.array(clipSchema).max(200).default([]),
  audio: z.array(clipSchema).max(200).default([]),
  text: z.array(textItemSchema).max(200).default([]),
  captions: z.array(captionSchema).max(2000).default([]),
  captionStyle: z
    .object({
      preset: z.enum(["clean", "boxed", "bold", "highlight"]),
      position: z.enum(["bottom", "middle", "top"]),
    })
    .default({ preset: "clean", position: "bottom" }),
});
export type Timeline = z.infer<typeof timelineSchema>;

export function emptyTimeline(): Timeline {
  return timelineSchema.parse({});
}

export function parseTimeline(json: string): Timeline {
  try {
    return timelineSchema.parse(JSON.parse(json));
  } catch {
    return emptyTimeline();
  }
}

export function mediaIdsOf(timeline: Timeline): string[] {
  return [
    ...new Set([...timeline.visual, ...timeline.audio].map((c) => c.mediaId)),
  ];
}

/** How long a clip plays on the timeline, in seconds. */
export function clipLength(clip: Clip) {
  return Math.max(0.05, (clip.out - clip.in) / clip.speed);
}

export interface Placed {
  clip: Clip;
  start: number;
  end: number;
  /** Seconds this clip overlaps the one before it (a crossfade). */
  overlap: number;
}

/** Clips on a track play one after another; a crossfade overlaps the previous clip. */
export function layout(clips: Clip[]): Placed[] {
  const placed: Placed[] = [];
  let cursor = 0;
  for (const [index, clip] of clips.entries()) {
    const length = clipLength(clip);
    const previous = placed[index - 1];
    let start = cursor + clip.gap;
    let overlap = 0;
    if (previous && clip.transition === "crossfade" && clip.gap === 0) {
      overlap = Math.min(
        clip.transitionDuration,
        length / 2,
        (previous.end - previous.start) / 2,
      );
      start -= overlap;
    }
    placed.push({ clip, start, end: start + length, overlap });
    cursor = start + length;
  }
  return placed;
}

export function timelineDuration(timeline: Timeline) {
  const ends = [
    ...layout(timeline.visual).map((p) => p.end),
    ...layout(timeline.audio).map((p) => p.end),
    ...timeline.text.map((t) => t.end),
    ...timeline.captions.map((c) => c.end),
  ];
  return Math.max(0, ...ends);
}

/** Split the clip under `time` (timeline seconds) into two; null when nothing is under it. */
export function splitClip(
  clips: Clip[],
  clipId: string,
  time: number,
  newId: string,
): Clip[] | null {
  const placed = layout(clips).find((p) => p.clip.id === clipId);
  if (!placed || time <= placed.start + 0.05 || time >= placed.end - 0.05)
    return null;
  const { clip } = placed;
  const sourceAt = (time - placed.start) * clip.speed;
  const cut = clip.reverse ? clip.out - sourceAt : clip.in + sourceAt;
  const first: Clip = clip.reverse
    ? { ...clip, in: cut, fadeOut: 0 }
    : { ...clip, out: cut, fadeOut: 0 };
  const second: Clip = clip.reverse
    ? { ...clip, id: newId, out: cut, gap: 0, fadeIn: 0, transition: "none" }
    : { ...clip, id: newId, in: cut, gap: 0, fadeIn: 0, transition: "none" };
  const index = clips.indexOf(clip);
  return [...clips.slice(0, index), first, second, ...clips.slice(index + 1)];
}

export function splitCaption(
  captions: Caption[],
  captionId: string,
  time: number,
  newId: string,
): Caption[] | null {
  const caption = captions.find((c) => c.id === captionId);
  if (!caption || time <= caption.start + 0.05 || time >= caption.end - 0.05)
    return null;
  const words = caption.text.trim().split(/\s+/);
  const share = (time - caption.start) / (caption.end - caption.start);
  const at = Math.min(
    words.length - 1,
    Math.max(1, Math.round(words.length * share)),
  );
  const first = {
    ...caption,
    end: time,
    text: words.length > 1 ? words.slice(0, at).join(" ") : caption.text,
  };
  const second = {
    id: newId,
    start: time,
    end: caption.end,
    text: words.length > 1 ? words.slice(at).join(" ") : caption.text,
  };
  return sortCaptions(
    captions.flatMap((c) => (c.id === captionId ? [first, second] : [c])),
  );
}

export function sortCaptions(captions: Caption[]) {
  return [...captions].sort((a, b) => a.start - b.start || a.end - b.end);
}

function srtTime(value: number) {
  const ms = Math.max(0, Math.round(value * 1000));
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function toSrt(captions: Caption[]) {
  return sortCaptions(captions)
    .filter((c) => c.text.trim() && c.end > c.start)
    .map(
      (c, i) =>
        `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text.trim()}\n`,
    )
    .join("\n");
}

/** `mm:ss` (or `h:mm:ss`) for a length in seconds. */
export function formatClock(value: number) {
  const total = Math.max(0, Math.floor(value));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
