import { Link, createFileRoute } from "@tanstack/react-router";
import {
  FlipHorizontal2,
  FlipVertical2,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AppShell } from "@/client/components/AppShell";
import { Choice, Field, Pick } from "@/client/components/Choice";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Slider } from "@/client/components/ui/slider";
import { fileUrl, uploadFile } from "@/client/lib/media";
import { FILTERS, filterCss, type FilterId } from "@/lib/timeline";
import { getMediaItem } from "@/serverFunctions/media";

export const Route = createFileRoute("/photos/$id")({
  ssr: false,
  loader: ({ params }) => getMediaItem({ data: { id: params.id } }),
  head: () => ({ meta: [{ title: "Photo editor · Video Editor" }] }),
  component: PhotoPage,
});

type Ratio = "free" | "1:1" | "4:5" | "16:9" | "9:16" | "3:2";
type Format = "png" | "jpeg" | "webp";
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface PhotoText {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

const SIZE_PRESETS = [
  { value: "custom", label: "Custom", ratio: null, w: 0, h: 0 },
  {
    value: "square",
    label: "Square post 1080 × 1080",
    ratio: "1:1",
    w: 1080,
    h: 1080,
  },
  {
    value: "portrait",
    label: "Portrait post 1080 × 1350",
    ratio: "4:5",
    w: 1080,
    h: 1350,
  },
  {
    value: "story",
    label: "Story 1080 × 1920",
    ratio: "9:16",
    w: 1080,
    h: 1920,
  },
  {
    value: "wide",
    label: "Widescreen 1920 × 1080",
    ratio: "16:9",
    w: 1920,
    h: 1080,
  },
  {
    value: "thumb",
    label: "Thumbnail 1280 × 720",
    ratio: "16:9",
    w: 1280,
    h: 720,
  },
] as const;
type SizePreset = (typeof SIZE_PRESETS)[number]["value"];

const MAX_SIDE = 8000;

function ratioValue(ratio: Ratio) {
  if (ratio === "free") return null;
  const [a, b] = ratio.split(":").map(Number) as [number, number];
  return a / b;
}

/** The largest centred crop with `ratio` in an image of W × H (fractions). */
function centredCrop(ratio: Ratio, W: number, H: number): Rect {
  const r = ratioValue(ratio);
  if (!r) return { x: 0, y: 0, w: 1, h: 1 };
  let w = W;
  let h = W / r;
  if (h > H) {
    h = H;
    w = H * r;
  }
  return { x: (W - w) / 2 / W, y: (H - h) / 2 / H, w: w / W, h: h / H };
}

function PhotoPage() {
  const item = Route.useLoaderData();
  if (!item) {
    return (
      <AppShell>
        <PageHeader title="Not found" />
        <p data-testid="not-found" className="text-sm text-muted-foreground">
          This image isn't in your library.
        </p>
      </AppShell>
    );
  }
  return <PhotoEditor id={item.id} name={item.name} />;
}

function PhotoEditor({ id, name }: { id: string; name: string }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [ratio, setRatio] = useState<Ratio>("free");
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const [preset, setPreset] = useState<SizePreset>("custom");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [filter, setFilter] = useState<FilterId>("none");
  const [adjust, setAdjust] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
  });
  const [texts, setTexts] = useState<PhotoText[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>("png");
  const [outName, setOutName] = useState(
    `${name.replace(/\.[^.]+$/, "")} edited`,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const cropView = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => setLoadError(true);
    img.src = fileUrl(id);
  }, [id]);

  const oriented = useMemo(() => {
    if (!image) return null;
    const turned = rotation % 180 !== 0;
    const W = turned ? image.naturalHeight : image.naturalWidth;
    const H = turned ? image.naturalWidth : image.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(W / 2, H / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    return canvas;
  }, [image, rotation, flipH, flipV]);

  const cropPx = oriented
    ? {
        w: Math.max(1, Math.round(crop.w * oriented.width)),
        h: Math.max(1, Math.round(crop.h * oriented.height)),
      }
    : { w: 1, h: 1 };

  function applyCrop(next: Rect, keepSize = false) {
    setCrop(next);
    if (!oriented || keepSize) return;
    setPreset("custom");
    setSize({
      w: Math.round(next.w * oriented.width),
      h: Math.round(next.h * oriented.height),
    });
  }

  function chooseRatio(next: Ratio) {
    setRatio(next);
    if (oriented) applyCrop(centredCrop(next, oriented.width, oriented.height));
  }

  // Turning the picture keeps the crop's shape.
  useEffect(() => {
    if (!oriented) return;
    const next = centredCrop(ratio, oriented.width, oriented.height);
    setCrop(next);
    if (preset === "custom")
      setSize({
        w: Math.round(next.w * oriented.width),
        h: Math.round(next.h * oriented.height),
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oriented]);

  function render(canvas: HTMLCanvasElement, width: number, height: number) {
    if (!oriented) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    ctx.filter = filterCss(filter, {
      ...adjust,
      blur: (adjust.blur * width) / 1000,
    });
    ctx.drawImage(
      oriented,
      crop.x * oriented.width,
      crop.y * oriented.height,
      crop.w * oriented.width,
      crop.h * oriented.height,
      0,
      0,
      width,
      height,
    );
    ctx.filter = "none";
    for (const t of texts) {
      const px = (t.size / 100) * height;
      ctx.font = `600 ${px}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(1, px / 12);
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(t.text, (t.x / 100) * width, (t.y / 100) * height);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, (t.x / 100) * width, (t.y / 100) * height);
    }
  }

  useEffect(() => {
    const canvas = preview.current;
    if (!canvas || !oriented) return;
    const scale = Math.min(1, 900 / Math.max(size.w || 1, size.h || 1));
    render(
      canvas,
      Math.max(1, Math.round((size.w || cropPx.w) * scale)),
      Math.max(1, Math.round((size.h || cropPx.h) * scale)),
    );
  });

  useEffect(() => {
    const canvas = cropView.current;
    if (!canvas || !oriented) return;
    const scale = Math.min(1, 480 / Math.max(oriented.width, oriented.height));
    canvas.width = Math.round(oriented.width * scale);
    canvas.height = Math.round(oriented.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(oriented, 0, 0, canvas.width, canvas.height);
  }, [oriented]);

  function setWidth(w: number) {
    setPreset("custom");
    setSize({ w, h: Math.max(1, Math.round((w * cropPx.h) / cropPx.w)) });
  }
  function setHeight(h: number) {
    setPreset("custom");
    setSize({ w: Math.max(1, Math.round((h * cropPx.w) / cropPx.h)), h });
  }

  function choosePreset(value: SizePreset) {
    const picked = SIZE_PRESETS.find((p) => p.value === value)!;
    setPreset(value);
    if (!picked.ratio || !oriented) return;
    setRatio(picked.ratio);
    setCrop(centredCrop(picked.ratio, oriented.width, oriented.height));
    setSize({ w: picked.w, h: picked.h });
  }

  async function save() {
    if (!oriented) return;
    const w = Math.min(MAX_SIDE, Math.max(1, size.w));
    const h = Math.min(MAX_SIDE, Math.max(1, size.h));
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const canvas = document.createElement("canvas");
      render(canvas, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, `image/${format}`, 0.92),
      );
      if (!blob || blob.type !== `image/${format}`)
        throw new Error(
          `This browser can't save ${format.toUpperCase()} images.`,
        );
      const ext = format === "jpeg" ? "jpg" : format;
      const base = outName.trim() || "Edited photo";
      await uploadFile(blob, {
        name: `${base}.${ext}`,
        source: "photo",
        probed: { width: w, height: h },
      });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Saving failed.");
    } finally {
      setSaving(false);
    }
  }

  const current = texts.find((t) => t.id === selected) ?? null;
  const updateText = (patch: Partial<PhotoText>) =>
    setTexts((list) =>
      list.map((t) => (t.id === selected ? { ...t, ...patch } : t)),
    );

  return (
    <AppShell wide>
      <PageHeader
        title="Photo editor"
        description={name}
        backLink={
          <Link
            to="/media"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Library
          </Link>
        }
      />
      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>The image couldn't be loaded.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          <div className="flex min-h-64 items-center justify-center rounded-xl border border-border bg-muted p-4">
            <canvas
              data-testid="photo-canvas"
              ref={preview}
              className="max-h-[60vh] max-w-full rounded-sm shadow-xs"
            />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {size.w} × {size.h} px
          </p>
        </div>
        <div className="grid content-start gap-5">
          <section className="grid gap-3">
            <h2 className="text-sm font-semibold">Crop</h2>
            <Choice<Ratio>
              label="Crop shape"
              testId="crop"
              value={ratio}
              onChange={chooseRatio}
              options={(
                ["free", "1:1", "4:5", "16:9", "9:16", "3:2"] as Ratio[]
              ).map((r) => ({ value: r, label: r === "free" ? "Free" : r }))}
            />
            <CropBox
              canvasRef={cropView}
              crop={crop}
              ratio={ratio}
              oriented={oriented}
              onChange={(next) => applyCrop(next)}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="rotate-left"
                onClick={() => setRotation((r) => (r + 270) % 360)}
                aria-label="Rotate left"
              >
                <RotateCcw />
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="rotate-right"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                aria-label="Rotate right"
              >
                <RotateCw />
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="flip-h"
                aria-pressed={flipH}
                onClick={() => setFlipH((v) => !v)}
                aria-label="Flip horizontally"
              >
                <FlipHorizontal2 />
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="flip-v"
                aria-pressed={flipV}
                onClick={() => setFlipV((v) => !v)}
                aria-label="Flip vertically"
              >
                <FlipVertical2 />
              </Button>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-sm font-semibold">Size</h2>
            <Pick
              label="Preset"
              testId="resize-preset"
              value={preset}
              onChange={choosePreset}
              options={SIZE_PRESETS.map((p) => ({
                value: p.value,
                label: p.label,
              }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Width (px)" htmlFor="resize-width">
                <Input
                  id="resize-width"
                  data-testid="resize-width"
                  type="number"
                  min={1}
                  max={MAX_SIDE}
                  value={size.w || ""}
                  onChange={(e) => setWidth(Number(e.target.value))}
                />
              </Field>
              <Field label="Height (px)" htmlFor="resize-height">
                <Input
                  id="resize-height"
                  data-testid="resize-height"
                  type="number"
                  min={1}
                  max={MAX_SIDE}
                  value={size.h || ""}
                  onChange={(e) => setHeight(Number(e.target.value))}
                />
              </Field>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-sm font-semibold">Look</h2>
            <Pick
              label="Filter"
              testId="photo-filter"
              value={filter}
              onChange={setFilter}
              options={(Object.keys(FILTERS) as FilterId[]).map((f) => ({
                value: f,
                label: FILTERS[f].label,
              }))}
            />
            {(
              [
                ["brightness", "Brightness", 0, 200],
                ["contrast", "Contrast", 0, 200],
                ["saturation", "Saturation", 0, 200],
                ["blur", "Blur", 0, 20],
              ] as const
            ).map(([key, label, min, max]) => (
              <div key={key} className="grid gap-1.5">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="text-muted-foreground">{adjust[key]}</span>
                </div>
                <Slider
                  aria-label={label}
                  min={min}
                  max={max}
                  value={adjust[key]}
                  onValueChange={(value) =>
                    setAdjust((a) => ({
                      ...a,
                      [key]: Array.isArray(value) ? value[0] : value,
                    }))
                  }
                />
              </div>
            ))}
          </section>

          <section className="grid gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Text</h2>
              <Button
                size="sm"
                variant="outline"
                data-testid="add-photo-text"
                onClick={() => {
                  const next = {
                    id: crypto.randomUUID(),
                    text: "Your text",
                    x: 50,
                    y: 50,
                    size: 10,
                    color: "#ffffff",
                  };
                  setTexts((list) => [...list, next]);
                  setSelected(next.id);
                }}
              >
                <Plus />
                Add text
              </Button>
            </div>
            {texts.length > 1 ? (
              <Pick
                label="Text layer"
                testId="photo-text-layer"
                value={selected}
                onChange={setSelected}
                options={texts.map((t) => ({
                  value: t.id,
                  label: t.text || "Empty",
                }))}
              />
            ) : null}
            {current ? (
              <div className="grid gap-3">
                <Input
                  aria-label="Text"
                  data-testid="photo-text-input"
                  value={current.text}
                  maxLength={200}
                  onChange={(e) => updateText({ text: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Left %">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={current.x}
                      onChange={(e) =>
                        updateText({ x: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Top %">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={current.y}
                      onChange={(e) =>
                        updateText({ y: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Size %">
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={current.size}
                      onChange={(e) =>
                        updateText({ size: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    aria-label="Text colour"
                    className="h-9 w-14 p-1"
                    value={current.color}
                    onChange={(e) => updateText({ color: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setTexts((list) =>
                        list.filter((t) => t.id !== current.id),
                      );
                      setSelected(null);
                    }}
                  >
                    <Trash2 />
                    Remove text
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
            <Field label="File name" htmlFor="photo-name">
              <Input
                id="photo-name"
                data-testid="photo-name"
                value={outName}
                maxLength={200}
                onChange={(e) => setOutName(e.target.value)}
              />
            </Field>
            <Choice<Format>
              label="Format"
              testId="photo-format"
              value={format}
              onChange={setFormat}
              options={[
                { value: "png", label: "PNG" },
                { value: "jpeg", label: "JPEG" },
                { value: "webp", label: "WebP" },
              ]}
            />
            <Button
              data-testid="save-photo"
              pending={saving}
              disabled={!oriented}
              onClick={() => void save()}
            >
              Save to library
            </Button>
            {saved ? (
              <Alert data-testid="photo-saved">
                <AlertDescription>
                  Saved as a new image.{" "}
                  <Link to="/media" className="underline">
                    Open the library
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

/** The whole picture with the crop drawn over it: drag inside to move, drag the corner to resize. */
function CropBox({
  canvasRef,
  crop,
  ratio,
  oriented,
  onChange,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  crop: Rect;
  ratio: Ratio;
  oriented: HTMLCanvasElement | null;
  onChange: (rect: Rect) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);

  function drag(event: ReactPointerEvent, mode: "move" | "resize") {
    event.preventDefault();
    event.stopPropagation();
    const box = frame.current?.getBoundingClientRect();
    if (!box || !oriented) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = crop;
    const r = ratioValue(ratio);
    const pixelRatio = oriented.width / oriented.height;
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - startX) / box.width;
      const dy = (e.clientY - startY) / box.height;
      if (mode === "move") {
        onChange({
          ...start,
          x: Math.min(1 - start.w, Math.max(0, start.x + dx)),
          y: Math.min(1 - start.h, Math.max(0, start.y + dy)),
        });
        return;
      }
      let w = Math.min(1 - start.x, Math.max(0.05, start.w + dx));
      let h = Math.min(1 - start.y, Math.max(0.05, start.h + dy));
      if (r) {
        // Keep the shape: h (fraction) = w * W / (r * H)
        h = (w * pixelRatio) / r;
        if (start.y + h > 1) {
          h = 1 - start.y;
          w = (h * r) / pixelRatio;
        }
      }
      onChange({ ...start, w, h });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={frame}
      className="relative w-fit max-w-full touch-none overflow-hidden select-none"
    >
      <canvas ref={canvasRef} className="block max-w-full rounded-sm" />
      <div
        role="presentation"
        className="absolute cursor-move border-2 border-primary ring-[9999px] ring-foreground/40"
        style={{
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          width: `${crop.w * 100}%`,
          height: `${crop.h * 100}%`,
        }}
        onPointerDown={(e) => drag(e, "move")}
      >
        <span
          className="absolute right-0 bottom-0 size-4 cursor-nwse-resize rounded-sm border-2 border-primary bg-background"
          onPointerDown={(e) => drag(e, "resize")}
        />
      </div>
    </div>
  );
}
