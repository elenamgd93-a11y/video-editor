import { FlipHorizontal2, Rewind, Volume2, VolumeX } from "lucide-react";
import { Choice, Pick } from "@/client/components/Choice";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Slider } from "@/client/components/ui/slider";
import { Textarea } from "@/client/components/ui/textarea";
import { NumberField } from "@/client/editor/NumberField";
import {
  FILTERS,
  TEXT_STYLES,
  clipLength,
  type Clip,
  type FilterId,
  type TextItem,
} from "@/lib/timeline";

const SPEEDS = ["0.25", "0.5", "0.75", "1", "1.25", "1.5", "2", "3", "4"];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function AdjustSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">{value}%</span>
      </div>
      <Slider
        aria-label={label}
        min={0}
        max={200}
        value={value}
        onValueChange={(v) =>
          onChange(Array.isArray(v) ? v[0]! : (v as number))
        }
      />
    </div>
  );
}

export function ClipInspector({
  clip,
  sourceLength,
  isFirst,
  onChange,
}: {
  clip: Clip;
  /** The file's length in seconds, when known. */
  sourceLength: number | null;
  isFirst: boolean;
  onChange: (patch: Partial<Clip>) => void;
}) {
  const visual = clip.kind !== "audio";
  const hasSound = clip.kind !== "image";
  const maxOut = sourceLength ?? 6 * 3600;
  return (
    <div className="grid gap-5">
      <p className="truncate text-sm font-medium">{clip.name}</p>
      <Section title="Timing">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Gap before (s)"
            value={clip.gap}
            min={0}
            max={3600}
            onChange={(gap) => onChange({ gap })}
            testId="item-gap"
          />
          {clip.kind === "image" ? (
            <NumberField
              label="Duration (s)"
              value={clipLength(clip)}
              min={0.1}
              max={3600}
              onChange={(d) => onChange({ in: 0, out: d * clip.speed })}
              testId="item-duration"
            />
          ) : (
            <>
              <NumberField
                label="Trim in (s)"
                value={clip.in}
                min={0}
                max={Math.max(0, clip.out - 0.1)}
                onChange={(v) => onChange({ in: v })}
                testId="item-in"
              />
              <NumberField
                label="Trim out (s)"
                value={clip.out}
                min={clip.in + 0.1}
                max={maxOut}
                onChange={(v) => onChange({ out: v })}
                testId="item-out"
              />
            </>
          )}
        </div>
        {clip.kind !== "image" ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28">
              <Pick
                label="Speed"
                testId="item-speed"
                value={String(clip.speed)}
                onChange={(v) => onChange({ speed: Number(v) })}
                options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
              />
            </div>
            {clip.kind === "video" ? (
              <Button
                variant="outline"
                size="sm"
                aria-pressed={clip.reverse}
                data-testid="reverse"
                onClick={() => onChange({ reverse: !clip.reverse })}
              >
                <Rewind />
                {clip.reverse ? "Reversed" : "Reverse"}
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Fade in (s)"
            value={clip.fadeIn}
            min={0}
            max={10}
            onChange={(fadeIn) => onChange({ fadeIn })}
            testId="item-fade-in"
          />
          <NumberField
            label="Fade out (s)"
            value={clip.fadeOut}
            min={0}
            max={10}
            onChange={(fadeOut) => onChange({ fadeOut })}
            testId="item-fade-out"
          />
        </div>
        {visual && !isFirst ? (
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Transition from the previous clip
            </Label>
            <div className="flex flex-wrap items-end gap-2">
              <Choice
                label="Transition"
                testId="transition"
                value={clip.transition}
                onChange={(transition) => onChange({ transition })}
                options={[
                  { value: "none", label: "Cut" },
                  { value: "crossfade", label: "Crossfade" },
                ]}
              />
              {clip.transition === "crossfade" ? (
                <div className="w-24">
                  <NumberField
                    label="Length (s)"
                    value={clip.transitionDuration}
                    min={0.1}
                    max={5}
                    onChange={(transitionDuration) =>
                      onChange({ transitionDuration })
                    }
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Section>
      {hasSound ? (
        <Section title="Sound">
          <div className="flex items-end gap-2">
            <div className="w-28">
              <NumberField
                label="Volume (%)"
                value={clip.volume}
                min={0}
                max={200}
                step={1}
                onChange={(volume) => onChange({ volume })}
                testId="item-volume"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={clip.muted}
              data-testid="mute"
              onClick={() => onChange({ muted: !clip.muted })}
            >
              {clip.muted ? <VolumeX /> : <Volume2 />}
              {clip.muted ? "Muted" : "Mute"}
            </Button>
          </div>
        </Section>
      ) : null}
      {visual ? (
        <>
          <Section title="Frame">
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              aria-pressed={clip.mirror}
              data-testid="mirror"
              onClick={() => onChange({ mirror: !clip.mirror })}
            >
              <FlipHorizontal2 />
              {clip.mirror ? "Mirrored" : "Mirror"}
            </Button>
            <div className="grid grid-cols-4 gap-2">
              {(["left", "top", "right", "bottom"] as const).map((side) => (
                <NumberField
                  key={side}
                  label={`Crop ${side} %`}
                  value={clip.crop[side]}
                  min={0}
                  max={45}
                  step={1}
                  onChange={(v) =>
                    onChange({ crop: { ...clip.crop, [side]: v } })
                  }
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <NumberField
                label="Move X %"
                value={clip.x}
                min={-100}
                max={100}
                step={1}
                onChange={(x) => onChange({ x })}
              />
              <NumberField
                label="Move Y %"
                value={clip.y}
                min={-100}
                max={100}
                step={1}
                onChange={(y) => onChange({ y })}
              />
              <NumberField
                label="Scale %"
                value={clip.scale}
                min={10}
                max={400}
                step={1}
                onChange={(scale) => onChange({ scale })}
              />
            </div>
          </Section>
          <Section title="Colour">
            <Pick
              label="Filter"
              testId="filter-select"
              value={clip.filter}
              onChange={(filter) => onChange({ filter })}
              options={(Object.keys(FILTERS) as FilterId[]).map((f) => ({
                value: f,
                label: FILTERS[f].label,
              }))}
            />
            <AdjustSlider
              label="Brightness"
              value={clip.brightness}
              onChange={(brightness) => onChange({ brightness })}
            />
            <AdjustSlider
              label="Contrast"
              value={clip.contrast}
              onChange={(contrast) => onChange({ contrast })}
            />
            <AdjustSlider
              label="Saturation"
              value={clip.saturation}
              onChange={(saturation) => onChange({ saturation })}
            />
          </Section>
        </>
      ) : null}
    </div>
  );
}

export function TextInspector({
  item,
  onChange,
}: {
  item: TextItem;
  onChange: (patch: Partial<TextItem>) => void;
}) {
  return (
    <div className="grid gap-5">
      <Section title="Text">
        <Textarea
          aria-label="Text"
          data-testid="text-content"
          rows={3}
          maxLength={500}
          value={item.text}
          onChange={(e) => onChange({ text: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Starts (s)"
            value={item.start}
            min={0}
            max={Math.max(0, item.end - 0.1)}
            onChange={(start) => onChange({ start })}
            testId="text-start"
          />
          <NumberField
            label="Ends (s)"
            value={item.end}
            min={item.start + 0.1}
            max={6 * 3600}
            onChange={(end) => onChange({ end })}
            testId="text-end"
          />
        </div>
      </Section>
      <Section title="Style">
        <Pick
          label="Style"
          testId="text-style"
          value={item.style}
          onChange={(style) => onChange({ style })}
          options={(
            Object.keys(TEXT_STYLES) as (keyof typeof TEXT_STYLES)[]
          ).map((s) => ({ value: s, label: TEXT_STYLES[s] }))}
        />
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Size"
            value={item.size}
            min={8}
            max={300}
            step={1}
            onChange={(size) => onChange({ size })}
          />
          <NumberField
            label="Left %"
            value={item.x}
            min={0}
            max={100}
            step={1}
            onChange={(x) => onChange({ x })}
          />
          <NumberField
            label="Top %"
            value={item.y}
            min={0}
            max={100}
            step={1}
            onChange={(y) => onChange({ y })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            aria-label="Text colour"
            className="h-8 w-14 p-1"
            value={item.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
          <Button
            variant="outline"
            size="sm"
            aria-pressed={item.bold}
            onClick={() => onChange({ bold: !item.bold })}
          >
            Bold
          </Button>
        </div>
      </Section>
    </div>
  );
}
