"use client";

import type { FieldControl } from "@/lib/site-builder/schema-introspect";
import { cn } from "@/lib/utils";

/**
 * The chrome every generated field shares: its label row and its input styling.
 *
 * Lives apart from `SectionDrawer` so an individual control can be a module of
 * its own without importing the drawer — which reaches the pickers, which reach
 * server actions, which cannot be loaded outside a request. A control that
 * cannot be imported on its own cannot be tested on its own either.
 */

export const inputClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * A field's label row.
 *
 * The character counter sits here rather than under the input, which is where
 * Owner puts it and where it belongs: a merchant writing a headline wants to
 * know the budget *before* they run out of it, not after.
 */
export function FieldLabel({
  control,
  value,
  className,
}: {
  control: FieldControl;
  value?: unknown;
  className?: string;
}) {
  const max = countableMax(control);
  const length = typeof value === "string" ? value.length : 0;

  return (
    <span className={cn("mb-1.5 flex items-baseline gap-1", className)}>
      <span className="text-xs font-medium">{control.label}</span>
      {!control.optional && (
        <span className="text-muted-foreground/60" title="Required">
          *
        </span>
      )}
      {max !== null && (
        <span
          className={cn(
            "ml-auto text-[11px] tabular-nums",
            length > max ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {length}/{max}
        </span>
      )}
    </span>
  );
}

/**
 * A counter is only honest when the limit is real.
 *
 * Rich text has no meaningful character budget — a merchant writing a paragraph
 * is not rationing characters — so it gets no counter even though its schema
 * carries a sanity cap.
 */
export function countableMax(control: FieldControl): number | null {
  if (control.kind !== "text") return null;
  return control.max ?? null;
}
