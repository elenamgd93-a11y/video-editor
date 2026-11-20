import type { ReactNode } from "react";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Label } from "@/client/components/ui/label";

/** A single choice among a few options, as pressed buttons. */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  testId,
  label,
  disabled,
}: {
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  /** Each button gets `${testId}-${value}`, with ":" as "x". */
  testId: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      size="sm"
      variant="outline"
      aria-label={label}
      value={[value]}
      disabled={disabled}
      onValueChange={(next) => {
        const picked = next[0] as T | undefined;
        if (picked) onChange(picked);
      }}
      className="flex-wrap"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          data-testid={`${testId}-${option.value.replace(/:/g, "x")}`}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A labelled dropdown of options. */
export function Pick<T extends string>({
  options,
  value,
  onChange,
  testId,
  label,
  hideLabel,
  disabled,
  placeholder,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  testId: string;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      {hideLabel ? null : <Label>{label}</Label>}
      <Select
        items={options}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
      >
        <SelectTrigger
          data-testid={testId}
          aria-label={label}
          className="w-full"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A label above its control. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
