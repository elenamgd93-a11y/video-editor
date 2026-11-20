import { Plus, Scissors, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Pick } from "@/client/components/Choice";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NumberField } from "@/client/editor/NumberField";
import { clipAudioWav } from "@/client/editor/engine";
import {
  CAPTION_POSITIONS,
  CAPTION_STYLES,
  layout,
  sortCaptions,
  splitCaption,
  type Caption,
  type Timeline,
} from "@/lib/timeline";

const MAX_WAV_BYTES = 10 * 1024 * 1024;

export function CaptionsPanel({
  projectId,
  timeline,
  playhead,
  readOnly,
  change,
}: {
  projectId: string;
  timeline: Timeline;
  playhead: number;
  readOnly: boolean;
  change: (update: (t: Timeline) => Timeline) => void;
}) {
  const sources = [
    ...layout(timeline.visual),
    ...layout(timeline.audio),
  ].filter((p) => p.clip.kind !== "image" && !p.clip.reverse);
  const [clipId, setClipId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setCaptions = (update: (c: Caption[]) => Caption[]) =>
    change((t) => ({ ...t, captions: update(t.captions) }));
  const patch = (id: string, value: Partial<Caption>) =>
    setCaptions((list) =>
      list.map((c) => (c.id === id ? { ...c, ...value } : c)),
    );

  async function generate() {
    const placed = sources.find((p) => p.clip.id === clipId);
    if (!placed) return;
    setBusy(true);
    setError(null);
    try {
      const wav = await clipAudioWav(placed.clip);
      if (wav.size > MAX_WAV_BYTES)
        throw new Error(
          "That clip is too long. Trim it to five minutes or less.",
        );
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "content-type": "audio/wav" },
        body: wav,
      });
      const body = (await response.json().catch(() => ({}))) as {
        segments?: { start: number; end: number; text: string }[];
        error?: string;
      };
      if (!response.ok || !body.segments)
        throw new Error(body.error ?? "Captions couldn't be made.");
      if (body.segments.length === 0)
        throw new Error("No speech was found in that clip.");
      const speed = placed.clip.speed;
      const lines = body.segments.map((s) => ({
        id: crypto.randomUUID(),
        start: placed.start + s.start / speed,
        end: Math.min(placed.end, placed.start + s.end / speed),
        text: s.text,
      }));
      setCaptions((list) => sortCaptions([...list, ...lines]));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Captions couldn't be made.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {!readOnly ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Pick
              label="Style"
              testId="caption-style"
              value={timeline.captionStyle.preset}
              onChange={(preset) =>
                change((t) => ({
                  ...t,
                  captionStyle: { ...t.captionStyle, preset },
                }))
              }
              options={(
                Object.keys(CAPTION_STYLES) as (keyof typeof CAPTION_STYLES)[]
              ).map((k) => ({ value: k, label: CAPTION_STYLES[k] }))}
            />
            <Pick
              label="Position"
              testId="caption-position"
              value={timeline.captionStyle.position}
              onChange={(position) =>
                change((t) => ({
                  ...t,
                  captionStyle: { ...t.captionStyle, position },
                }))
              }
              options={(
                Object.keys(
                  CAPTION_POSITIONS,
                ) as (keyof typeof CAPTION_POSITIONS)[]
              ).map((k) => ({ value: k, label: CAPTION_POSITIONS[k] }))}
            />
          </div>
          <div className="grid gap-2 rounded-lg border border-border p-3">
            <Pick
              label="Make captions from speech in"
              testId="caption-clip"
              value={clipId}
              onChange={setClipId}
              placeholder={
                sources.length
                  ? "Choose a clip"
                  : "Add a video or audio clip first"
              }
              disabled={sources.length === 0}
              options={sources.map((p) => ({
                value: p.clip.id,
                label: p.clip.name,
              }))}
            />
            <Button
              variant="outline"
              size="sm"
              data-testid="generate-captions"
              disabled={!clipId || busy}
              pending={busy}
              onClick={() => void generate()}
            >
              <Sparkles />
              Generate captions
            </Button>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {!readOnly ? (
          <Button
            size="sm"
            data-testid="add-caption"
            onClick={() =>
              setCaptions((list) =>
                sortCaptions([
                  ...list,
                  {
                    id: crypto.randomUUID(),
                    start: playhead,
                    end: playhead + 2,
                    text: "",
                  },
                ]),
              )
            }
          >
            <Plus />
            Add line
          </Button>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          variant="ghost"
          data-testid="download-srt"
          render={
            <a href={`/api/projects/${projectId}/captions.srt`} download />
          }
        >
          Download .srt
        </Button>
      </div>
      {timeline.captions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No captions yet.</p>
      ) : (
        <ul className="grid gap-2">
          {timeline.captions.map((caption) => (
            <li
              key={caption.id}
              data-testid="caption-line"
              className="grid gap-2 rounded-lg border border-border p-2"
            >
              <Input
                aria-label="Caption text"
                data-testid="caption-text"
                className="h-8"
                readOnly={readOnly}
                maxLength={500}
                value={caption.text}
                placeholder="Caption text"
                onChange={(e) => patch(caption.id, { text: e.target.value })}
              />
              <div className="flex items-end gap-2">
                <NumberField
                  label="From (s)"
                  value={caption.start}
                  min={0}
                  max={Math.max(0, caption.end - 0.1)}
                  disabled={readOnly}
                  onChange={(start) => patch(caption.id, { start })}
                />
                <NumberField
                  label="To (s)"
                  value={caption.end}
                  min={caption.start + 0.1}
                  max={6 * 3600}
                  disabled={readOnly}
                  onChange={(end) => patch(caption.id, { end })}
                />
                {!readOnly ? (
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Split at playhead"
                      disabled={
                        playhead <= caption.start || playhead >= caption.end
                      }
                      onClick={() =>
                        setCaptions(
                          (list) =>
                            splitCaption(
                              list,
                              caption.id,
                              playhead,
                              crypto.randomUUID(),
                            ) ?? list,
                        )
                      }
                    >
                      <Scissors />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete line"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setCaptions((list) =>
                          list.filter((c) => c.id !== caption.id),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
