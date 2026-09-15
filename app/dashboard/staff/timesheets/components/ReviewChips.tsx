"use client";

import { useEffect, useRef } from "react";
import { Check, CircleAlert, Hourglass, WalletCards, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ReviewCounts } from "@/lib/timesheets/summary";
import type { TimesheetReviewFilter } from "@/lib/timesheets/types";

const CHIPS: {
  value: TimesheetReviewFilter;
  label: string;
  icon: typeof CircleAlert;
}[] = [
  { value: "missing", label: "Missing clock-out", icon: CircleAlert },
  { value: "long", label: "Over 16 hours", icon: Hourglass },
  { value: "norate", label: "No pay rate", icon: WalletCards },
];

/**
 * "Needs review": the surface that would have caught the ticket's 319-hour
 * shift instead of burying it in a total. Neutral chips (DS-CTL-03) — the word
 * and the count carry the meaning, never a colour (D-12).
 */
export function ReviewChips({
  counts,
  active,
  onChange,
  periodNoun,
}: {
  counts: ReviewCounts | null;
  active: TimesheetReviewFilter | null;
  onChange: (next: TimesheetReviewFilter | null) => void;
  /** "this week" / "this month" / "this period". */
  periodNoun: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);

  // §13.2: the applied chip scrolls into view on a phone, where the row scrolls.
  useEffect(() => {
    railRef.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

  if (!counts) return null;

  const visible = CHIPS.filter((chip) => counts[chip.value] > 0 || chip.value === active);

  if (visible.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
        <Check className="h-4 w-4" />
        Nothing needs review {periodNoun}
      </p>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden shrink-0 text-[0.8125rem] text-muted-foreground lg:inline">
        Needs review
      </span>
      <div
        ref={railRef}
        className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto"
      >
        {visible.map(({ value, label, icon: Icon }) => {
          const isActive = active === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(isActive ? null : value)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border-0 px-3 text-[0.8125rem] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
              <span className="font-medium tabular-nums text-foreground">
                {counts[value]}
              </span>
              {isActive && <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
