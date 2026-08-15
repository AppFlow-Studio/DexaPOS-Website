"use client";

import { cn } from "@/lib/utils";
import { tipStatusStyle } from "../lib/constants";

/**
 * Session status badge — DS-CTL-09 / D-11: soft tint carries the grouping, a
 * 6px dot carries the colour coding.
 *
 * ⚠️ C7 — the styles live in `lib/constants.ts`, which Tailwind does not scan.
 * The literal block below is what actually generates those rules. Keep it in
 * sync with `STATUS_STYLES`; a class present there but absent here reaches the
 * DOM with no rule behind it.
 *
 * bg-slate-500/10 dark:bg-slate-400/10 text-slate-700 dark:text-slate-300 bg-slate-400 dark:bg-slate-500
 * bg-blue-500/10 dark:bg-blue-400/10 text-blue-700 dark:text-blue-300 bg-blue-500 dark:bg-blue-400
 * bg-amber-500/10 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 bg-amber-500 dark:bg-amber-400
 * bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 bg-emerald-500 dark:bg-emerald-400
 * bg-indigo-500/10 dark:bg-indigo-400/10 text-indigo-700 dark:text-indigo-300 bg-indigo-500 dark:bg-indigo-400
 * bg-red-500/10 dark:bg-red-400/10 text-red-700 dark:text-red-300 bg-red-500 dark:bg-red-400
 */
export function TipStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const style = tipStatusStyle(status);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        style.bg,
        style.text,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}

/**
 * The tinted classes above, spelled out literally so Tailwind emits them.
 * Rendered `hidden` — it exists purely as a scan target, mirroring the note in
 * the doc comment. Zero runtime cost beyond one empty span.
 */
export function TipStatusBadgeClassAnchor() {
  return (
    <span
      hidden
      className="bg-slate-500/10 dark:bg-slate-400/10 text-slate-700 dark:text-slate-300 bg-blue-500/10 dark:bg-blue-400/10 text-blue-700 dark:text-blue-300 bg-amber-500/10 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 bg-indigo-500/10 dark:bg-indigo-400/10 text-indigo-700 dark:text-indigo-300 bg-red-500/10 dark:bg-red-400/10 text-red-700 dark:text-red-300 bg-slate-400 dark:bg-slate-500 bg-blue-500 dark:bg-blue-400 bg-amber-500 dark:bg-amber-400 bg-emerald-500 dark:bg-emerald-400 bg-indigo-500 dark:bg-indigo-400 bg-red-500 dark:bg-red-400"
    />
  );
}
