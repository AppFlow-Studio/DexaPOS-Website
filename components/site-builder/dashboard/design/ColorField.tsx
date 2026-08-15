"use client";

import { Label } from "@/components/ui/label";
import { isHexColor } from "@/lib/site-builder/color";
import { cn } from "@/lib/utils";

/**
 * One colour role: a native picker swatch, a hex field, and the sentence that
 * explains what the colour actually controls on the published site.
 *
 * The swatch shows `value` (the last valid colour) while the text field shows
 * `draft` (whatever is typed). Keeping those separate is what lets a merchant
 * clear the field and retype without the preview flashing black on every
 * intermediate keystroke.
 */
export default function ColorField({
  id,
  label,
  help,
  value,
  draft,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  draft: string;
  onChange: (next: string) => void;
}) {
  const invalid = !isHexColor(draft);

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <div className="flex items-center gap-2.5">
        <label
          className="relative flex h-10 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50"
          title={`Choose ${label.toLowerCase()}`}
        >
          <span className="absolute inset-1 rounded-sm" style={{ background: value }} />
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`Choose ${label.toLowerCase()}`}
          />
        </label>
        <input
          id={id}
          value={draft}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={`${id}-help`}
          className={cn(
            "h-10 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono text-sm uppercase outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/50",
            invalid && "border-destructive focus-visible:ring-destructive/20",
          )}
        />
      </div>
      <p id={`${id}-help`} className={cn("text-xs leading-5", invalid ? "text-destructive" : "text-muted-foreground")}>
        {invalid ? "Enter a 6-digit hex colour, for example #0C4FD1." : help}
      </p>
    </div>
  );
}
