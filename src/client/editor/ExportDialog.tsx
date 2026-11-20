import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Choice, Field } from "@/client/components/Choice";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Progress } from "@/client/components/ui/progress";
import { Engine } from "@/client/editor/engine";
import {
  fileUrl,
  formatBytes,
  formatDate,
  uploadFile,
} from "@/client/lib/media";
import {
  canvasSize,
  timelineDuration,
  type Aspect,
  type Timeline,
} from "@/lib/timeline";
import { getExports } from "@/serverFunctions/projects";

type Resolution = "480" | "720" | "1080";
type Fps = "24" | "30" | "60";
type Format = "webm" | "mp4";

const MIME: Record<Format, string[]> = {
  webm: [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ],
  mp4: ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"],
};
const supported = (format: Format) =>
  typeof MediaRecorder !== "undefined"
    ? (MIME[format].find((m) => MediaRecorder.isTypeSupported(m)) ?? null)
    : null;

export interface ExportRow {
  id: string;
  mediaId: string;
  name: string;
  size: number;
  createdAt: string;
}

export function ExportDialog({
  projectId,
  title,
  aspect,
  timeline,
  exports,
  onExports,
  onClose,
}: {
  projectId: string;
  title: string;
  aspect: Aspect;
  timeline: Timeline;
  exports: ExportRow[];
  onExports: (rows: ExportRow[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(
    title.replace(/[\\/:*?"<>|]+/g, "").trim() || "export",
  );
  const [resolution, setResolution] = useState<Resolution>("720");
  const [fps, setFps] = useState<Fps>("30");
  const [format, setFormat] = useState<Format>(
    supported("mp4") ? "mp4" : "webm",
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState<"idle" | "rendering" | "saving" | "done">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cancelled = useRef(false);
  const duration = timelineDuration(timeline);
  const size = canvasSize(aspect, Number(resolution));
  useEffect(() => () => void (cancelled.current = true), []);

  async function run() {
    const mime = supported(format);
    const target = canvas.current;
    if (!mime || !target) return;
    setError(null);
    setStage("rendering");
    setProgress(0);
    cancelled.current = false;
    const engine = new Engine(false);
    try {
      target.width = size.width;
      target.height = size.height;
      const ctx = target.getContext("2d")!;
      await engine.ready(timeline);
      const audio = engine.audioContext();
      const destination = audio.createMediaStreamDestination();
      engine.setOutput(destination);
      const stream = target.captureStream(Number(fps));
      for (const track of destination.stream.getAudioTracks())
        stream.addTrack(track);
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: Number(resolution) * Number(resolution) * 8,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise<void>(
        (resolve) => (recorder.onstop = () => resolve()),
      );
      engine.sync(timeline, 0, false);
      engine.draw(ctx, size.width, size.height, timeline, 0);
      recorder.start(250);
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const frame = () => {
          const t = (performance.now() - started) / 1000;
          if (cancelled.current || t >= duration) return resolve();
          engine.sync(timeline, t, true);
          engine.draw(ctx, size.width, size.height, timeline, t);
          setProgress(Math.min(99, Math.round((t / duration) * 100)));
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      engine.pause();
      recorder.stop();
      await stopped;
      if (cancelled.current) return;
      const ext = format;
      const blob = new Blob(chunks, { type: mime.split(";")[0] });
      const filename = `${name.trim() || "export"}.${ext}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStage("saving");
      setProgress(100);
      await uploadFile(blob, {
        name: filename,
        source: "export",
        projectId,
        settings: { resolution: Number(resolution), fps: Number(fps), format },
        probed: {
          durationMs: Math.round(duration * 1000),
          width: size.width,
          height: size.height,
        },
      });
      onExports(await getExports({ data: { id: projectId } }));
      setStage("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The export failed.");
      setStage("idle");
    } finally {
      engine.destroy();
    }
  }

  const busy = stage === "rendering" || stage === "saving";
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export video</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="File name" htmlFor="export-name">
            <Input
              id="export-name"
              data-testid="export-name"
              disabled={busy}
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Resolution">
            <Choice<Resolution>
              label="Resolution"
              testId="export-resolution"
              disabled={busy}
              value={resolution}
              onChange={setResolution}
              options={(["480", "720", "1080"] as Resolution[]).map((r) => ({
                value: r,
                label: `${r}p`,
              }))}
            />
          </Field>
          <Field label="Frame rate">
            <Choice<Fps>
              label="Frame rate"
              testId="export-fps"
              disabled={busy}
              value={fps}
              onChange={setFps}
              options={(["24", "30", "60"] as Fps[]).map((f) => ({
                value: f,
                label: `${f} fps`,
              }))}
            />
          </Field>
          <Field label="Format">
            <Choice<Format>
              label="Format"
              testId="export-format"
              disabled={busy}
              value={format}
              onChange={setFormat}
              options={[
                { value: "mp4", label: "MP4", disabled: !supported("mp4") },
                { value: "webm", label: "WebM", disabled: !supported("webm") },
              ]}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            {size.width} × {size.height} · {Math.ceil(duration)} s. Keep this
            tab open while it renders.
          </p>
          <canvas
            ref={canvas}
            className={
              busy
                ? "mx-auto max-h-48 max-w-full rounded-md border border-border"
                : "hidden"
            }
          />
          {progress !== null && stage !== "idle" ? (
            <div className="grid gap-1">
              <Progress value={progress} data-testid="export-progress" />
              <p className="text-xs text-muted-foreground">
                {stage === "rendering"
                  ? `Rendering ${progress}%`
                  : stage === "saving"
                    ? "Saving to your library…"
                    : "Downloaded and saved to your library."}
              </p>
            </div>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            data-testid="start-export"
            pending={busy}
            disabled={duration <= 0 || !supported(format)}
            onClick={() => void run()}
          >
            {duration <= 0 ? "The timeline is empty" : "Export"}
          </Button>
          {exports.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold">Earlier exports</h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {exports.map((row) => (
                  <li
                    key={row.id}
                    data-testid="export-row"
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(row.size)} · {formatDate(row.createdAt)}
                    </span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Download ${row.name}`}
                      render={
                        <a href={fileUrl(row.mediaId)} download={row.name} />
                      }
                    >
                      <Download />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
