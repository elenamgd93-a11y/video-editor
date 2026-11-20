import { timelineSchema, type Aspect, type Timeline } from "@/lib/timeline";

interface BuiltIn {
  id: string;
  title: string;
  aspect: Aspect;
  timeline: Timeline;
}

const text = (
  id: string,
  value: string,
  start: number,
  end: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  text: value,
  start,
  end,
  ...extra,
});

/** Starter layouts shipped with the app: text and captions to replace, no media. */
export const BUILT_IN_TEMPLATES: BuiltIn[] = [
  {
    id: "builtin-title-card",
    title: "Title card",
    aspect: "16:9",
    timeline: timelineSchema.parse({
      background: "#1e293b",
      text: [
        text("t1", "Your title here", 0, 4, {
          size: 96,
          style: "plain",
          y: 45,
        }),
        text("t2", "A short subtitle", 0.5, 4, {
          size: 44,
          bold: false,
          style: "plain",
          y: 60,
        }),
      ],
    }),
  },
  {
    id: "builtin-vertical-story",
    title: "Vertical story",
    aspect: "9:16",
    timeline: timelineSchema.parse({
      background: "#0f172a",
      text: [
        text("t1", "Three things I learned", 0, 3, {
          size: 88,
          style: "box",
          y: 20,
        }),
        text("t2", "1. Start early", 3, 6, { size: 72, y: 50 }),
        text("t3", "2. Pack light", 6, 9, { size: 72, y: 50 }),
        text("t4", "3. Enjoy the view", 9, 12, { size: 72, y: 50 }),
      ],
      captionStyle: { preset: "bold", position: "bottom" },
    }),
  },
  {
    id: "builtin-square-quote",
    title: "Square quote",
    aspect: "1:1",
    timeline: timelineSchema.parse({
      background: "#3f3f46",
      text: [
        text("t1", "“A quote worth sharing.”", 0, 5, {
          size: 80,
          style: "shadow",
          y: 45,
        }),
        text("t2", "Name Surname", 1, 5, {
          size: 40,
          bold: false,
          style: "plain",
          y: 65,
        }),
      ],
    }),
  },
  {
    id: "builtin-portrait-promo",
    title: "Portrait announcement",
    aspect: "4:5",
    timeline: timelineSchema.parse({
      background: "#14532d",
      text: [
        text("t1", "Big news", 0, 2.5, { size: 110, style: "outline", y: 40 }),
        text("t2", "Out this Friday", 2.5, 5, {
          size: 72,
          style: "box",
          y: 55,
        }),
      ],
    }),
  },
];
