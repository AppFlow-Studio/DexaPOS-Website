"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { ScrollableTabsBar } from "@/components/dashboard/ScrollableTabsBar";
import { DateRangePicker } from "@/components/dashboard/orders/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  canStepForward,
  clampCustomRange,
  containsDate,
  formatPeriodLabel,
  periodContaining,
  stepPeriod,
  type TimesheetPeriod,
} from "@/lib/timesheets/period";
import type { TimesheetPeriodKind } from "@/lib/timesheets/types";

const KINDS: { value: TimesheetPeriodKind; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
];

/** A local-midnight Date for a bare calendar date — what the day picker expects. */
function toPickerDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fromPickerDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Week / Month / Custom rail plus the period stepper. Stepper shape copies the
 * Schedules week navigator so the two staff pages move through time the same way.
 */
export function PeriodControls({
  period,
  today,
  onChange,
}: {
  period: TimesheetPeriod;
  /** Today at the location, YYYY-MM-DD. */
  today: string;
  onChange: (period: TimesheetPeriod) => void;
}) {
  const changeKind = (kind: TimesheetPeriodKind) => {
    if (kind === period.kind) return;
    if (kind === "custom") {
      onChange({ kind: "custom", start: period.start, end: period.end });
      return;
    }
    // Keep the manager where they were: the current period if it holds
    // today, otherwise the one that opens where they were looking.
    const anchor = containsDate(period, today) ? today : period.start;
    onChange(periodContaining(kind, anchor));
  };

  const isCurrent = containsDate(period, today);
  const nextDisabled = !canStepForward(period, today);

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Tabs
        value={period.kind}
        onValueChange={(value) => changeKind(value as TimesheetPeriodKind)}
      >
        <ScrollableTabsBar activeValue={period.kind} className="w-full min-w-0 overflow-x-auto sm:w-auto">
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            {KINDS.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollableTabsBar>
      </Tabs>

      <div className="flex min-w-0 items-center gap-2">
        {period.kind === "custom" ? (
          <DateRangePicker
            dateFrom={toPickerDate(period.start)}
            dateTo={toPickerDate(period.end)}
            onDateRangeChange={(from, to) => {
              if (!from) return;
              onChange(clampCustomRange(fromPickerDate(from), fromPickerDate(to ?? from)));
            }}
            preset="custom"
            initializeWhenEmpty={false}
            align="start"
            className="min-w-0"
            triggerClassName="h-9 rounded-full bg-background px-4 text-[0.8125rem] font-medium tabular-nums shadow-sm dark:bg-input/30"
          />
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-muted/60 p-1 sm:flex-none">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(stepPeriod(period, -1))}
              className="shrink-0"
              aria-label={period.kind === "week" ? "Previous week" : "Previous month"}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span
              aria-live="polite"
              className="min-w-0 flex-1 px-1 text-center text-sm font-medium tabular-nums sm:min-w-[200px]"
            >
              {formatPeriodLabel(period)}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(stepPeriod(period, 1))}
              disabled={nextDisabled}
              className="shrink-0"
              aria-label={period.kind === "week" ? "Next week" : "Next month"}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {period.kind !== "custom" && !isCurrent && (
          <Button
            variant="ghost"
            className="h-9 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium text-muted-foreground"
            onClick={() => onChange(periodContaining(period.kind, today))}
          >
            {period.kind === "week" ? "This week" : "This month"}
          </Button>
        )}
      </div>
    </div>
  );
}
