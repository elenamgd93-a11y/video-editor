import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { Pick } from "@/client/components/Choice";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { fileUrl, formatDate, probe } from "@/client/lib/media";
import { formatClock } from "@/lib/timeline";
import { setMediaDuration } from "@/serverFunctions/media";
import { generateVoiceover, getVoiceovers } from "@/serverFunctions/voiceover";

export const Route = createFileRoute("/voiceover")({
  loader: () => getVoiceovers(),
  head: () => ({ meta: [{ title: "Voiceover · Video Editor" }] }),
  component: VoiceoverPage,
});

const VOICE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "zh", label: "Chinese" },
  { value: "jp", label: "Japanese" },
  { value: "kr", label: "Korean" },
] as const;
type Voice = (typeof VOICE_OPTIONS)[number]["value"];

const LIMIT = 2000;

function VoiceoverPage() {
  const voiceovers = Route.useLoaderData();
  const router = useRouter();
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<Voice>("en");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setError(null);
    try {
      const result = await generateVoiceover({ data: { text, voice } });
      if (result.error || !result.id) {
        setError(result.error ?? "That didn't work.");
        return;
      }
      const probed = await probe(fileUrl(result.id), "audio");
      if (probed.durationMs)
        await setMediaDuration({
          data: { id: result.id, durationMs: probed.durationMs },
        });
      setText("");
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Voiceover"
        description="Voiceovers are saved to your library."
      />
      <form
        className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-xs"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) void generate();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="voiceover-text">Script</Label>
          <Textarea
            id="voiceover-text"
            data-testid="voiceover-text"
            rows={6}
            maxLength={LIMIT}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground">
            {text.length} / {LIMIT}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Pick
              label="Voice"
              testId="voice-select"
              value={voice}
              onChange={setVoice}
              options={[...VOICE_OPTIONS]}
            />
          </div>
          <Button
            type="submit"
            data-testid="generate-voiceover"
            pending={pending}
            disabled={!text.trim()}
          >
            {pending ? "Generating…" : "Generate"}
          </Button>
        </div>
        {error ? (
          <Alert variant="destructive" data-testid="voiceover-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
      {voiceovers.length === 0 ? (
        <EmptyState
          title="No voiceovers yet"
          description="Generated speech will appear here."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          {voiceovers.map((item) => (
            <li
              key={item.id}
              data-testid="voiceover-row"
              className="grid gap-2 px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate font-medium">{item.name}</p>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {item.durationMs != null
                    ? `${formatClock(item.durationMs / 1000)} · `
                    : ""}
                  {formatDate(item.createdAt)}
                </p>
              </div>
              <audio
                src={fileUrl(item.id)}
                controls
                preload="none"
                className="w-full"
              />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
