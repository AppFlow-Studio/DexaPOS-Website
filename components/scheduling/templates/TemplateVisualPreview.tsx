import React from "react";
import { cn } from "@/lib/utils";
import { TemplateShift } from "@/types/schedule";

interface TemplateVisualPreviewProps {
  shifts: TemplateShift[];
  className?: string;
  compact?: boolean;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TemplateVisualPreview({
  shifts,
  className,
  compact = false,
}: TemplateVisualPreviewProps) {
  // 0 = Sunday in TemplateShift (usually), but UI often shows Mon-Sun.
  // Let's assume standard JS getDay(): 0=Sun, 1=Mon.
  // We want to display Mon -> Sun order.
  const weekOrder = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className={cn("flex items-end justify-between gap-1 h-8", className)}>
      {weekOrder.map((dayIndex) => {
        const dayShifts = shifts.filter((s) => s.dayOfWeek === dayIndex);
        const hasShifts = dayShifts.length > 0;
        const count = dayShifts.length;

        // Visual logic:
        // - No shifts: low opacity bar or dot
        // - Shifts: high opacity, height proportional to count (max 3)
        // - Compact: just a dot?

        if (compact) {
          return (
            <div
              key={dayIndex}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors",
                hasShifts ? "bg-primary" : "bg-muted"
              )}
              title={`${
                DAYS[dayIndex === 0 ? 6 : dayIndex - 1]
              }: ${count} shifts`}
            />
          );
        }

        return (
          <div
            key={dayIndex}
            className="flex flex-col items-center gap-0.5 flex-1 h-full justify-end"
            title={`${
              DAYS[dayIndex === 0 ? 6 : dayIndex - 1]
            }: ${count} shifts`}
          >
            <div
              className={cn(
                "w-full rounded-sm transition-all",
                hasShifts ? "bg-primary" : "bg-muted/30"
              )}
              style={{
                height: hasShifts
                  ? `${Math.min(count * 25 + 25, 100)}%`
                  : "4px",
                opacity: hasShifts ? 1 : 0.5,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
