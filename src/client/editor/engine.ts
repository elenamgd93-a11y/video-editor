import { fileUrl } from "@/client/lib/media";
import {
  filterCss,
  layout,
  type Caption,
  type Clip,
  type Placed,
  type TextItem,
  type Timeline,
} from "@/lib/timeline";

type AV = HTMLVideoElement | HTMLAudioElement;

interface Voice {
  element: AV;
  mediaId: string;
  gain: GainNode | null;
}

/** Fade, crossfade and volume at time t, 0..1 (volume may exceed 1). */
function envelope(placed: Placed, t: number) {
  const { clip, start, end, overlap } = placed;
  let k = 1;
  if (clip.fadeIn > 0) k *= Math.min(1, (t - start) / clip.fadeIn);
  if (clip.fadeOut > 0) k *= Math.min(1, (end - t) / clip.fadeOut);
  if (overlap > 0 && t < start + overlap) k *= (t - start) / overlap;
  return Math.max(0, Math.min(1, k));
}

/** Where in the source file the clip is at timeline time t, in seconds. */
function sourceTime(placed: Placed, t: number) {
  const offset = (t - placed.start) * placed.clip.speed;
  return placed.clip.reverse
    ? Math.max(placed.clip.in, placed.clip.out - offset)
    : Math.min(placed.clip.out, placed.clip.in + offset);
}

/**
 * Plays a timeline: one media element per audio or video clip, images by
 * media id, and one canvas drawing for preview and export alike.
 */
export class Engine {
  private voices = new Map<string, Voice>();
  private images = new Map<string, HTMLImageElement>();
  private audio: AudioContext | null = null;
  private output: AudioNode | null = null;
  onFrame: (() => void) | null = null;

  /** Route sound to `node` instead of the speakers (export). */
  constructor(private readonly toSpeakers = true) {}

  audioContext() {
    if (!this.audio) {
      this.audio = new AudioContext();
      this.output = this.toSpeakers ? this.audio.destination : null;
      for (const voice of this.voices.values()) this.connect(voice);
    }
    if (this.audio.state === "suspended") void this.audio.resume();
    return this.audio;
  }

  setOutput(node: AudioNode) {
    this.output = node;
    for (const voice of this.voices.values()) {
      voice.gain?.disconnect();
      voice.gain?.connect(node);
    }
  }

  private connect(voice: Voice) {
    if (!this.audio || voice.gain) return;
    try {
      const source = this.audio.createMediaElementSource(voice.element);
      voice.gain = this.audio.createGain();
      source.connect(voice.gain);
      if (this.output) voice.gain.connect(this.output);
    } catch {
      /* Already routed or not routable: the element plays directly. */
    }
  }

  /** Create elements for the clips in the timeline and drop the rest. */
  prepare(timeline: Timeline) {
    const wanted = new Set<string>();
    for (const clip of [...timeline.visual, ...timeline.audio]) {
      if (clip.kind === "image") {
        if (!this.images.has(clip.mediaId)) {
          const img = new Image();
          img.onload = () => this.onFrame?.();
          img.src = fileUrl(clip.mediaId);
          this.images.set(clip.mediaId, img);
        }
        continue;
      }
      wanted.add(clip.id);
      const existing = this.voices.get(clip.id);
      if (existing && existing.mediaId === clip.mediaId) continue;
      if (existing) this.drop(clip.id);
      const element = document.createElement(
        clip.kind === "video" ? "video" : "audio",
      ) as AV;
      element.preload = "auto";
      (element as HTMLVideoElement).playsInline = true;
      element.src = fileUrl(clip.mediaId);
      element.addEventListener("seeked", () => this.onFrame?.());
      element.addEventListener("loadeddata", () => this.onFrame?.());
      const voice: Voice = { element, mediaId: clip.mediaId, gain: null };
      this.voices.set(clip.id, voice);
      this.connect(voice);
    }
    for (const id of [...this.voices.keys()])
      if (!wanted.has(id)) this.drop(id);
  }

  private drop(id: string) {
    const voice = this.voices.get(id);
    if (!voice) return;
    voice.element.pause();
    voice.gain?.disconnect();
    voice.element.removeAttribute("src");
    voice.element.load();
    this.voices.delete(id);
  }

  /** Resolves once every image and media element can show its first frame. */
  async ready(timeline: Timeline, timeoutMs = 15000) {
    this.prepare(timeline);
    const waits: Promise<unknown>[] = [];
    for (const img of this.images.values())
      if (!img.complete)
        waits.push(
          new Promise((r) => {
            img.addEventListener("load", r, { once: true });
            img.addEventListener("error", r, { once: true });
          }),
        );
    for (const { element } of this.voices.values())
      if (element.readyState < 2)
        waits.push(
          new Promise((r) => {
            element.addEventListener("loadeddata", r, { once: true });
            element.addEventListener("error", r, { once: true });
          }),
        );
    await Promise.race([
      Promise.all(waits),
      new Promise((r) => setTimeout(r, timeoutMs)),
    ]);
  }

  /** Bring every element to time t, playing or paused. */
  sync(timeline: Timeline, t: number, playing: boolean) {
    const tracks = [layout(timeline.visual), layout(timeline.audio)];
    for (const placed of tracks.flat()) {
      if (placed.clip.kind === "image") continue;
      const voice = this.voices.get(placed.clip.id);
      if (!voice) continue;
      const { element } = voice;
      const active = t >= placed.start && t < placed.end;
      if (!active) {
        if (!element.paused) element.pause();
        continue;
      }
      const target = sourceTime(placed, t);
      const level =
        placed.clip.muted || (playing && placed.clip.reverse)
          ? 0
          : (placed.clip.volume / 100) * envelope(placed, t);
      if (voice.gain) voice.gain.gain.value = level;
      else element.volume = Math.min(1, level);
      if (playing && !placed.clip.reverse) {
        if (element.playbackRate !== placed.clip.speed)
          element.playbackRate = placed.clip.speed;
        if (Math.abs(element.currentTime - target) > 0.3)
          element.currentTime = target;
        if (element.paused) void element.play().catch(() => undefined);
      } else {
        if (!element.paused) element.pause();
        if (Math.abs(element.currentTime - target) > 0.04 && !element.seeking)
          element.currentTime = target;
      }
    }
  }

  pause() {
    for (const { element } of this.voices.values()) element.pause();
  }

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeline: Timeline,
    t: number,
  ) {
    ctx.save();
    ctx.fillStyle = timeline.background;
    ctx.fillRect(0, 0, width, height);
    for (const placed of layout(timeline.visual)) {
      if (t < placed.start || t >= placed.end) continue;
      const source = this.sourceOf(placed.clip);
      if (!source) continue;
      drawClip(ctx, width, height, placed, source, envelope(placed, t));
    }
    const unit = Math.min(width, height) / 1080;
    for (const item of timeline.text)
      if (t >= item.start && t < item.end)
        drawText(ctx, width, height, unit, item);
    const caption = timeline.captions.find(
      (c) => t >= c.start && t < c.end && c.text.trim(),
    );
    if (caption)
      drawCaption(ctx, width, height, unit, caption, timeline.captionStyle);
    ctx.restore();
  }

  private sourceOf(
    clip: Clip,
  ): { el: CanvasImageSource; w: number; h: number } | null {
    if (clip.kind === "image") {
      const img = this.images.get(clip.mediaId);
      return img?.complete && img.naturalWidth
        ? { el: img, w: img.naturalWidth, h: img.naturalHeight }
        : null;
    }
    const element = this.voices.get(clip.id)?.element as
      | HTMLVideoElement
      | undefined;
    return element && element.readyState >= 2 && element.videoWidth
      ? { el: element, w: element.videoWidth, h: element.videoHeight }
      : null;
  }

  destroy() {
    for (const id of [...this.voices.keys()]) this.drop(id);
    this.images.clear();
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
  }
}

function drawClip(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  { clip }: Placed,
  source: { el: CanvasImageSource; w: number; h: number },
  alpha: number,
) {
  const { crop } = clip;
  const sx = (crop.left / 100) * source.w;
  const sy = (crop.top / 100) * source.h;
  const sw = Math.max(1, source.w * (1 - (crop.left + crop.right) / 100));
  const sh = Math.max(1, source.h * (1 - (crop.top + crop.bottom) / 100));
  const fit = Math.min(width / sw, height / sh) * (clip.scale / 100);
  const dw = sw * fit;
  const dh = sh * fit;
  const cx = width / 2 + (clip.x / 100) * width;
  const cy = height / 2 + (clip.y / 100) * height;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = filterCss(clip.filter, clip);
  ctx.translate(cx, cy);
  if (clip.mirror) ctx.scale(-1, 1);
  ctx.drawImage(source.el, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  cx: number,
  cy: number,
  lineHeight: number,
  paint: (line: string, x: number, y: number) => void,
) {
  const top = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => paint(line, cx, top + i * lineHeight));
}

function drawText(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  unit: number,
  item: TextItem,
) {
  const px = item.size * unit;
  ctx.save();
  ctx.font = `${item.bold ? 700 : 400} ${px}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrap(ctx, item.text, width * 0.9);
  const cx = (item.x / 100) * width;
  const cy = (item.y / 100) * height;
  const lh = px * 1.2;
  drawLines(ctx, lines, cx, cy, lh, (line, x, y) => {
    if (item.style === "box") {
      const w = ctx.measureText(line).width + px * 0.6;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(x - w / 2, y - lh / 2, w, lh);
    }
    if (item.style === "shadow") {
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = px / 6;
      ctx.shadowOffsetY = px / 20;
    }
    if (item.style === "outline") {
      ctx.lineWidth = Math.max(2, px / 10);
      ctx.strokeStyle = "rgba(0,0,0,0.9)";
      ctx.lineJoin = "round";
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = item.color;
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  unit: number,
  caption: Caption,
  style: Timeline["captionStyle"],
) {
  const px = (style.preset === "bold" ? 64 : 50) * unit;
  ctx.save();
  ctx.font = `${style.preset === "clean" ? 600 : 800} ${px}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrap(
    ctx,
    style.preset === "bold" ? caption.text.toUpperCase() : caption.text,
    width * 0.84,
  );
  const lh = px * 1.25;
  const cy =
    height *
    (style.position === "top"
      ? 0.14
      : style.position === "middle"
        ? 0.5
        : 0.84);
  drawLines(ctx, lines, width / 2, cy, lh, (line, x, y) => {
    const w = ctx.measureText(line).width + px * 0.6;
    if (style.preset === "boxed" || style.preset === "highlight") {
      ctx.fillStyle = style.preset === "boxed" ? "rgba(0,0,0,0.7)" : "#facc15";
      ctx.fillRect(x - w / 2, y - lh / 2, w, lh);
    }
    if (style.preset === "clean") {
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = px / 5;
    }
    if (style.preset === "bold") {
      ctx.lineWidth = px / 7;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#000000";
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = style.preset === "highlight" ? "#111111" : "#ffffff";
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}

/** Encode mono samples as 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, rate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** A clip's audio between its in and out points, as 16 kHz mono WAV. */
export async function clipAudioWav(clip: Clip) {
  const bytes = await (await fetch(fileUrl(clip.mediaId))).arrayBuffer();
  const decoder = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decoder.decodeAudioData(bytes);
  } finally {
    void decoder.close();
  }
  const rate = 16000;
  const start = Math.min(clip.in, decoded.duration);
  const end = Math.min(clip.out, decoded.duration);
  const length = Math.max(1, Math.ceil((end - start) * rate));
  const offline = new OfflineAudioContext(1, length, rate);
  const node = offline.createBufferSource();
  node.buffer = decoded;
  node.connect(offline.destination);
  node.start(0, start, end - start);
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), rate);
}
