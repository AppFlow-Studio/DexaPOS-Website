"use client";

import { cn } from "@/lib/utils";
import { tipStatusLabel } from "../lib/constants";

/**
 * Session status badge — DS-CTL-09 / D-12: one neutral pill for every state.
 *
 * Status is not colour-coded. The previous treatment (D-11) gave each status a
 * soft tint plus a coloured dot, which turned the page into a colour key the
 * user had to learn. The word carries the meaning instead.
 */
export function TipStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      {tipStatusLabel(status)}
    </span>
  );
}
