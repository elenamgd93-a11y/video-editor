import type { Aspect } from "@/lib/timeline";

/** A frame in the project's shape. */
export function AspectThumb({ aspect }: { aspect: Aspect }) {
  const [w, h] = aspect.split(":").map(Number) as [number, number];
  const scale = 80 / Math.max(w, h);
  return (
    <span
      aria-hidden
      className="block rounded-md border-2 border-border bg-background"
      style={{ width: w * scale, height: h * scale }}
    />
  );
}
