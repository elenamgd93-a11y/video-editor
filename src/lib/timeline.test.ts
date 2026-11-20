import { describe, expect, it } from "vitest";
import {
  clipSchema,
  layout,
  splitCaption,
  splitClip,
  toSrt,
  canvasSize,
  timelineSchema,
} from "./timeline";

const clip = (id: string, extra: Record<string, unknown> = {}) =>
  clipSchema.parse({
    id,
    mediaId: crypto.randomUUID(),
    kind: "image",
    name: id,
    in: 0,
    out: 4,
    ...extra,
  });

describe("timeline", () => {
  it("lays clips end to end with crossfades overlapping", () => {
    const placed = layout([
      clip("a"),
      clip("b", { transition: "crossfade", transitionDuration: 1 }),
    ]);
    expect(placed.map((p) => [p.start, p.end])).toEqual([
      [0, 4],
      [3, 7],
    ]);
  });
  it("accounts for speed and gaps", () => {
    const placed = layout([clip("a", { speed: 2 }), clip("b", { gap: 1 })]);
    expect(placed[1]!.start).toBe(3);
    expect(placed[0]!.end).toBe(2);
  });
  it("splits a clip at the playhead", () => {
    const result = splitClip([clip("a", { in: 1, out: 5 })], "a", 1.5, "b")!;
    expect(result.map((c) => [c.in, c.out])).toEqual([
      [1, 2.5],
      [2.5, 5],
    ]);
    expect(splitClip([clip("a")], "a", 0, "b")).toBeNull();
  });
  it("splits a reversed clip from its end", () => {
    const result = splitClip(
      [clip("a", { in: 0, out: 4, reverse: true })],
      "a",
      1,
      "b",
    )!;
    expect(result.map((c) => [c.in, c.out])).toEqual([
      [3, 4],
      [0, 3],
    ]);
  });
  it("splits a caption's words", () => {
    const result = splitCaption(
      [{ id: "c", start: 0, end: 2, text: "one two three four" }],
      "c",
      1,
      "d",
    )!;
    expect(result.map((c) => c.text)).toEqual(["one two", "three four"]);
  });
  it("writes SRT", () => {
    expect(toSrt([{ id: "c", start: 61.5, end: 63, text: "Hello" }])).toBe(
      "1\n00:01:01,500 --> 00:01:03,000\nHello\n",
    );
  });
  it("sizes canvases", () => {
    expect(canvasSize("9:16", 720)).toEqual({ width: 720, height: 1280 });
    expect(canvasSize("16:9", 480)).toEqual({ width: 854, height: 480 });
  });
  it("rejects bad timelines", () => {
    expect(timelineSchema.safeParse({ visual: [{ id: "x" }] }).success).toBe(
      false,
    );
  });
});
