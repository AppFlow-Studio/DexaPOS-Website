"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SnoozeDuration } from "@/lib/queries/use-snoozes";

/**
 * Inline duration picker for 86ing (mark out of stock). A plain row of buttons —
 * NOT a Radix dropdown/popover — so it is safe to render inside the item-editor
 * Dialog, where a portaled popover fights the Dialog focus scope (the reason the
 * modifier toggles historically used a Switch). Shared by the modifier + group
 * out-of-stock controls to give them the same durations items already have.
 */
export function SnoozeDurationButtons({
  onPick,
  disabled,
  className,
}: {
  onPick: (duration: SnoozeDuration) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onPick({ kind: "hours", hours: 1 })}
      >
        1 hour
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onPick({ kind: "hours", hours: 4 })}
      >
        4 hours
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onPick({ kind: "end_of_day" })}
      >
        End of day
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onPick({ kind: "until_manual" })}
      >
        Until I turn it on
      </Button>
    </div>
  );
}

export default SnoozeDurationButtons;
