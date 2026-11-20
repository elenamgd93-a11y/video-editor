import { useEffect, useState } from "react";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";

/** A number input that commits valid values as they're typed, clamped to its range. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  testId,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  testId?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(round(value)));
  useEffect(() => {
    if (Number(text) !== round(value)) setText(String(round(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        className="h-8"
        data-testid={testId}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n))
            onChange(Math.min(max, Math.max(min, n)));
        }}
        onBlur={() => setText(String(round(value)))}
      />
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;
