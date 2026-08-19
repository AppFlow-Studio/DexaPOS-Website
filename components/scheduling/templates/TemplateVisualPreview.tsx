import React from "react";
import { cn } from "@/lib/utils";
import { TemplateShift } from "@/types/schedule";

interface TemplateVisualPreviewProps {
  shifts: TemplateShift[];
  className?: string;
  compact?: boolean;
}

/** Display order is Mon-Sun; TemplateShift.dayOfWeek follows JS getDay() (0=Sun). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_INITIALS: Record<number, string> = {
  0: "S",
  1: "M",
  2: "T",
  3: "W",
  4: "T",
  5: "F",
  6: "S",
};
const DAY_NAMES: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export function TemplateVisualPreview({
  shifts,
  className,
  compact = false,
}: TemplateVisualPreviewProps) {
  const countsByDay = WEEK_ORDER.map((dayIndex) => ({
    dayIndex,
    count: shifts.filter((s) => s.dayOfWeek === dayIndex).length,
  }));

  // Scaling against the busiest day keeps the bars comparable *within* a
  // template. A fixed divisor made a one-shift week look identical to a
  // five-shift week, which is the whole thing this preview is meant to show.
  const busiest = Math.max(...countsByDay.map((d) => d.count), 1);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        {countsByDay.map(({ dayIndex, count }) => (
          <div
            key={dayIndex}
            className={cn(
              "size-1.5 rounded-full transition-colors",
              count > 0 ? "bg-primary" : "bg-muted-foreground/25",
            )}
            title={`${DAY_NAMES[dayIndex]}: ${count} ${count === 1 ? "shift" : "shifts"}`}
          />
        ))}
      </div>
    );
  }

  // A template with no shifts rendered as seven empty tracks, which reads as
  // a broken chart rather than as an empty template. Say so instead.
  if (shifts.length === 0) {
    return (
      <div
        className={cn(
          "flex h-[52px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground",
          className,
        )}
      >
        No shifts yet
      </div>
    );
  }

  return (
    <div className={cn("flex items-stretch justify-between gap-1", className)}>
      {countsByDay.map(({ dayIndex, count }) => {
        const hasShifts = count > 0;
        return (
          <div
            key={dayIndex}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${DAY_NAMES[dayIndex]}: ${count} ${count === 1 ? "shift" : "shifts"}`}
          >
            {/* A full-height track gives every bar a shared baseline and top,
                so a single filled day still reads as one day within a week
                rather than as a floating square. */}
            <div className="flex h-8 w-full items-end rounded-sm bg-muted/50">
              <div
                className={cn(
                  "flex w-full items-start justify-center rounded-sm transition-all",
                  hasShifts ? "bg-primary" : "bg-transparent",
                )}
                style={{
                  height: hasShifts
                    ? `${Math.max((count / busiest) * 100, 40)}%`
                    : "0%",
                }}
              >
                {/* Height alone is a weak signal at this size; the number
                    makes the busy days legible at a glance. Only shown when
                    the bar is tall enough to hold it. */}
                {count > 1 && (
                  <span className="pt-0.5 text-[0.5625rem] font-semibold leading-none text-primary-foreground">
                    {count}
                  </span>
                )}
              </div>
            </div>
            <span
              className={cn(
                "text-[0.625rem] leading-none tabular-nums",
                hasShifts
                  ? "font-medium text-foreground"
                  : "text-muted-foreground/60",
              )}
            >
              {DAY_INITIALS[dayIndex]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
