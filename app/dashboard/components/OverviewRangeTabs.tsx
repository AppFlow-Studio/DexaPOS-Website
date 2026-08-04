"use client";

import { useMemo } from "react";
import { Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type OverviewRange = "today" | "yesterday" | "7d" | "30d";

const RANGE_LABELS: Record<OverviewRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const RANGE_ORDER: OverviewRange[] = ["today", "yesterday", "7d", "30d"];

/**
 * Resolves a range key to concrete [from, to) dates in local time.
 * `to` is exclusive-ish (end of day) so same-day ranges include today's orders.
 */
export function resolveOverviewRange(range: OverviewRange): {
  from: Date;
  to: Date;
} {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);

  switch (range) {
    case "today":
      return { from, to };
    case "yesterday": {
      from.setDate(from.getDate() - 1);
      const yesterdayEnd = new Date(from);
      yesterdayEnd.setHours(23, 59, 59, 999);
      return { from, to: yesterdayEnd };
    }
    case "7d":
      from.setDate(from.getDate() - 6);
      return { from, to };
    case "30d":
    default:
      from.setDate(from.getDate() - 29);
      return { from, to };
  }
}

/**
 * Segmented range picker plus a plain-text summary of the resolved window.
 * Sits at the top of the Overview container and drives every section below it,
 * so the whole page reads against one time period.
 */
export function OverviewRangeTabs({
  value,
  onChange,
  className,
}: {
  value: OverviewRange;
  onChange: (range: OverviewRange) => void;
  className?: string;
}) {
  const summary = useMemo(() => {
    const { from, to } = resolveOverviewRange(value);
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
    return from.toDateString() === to.toDateString()
      ? fmt(from)
      : `${fmt(from)} – ${fmt(to)}`;
  }, [value]);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-6 py-4",
        className
      )}
    >
      {/* The four labels can't fit side by side on a phone — they squeezed and
          wrapped onto two lines. Below `sm` use a dropdown instead; the
          segmented pill returns once there's room for it. */}
      <Select
        value={value}
        onValueChange={(v) => onChange(v as OverviewRange)}
      >
        <SelectTrigger
          size="sm"
          className="w-[9.5rem] rounded-full sm:hidden"
          aria-label="Date range"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_ORDER.map((range) => (
            <SelectItem key={range} value={range}>
              {RANGE_LABELS[range]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="hidden items-center gap-0.5 rounded-full bg-muted/70 p-1 sm:flex">
        {RANGE_ORDER.map((range) => {
          const isActive = range === value;
          return (
            <button
              key={range}
              type="button"
              onClick={() => onChange(range)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {RANGE_LABELS[range]}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        {summary}
      </div>
    </div>
  );
}
