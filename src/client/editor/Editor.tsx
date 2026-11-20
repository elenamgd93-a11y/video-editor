import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  FileAudio,
  FileImage,
  FileVideo,
  LayoutTemplate,
  Pause,
  Play,
  Plus,
  Scissors,
  Share2,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Slider } from "@/client/components/ui/slider";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/client/components/ui/tabs";
import { CaptionsPanel } from "@/client/editor/CaptionsPanel";
import { Engine } from "@/client/editor/engine";
import { ExportDialog, type ExportRow } from "@/client/editor/ExportDialog";
import { ClipInspector, TextInspector } from "@/client/editor/Inspector";
import { NumberField } from "@/client/editor/NumberField";
import { PublishDialog, ShareDialog } from "@/client/editor/ProjectDialogs";
import { uploadFile } from "@/client/lib/media";
import {
  ASPECT_LABELS,
  canvasSize,
  clipSchema,
  formatClock,
  layout,
  splitClip,
  textItemSchema,
  timelineDuration,
  type Aspect,
  type Clip,
  type Timeline,
} from "@/lib/timeline";
import type { MediaItem } from "@/server/media";
import { getEditor, saveTimeline } from "@/serverFunctions/projects";

type EditorData = NonNullable<Awaited<ReturnType<typeof getEditor>>>;
type Selection = { track: "visual" | "audio" | "text"; id: string } | null;
type SaveState = "saved" | "saving" | "error" | "conflict";

const ICONS = { video: FileVideo, audio: FileAudio, image: FileImage };
const PREVIEW_SHORT = 540;

export function Editor({
  data,
  onReloadLibrary,
}: {
  data: EditorData;
  onReloadLibrary: () => Promise<void>;
}) {
  const { project } = data;
  const readOnly = project.role === "viewer";
  const aspect = project.aspect as Aspect;
  const [timeline, setTimeline] = useState<Timeline>(project.timeline);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [dialog, setDialog] = useState<"share" | "publish" | "export" | null>(
    null,
  );
  const [exports, setExports] = useState<ExportRow[]>(data.exports);
  const [pps, setPps] = useState(48);
  const [uploading, setUploading] = useState(false);
  const knownMedia = useMemo(() => {
    const map: Record<string, MediaItem> = { ...project.media };
    for (const item of data.library) map[item.id] = item;
    return map;
  }, [project.media, data.library]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const latest = useRef(timeline);
  latest.current = timeline;
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;
  const version = useRef(project.version);
  const saving = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  const duration = timelineDuration(timeline);
  const size = canvasSize(aspect, PREVIEW_SHORT);

  // Saving: one request at a time, always the latest timeline, never over a newer version.
  const flush = useCallback(async () => {
    if (stopped.current) return;
    if (saving.current) {
      again.current = true;
      return;
    }
    saving.current = true;
    try {
      const result = await saveTimeline({
        data: {
          id: project.id,
          baseVersion: version.current,
          timeline: latest.current,
        },
      });
      if (result.conflict) {
        stopped.current = true;
        setSave("conflict");
        return;
      }
      version.current = result.version;
      if (!again.current) setSave("saved");
    } catch {
      setSave("error");
    } finally {
      saving.current = false;
      if (again.current && !stopped.current) {
        again.current = false;
        void flush();
      }
    }
  }, [project.id]);

  const change = useCallback(
    (update: (t: Timeline) => Timeline) => {
      if (readOnly || stopped.current) return;
      setTimeline((t) => update(t));
      setSave("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 400);
    },
    [readOnly, flush],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saving.current || timer.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // The preview engine.
  const draw = useCallback(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx && engine.current)
      engine.current.draw(
        ctx,
        size.width,
        size.height,
        latest.current,
        playheadRef.current,
      );
  }, [size.width, size.height]);

  useEffect(() => {
    const e = new Engine(true);
    e.onFrame = () => draw();
    engine.current = e;
    return () => {
      e.destroy();
      engine.current = null;
    };
  }, [draw]);

  useEffect(() => {
    engine.current?.prepare(timeline);
    if (!playing) {
      engine.current?.sync(timeline, playhead, false);
      draw();
    }
  }, [timeline, playhead, playing, draw]);

  useEffect(() => {
    if (!playing || !engine.current) return;
    engine.current.audioContext();
    const from = playheadRef.current >= duration ? 0 : playheadRef.current;
    const started = performance.now();
    let frame = 0;
    const tick = () => {
      const t = from + (performance.now() - started) / 1000;
      if (t >= duration) {
        setPlaying(false);
        setPlayhead(duration);
        engine.current?.pause();
        return;
      }
      playheadRef.current = t;
      setPlayhead(t);
      engine.current?.sync(latest.current, t, true);
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      engine.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const seek = (t: number) => {
    setPlaying(false);
    setPlayhead(Math.max(0, Math.min(t, Math.max(duration, 0))));
  };

  // Editing
  function addMedia(item: MediaItem, track?: "visual" | "audio") {
    const target = track ?? (item.kind === "audio" ? "audio" : "visual");
    if ((target === "audio") !== (item.kind === "audio")) {
      toast.error(
        item.kind === "audio"
          ? "Audio goes on the audio track."
          : "Video and images go on the video track.",
      );
      return;
    }
    const length =
      item.kind === "image" ? 3 : item.durationMs ? item.durationMs / 1000 : 5;
    const clip: Clip = clipSchema.parse({
      id: crypto.randomUUID(),
      mediaId: item.id,
      kind: item.kind,
      name: item.name,
      in: 0,
      out: length,
    });
    change((t) => ({ ...t, [target]: [...t[target], clip] }));
    setSelection({ track: target, id: clip.id });
  }

  function onDrop(event: DragEvent, track: "visual" | "audio") {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/x-media-id");
    const item = knownMedia[id];
    if (item) addMedia(item, track);
  }

  function addText() {
    const start = Math.round(playhead * 10) / 10;
    const item = textItemSchema.parse({
      id: crypto.randomUUID(),
      text: "Your text",
      start,
      end: start + 3,
      y: 30,
    });
    change((t) => ({ ...t, text: [...t.text, item] }));
    setSelection({ track: "text", id: item.id });
  }

  const selectedClip =
    selection && selection.track !== "text"
      ? (timeline[selection.track].find((c) => c.id === selection.id) ?? null)
      : null;
  const selectedText =
    selection?.track === "text"
      ? (timeline.text.find((t) => t.id === selection.id) ?? null)
      : null;

  function patchClip(patch: Partial<Clip>) {
    if (!selection || selection.track === "text") return;
    const track = selection.track;
    change((t) => ({
      ...t,
      [track]: t[track].map((c) =>
        c.id === selection.id ? { ...c, ...patch } : c,
      ),
    }));
  }

  function split() {
    if (!selection) return;
    if (selection.track === "text") {
      const item = timeline.text.find((t) => t.id === selection.id);
      if (!item || playhead <= item.start + 0.05 || playhead >= item.end - 0.05)
        return;
      const second = { ...item, id: crypto.randomUUID(), start: playhead };
      change((t) => ({
        ...t,
        text: t.text.flatMap((x) =>
          x.id === item.id ? [{ ...x, end: playhead }, second] : [x],
        ),
      }));
      setSelection({ track: "text", id: second.id });
      return;
    }
    const track = selection.track;
    const newId = crypto.randomUUID();
    const next = splitClip(timeline[track], selection.id, playhead, newId);
    if (!next) {
      toast.error("Move the playhead over the selected clip to split it.");
      return;
    }
    change((t) => ({ ...t, [track]: next }));
    setSelection({ track, id: newId });
  }

  function remove() {
    if (!selection) return;
    const track = selection.track;
    change((t) => ({
      ...t,
      [track]: (t[track] as { id: string }[]).filter(
        (x) => x.id !== selection.id,
      ),
    }));
    setSelection(null);
  }

  function move(direction: -1 | 1) {
    if (!selection || selection.track === "text") return;
    const track = selection.track;
    change((t) => {
      const list = [...t[track]];
      const index = list.findIndex((c) => c.id === selection.id);
      const to = index + direction;
      if (index < 0 || to < 0 || to >= list.length) return t;
      [list[index], list[to]] = [list[to]!, list[index]!];
      return { ...t, [track]: list };
    });
  }

  async function uploadHere(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of files) await uploadFile(file);
      await onReloadLibrary();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "The upload failed.",
      );
    } finally {
      setUploading(false);
    }
  }

  const clipIndex =
    selectedClip && selection
      ? timeline[selection.track as "visual" | "audio"].findIndex(
          (c) => c.id === selectedClip.id,
        )
      : -1;
  const timelineWidth = Math.max(duration + 10, 30) * pps;
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <AppShell wide>
      <div data-testid="editor" className="grid gap-4">
        <PageHeader
          title={<span data-testid="project-title">{project.title}</span>}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <span>
                {ASPECT_LABELS[aspect]} {aspect}
              </span>
              {readOnly ? (
                <Badge variant="secondary" data-testid="view-only">
                  View only
                </Badge>
              ) : (
                <span data-testid="save-status" aria-live="polite">
                  {save === "saved"
                    ? "Saved"
                    : save === "saving"
                      ? "Saving…"
                      : save === "error"
                        ? "Couldn't save"
                        : "Not saved"}
                </span>
              )}
            </span>
          }
          backLink={
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Projects
            </Link>
          }
          actions={
            <>
              {project.role === "owner" ? (
                <>
                  <Button
                    variant="outline"
                    data-testid="open-share"
                    onClick={() => setDialog("share")}
                  >
                    <Share2 />
                    Share
                  </Button>
                  <Button
                    variant="outline"
                    data-testid="open-publish"
                    onClick={() => setDialog("publish")}
                  >
                    <LayoutTemplate />
                    Publish as template
                  </Button>
                </>
              ) : null}
              {!readOnly ? (
                <Button
                  data-testid="open-export"
                  onClick={() => setDialog("export")}
                >
                  Export
                </Button>
              ) : null}
            </>
          }
        />

        {save === "conflict" ? (
          <Alert variant="destructive" data-testid="save-conflict">
            <AlertTitle>Someone else saved this project</AlertTitle>
            <AlertDescription>
              Your latest change wasn't saved. Reload to continue from their
              version.
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-fit"
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div
          className={`grid gap-4 ${readOnly ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[280px_minmax(0,1fr)_300px]"}`}
        >
          <aside className="order-2 min-w-0 rounded-xl border border-border bg-card p-3 shadow-xs lg:order-1">
            <Tabs defaultValue={readOnly ? "captions" : "media"}>
              <TabsList className="w-full">
                {!readOnly ? (
                  <TabsTrigger value="media">Media</TabsTrigger>
                ) : null}
                <TabsTrigger value="captions" data-testid="tab-captions">
                  Captions
                </TabsTrigger>
              </TabsList>
              {!readOnly ? (
                <TabsContent value="media" className="grid gap-2 pt-2">
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept="video/*,audio/*,image/*"
                    className="hidden"
                    onChange={(e) => void uploadHere(e.target.files)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    pending={uploading}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload />
                    Upload
                  </Button>
                  {data.library.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Upload files to add them to the timeline.
                    </p>
                  ) : (
                    <ul className="grid max-h-[50vh] gap-1 overflow-y-auto">
                      {data.library.map((item) => {
                        const Icon = ICONS[item.kind];
                        return (
                          <li
                            key={item.id}
                            data-testid="library-item"
                            draggable
                            onDragStart={(e) =>
                              e.dataTransfer.setData(
                                "application/x-media-id",
                                item.id,
                              )
                            }
                            className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                          >
                            <Icon
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {item.name}
                            </span>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              data-testid="add-to-timeline"
                              aria-label={`Add ${item.name} to the timeline`}
                              onClick={() => addMedia(item)}
                            >
                              <Plus />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </TabsContent>
              ) : null}
              <TabsContent value="captions" className="pt-2">
                <CaptionsPanel
                  projectId={project.id}
                  timeline={timeline}
                  playhead={playhead}
                  readOnly={readOnly}
                  change={change}
                />
              </TabsContent>
            </Tabs>
          </aside>

          <section className="order-1 grid min-w-0 content-start gap-3 lg:order-2">
            <div className="flex items-center justify-center rounded-xl border border-border bg-muted p-3">
              <canvas
                ref={canvas}
                data-testid="preview-canvas"
                width={size.width}
                height={size.height}
                className="max-h-[36vh] max-w-full rounded-sm shadow-xs"
                style={{ aspectRatio: `${size.width} / ${size.height}` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="icon"
                data-testid="play"
                aria-label={playing ? "Pause" : "Play"}
                disabled={duration <= 0}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? <Pause /> : <Play />}
              </Button>
              <span className="w-24 shrink-0 text-sm text-muted-foreground tabular-nums">
                {formatClock(playhead)} / {formatClock(duration)}
              </span>
              <div className="min-w-32 flex-1">
                <Slider
                  aria-label="Playhead"
                  min={0}
                  max={Math.max(duration, 0.1)}
                  step={0.01}
                  value={Math.min(playhead, Math.max(duration, 0.1))}
                  onValueChange={(v) =>
                    seek(Array.isArray(v) ? v[0]! : (v as number))
                  }
                />
              </div>
              <div className="w-24">
                <NumberField
                  label="Playhead (s)"
                  value={playhead}
                  min={0}
                  max={Math.max(duration, 0)}
                  onChange={seek}
                  testId="seek-input"
                />
              </div>
            </div>
          </section>

          {readOnly ? null : (
            <aside className="order-3 min-w-0 rounded-xl border border-border bg-card p-3 shadow-xs">
              {selectedClip ? (
                <ClipInspector
                  key={selectedClip.id}
                  clip={selectedClip}
                  isFirst={clipIndex === 0}
                  sourceLength={
                    knownMedia[selectedClip.mediaId]?.durationMs
                      ? knownMedia[selectedClip.mediaId]!.durationMs! / 1000
                      : null
                  }
                  onChange={patchClip}
                />
              ) : selectedText ? (
                <TextInspector
                  key={selectedText.id}
                  item={selectedText}
                  onChange={(patch) =>
                    change((t) => ({
                      ...t,
                      text: t.text.map((x) =>
                        x.id === selectedText.id ? { ...x, ...patch } : x,
                      ),
                    }))
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a clip or text on the timeline to edit it.
                </p>
              )}
            </aside>
          )}
        </div>

        <section className="grid gap-2 rounded-xl border border-border bg-card p-3 shadow-xs">
          {!readOnly ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                data-testid="add-text"
                onClick={addText}
              >
                <Type />
                Add text
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="split"
                disabled={!selection}
                onClick={split}
              >
                <Scissors />
                Split
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="move-earlier"
                aria-label="Move earlier"
                disabled={!selectedClip || clipIndex <= 0}
                onClick={() => move(-1)}
              >
                <ArrowLeft />
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="move-later"
                aria-label="Move later"
                disabled={!selectedClip}
                onClick={() => move(1)}
              >
                <ArrowRight />
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="delete-item"
                disabled={!selection}
                onClick={remove}
                className="hover:text-destructive"
              >
                <Trash2 />
                Delete
              </Button>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Zoom out"
                  onClick={() => setPps((p) => Math.max(8, p / 1.5))}
                >
                  −
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Zoom in"
                  onClick={() => setPps((p) => Math.min(400, p * 1.5))}
                >
                  +
                </Button>
              </div>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <div className="relative" style={{ width: timelineWidth }}>
              <div
                data-testid="timeline-ruler"
                className="relative h-6 cursor-pointer border-b border-border text-[10px] text-muted-foreground"
                onClick={(e) =>
                  seek(
                    (e.clientX - e.currentTarget.getBoundingClientRect().left) /
                      pps,
                  )
                }
              >
                {Array.from(
                  { length: Math.ceil(timelineWidth / pps / 5) + 1 },
                  (_, i) => (
                    <span
                      key={i}
                      className="absolute top-1 border-l border-border pl-1"
                      style={{ left: i * 5 * pps }}
                    >
                      {formatClock(i * 5)}
                    </span>
                  ),
                )}
              </div>
              <Track
                name="Video"
                testId="track-visual"
                readOnly={readOnly}
                onDrop={(e) => onDrop(e, "visual")}
                items={layout(timeline.visual).map((p) => ({
                  id: p.clip.id,
                  start: p.start,
                  end: p.end,
                  label: p.clip.name,
                  muted: false,
                }))}
                pps={pps}
                selected={selection?.track === "visual" ? selection.id : null}
                onSelect={(id) => setSelection({ track: "visual", id })}
              />
              <Track
                name="Audio"
                testId="track-audio"
                readOnly={readOnly}
                onDrop={(e) => onDrop(e, "audio")}
                items={layout(timeline.audio).map((p) => ({
                  id: p.clip.id,
                  start: p.start,
                  end: p.end,
                  label: p.clip.name,
                  muted: p.clip.muted,
                }))}
                pps={pps}
                selected={selection?.track === "audio" ? selection.id : null}
                onSelect={(id) => setSelection({ track: "audio", id })}
              />
              <Track
                name="Text"
                testId="track-text"
                readOnly={readOnly}
                items={timeline.text.map((t) => ({
                  id: t.id,
                  start: t.start,
                  end: t.end,
                  label: t.text || "Text",
                  muted: false,
                }))}
                pps={pps}
                selected={selection?.track === "text" ? selection.id : null}
                onSelect={(id) => setSelection({ track: "text", id })}
              />
              <Track
                name="Captions"
                testId="track-captions"
                readOnly
                items={timeline.captions.map((c) => ({
                  id: c.id,
                  start: c.start,
                  end: c.end,
                  label: c.text || "…",
                  muted: false,
                }))}
                pps={pps}
                selected={null}
              />
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary"
                style={{ left: playhead * pps }}
                aria-hidden
              />
            </div>
          </div>
        </section>
      </div>

      {dialog === "share" ? (
        <ShareDialog projectId={project.id} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "publish" ? (
        <PublishDialog
          projectId={project.id}
          title={project.title}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "export" ? (
        <ExportDialog
          projectId={project.id}
          title={project.title}
          aspect={aspect}
          timeline={timeline}
          exports={exports}
          onExports={(rows) => {
            setExports(rows);
            void onReloadLibrary();
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </AppShell>
  );
}

function Track({
  name,
  testId,
  items,
  pps,
  selected,
  onSelect,
  onDrop,
  readOnly,
}: {
  name: string;
  testId: string;
  items: {
    id: string;
    start: number;
    end: number;
    label: string;
    muted: boolean;
  }[];
  pps: number;
  selected: string | null;
  onSelect?: (id: string) => void;
  onDrop?: (event: DragEvent) => void;
  readOnly: boolean;
}) {
  return (
    <div
      data-testid={testId}
      aria-label={`${name} track`}
      className="relative h-12 border-b border-border"
      onDragOver={onDrop && !readOnly ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop && !readOnly ? onDrop : undefined}
    >
      <span className="pointer-events-none sticky left-0 z-10 px-1 text-[10px] text-muted-foreground">
        {name}
      </span>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-testid="timeline-item"
          disabled={!onSelect}
          onClick={() => onSelect?.(item.id)}
          className={`absolute top-3 bottom-1 overflow-hidden rounded-md border px-1.5 text-left text-xs whitespace-nowrap ${
            selected === item.id
              ? "border-primary bg-primary/20 ring-2 ring-primary"
              : "border-border bg-muted hover:bg-accent"
          } ${item.muted ? "opacity-60" : ""}`}
          style={{
            left: item.start * pps,
            width: Math.max(6, (item.end - item.start) * pps),
          }}
          title={item.label}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
