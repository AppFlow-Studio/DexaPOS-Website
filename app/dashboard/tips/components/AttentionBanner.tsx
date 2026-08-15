"use client";

import { useState } from "react";
import { AlertTriangle, Clock, CalendarX, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { ForceClockOutDialog } from "./ForceClockOutDialog";
import { formatMoney, formatDate } from "../lib/constants";
import type { OrphanedShift, UnclosedDay } from "@/app/dashboard/actions/tips";

interface AttentionBannerProps {
  orphanedShifts: OrphanedShift[];
  unclosedDays: UnclosedDay[];
  onForceClockOut: (shiftId: string, clockOutTime: string, cashTips: number) => void;
  onCloseOutDay: (date: string) => void;
  isForceClockOutLoading: boolean;
}

export function AttentionBanner({
  orphanedShifts,
  unclosedDays,
  onForceClockOut,
  onCloseOutDay,
  isForceClockOutLoading,
}: AttentionBannerProps) {
  const [expanded, setExpanded] = useState(true);
  const [clockingOutShift, setClockingOutShift] = useState<OrphanedShift | null>(null);

  const totalIssues = (orphanedShifts.length > 0 ? 1 : 0) + (unclosedDays.length > 0 ? 1 : 0);
  if (totalIssues === 0) return null;

  const handleForceClockOut = (shiftId: string, clockOutTime: string, cashTips: number) => {
    onForceClockOut(shiftId, clockOutTime, cashTips);
    setClockingOutShift(null);
  };

  return (
    <>
      {/* The amber marks the alert on the header strip only. Tinting the whole
          expanded body floods the panel — in dark mode it reads as a second
          page background rather than a notice. */}
      <div className="min-w-0 overflow-hidden rounded-2xl border border-amber-500/25 bg-card dark:border-amber-400/20">
        <button
          className="flex w-full min-w-0 items-center justify-between gap-3 bg-amber-500/10 px-4 py-3.5 text-left transition-colors hover:bg-amber-500/15 dark:bg-amber-400/10 dark:hover:bg-amber-400/15"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="min-w-0 text-sm font-semibold text-amber-800 dark:text-amber-300">
              {totalIssues} issue{totalIssues !== 1 ? "s" : ""} need attention
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
        </button>

        {expanded && (
          <div className="min-w-0 space-y-5 px-4 pb-4 pt-4">
            {/* Orphaned Shifts */}
            {orphanedShifts.length > 0 && (
              <div className="space-y-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 text-sm font-medium text-foreground">
                    {orphanedShifts.length} staff still clocked in from previous days
                  </span>
                </div>
                {/* Wraps: a rigid label/action row pushes the button off the
                    right edge once the name and timestamp fill the line. */}
                <div className="ml-5 space-y-2">
                  {orphanedShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm"
                    >
                      <p className="min-w-0 flex-1">
                        <span className="font-medium text-foreground">{shift.staffName}</span>
                        <span className="ml-1.5 tabular-nums text-muted-foreground">
                          — clocked in {format(new Date(shift.clockInTime), "EEE h:mm a")}
                          {" "}({Math.round(shift.hoursSinceClockIn)}h ago)
                        </span>
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium shadow-sm"
                        onClick={() => setClockingOutShift(shift)}
                      >
                        Force Clock Out
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unclosed Days */}
            {unclosedDays.length > 0 && (
              <div className="space-y-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <CalendarX className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 text-sm font-medium text-foreground">
                    {unclosedDays.length} day{unclosedDays.length !== 1 ? "s" : ""} need tip close-out
                  </span>
                </div>
                <div className="ml-5 space-y-2">
                  {unclosedDays.map((day, index) => {
                    const isFirstUnclosed = index === 0;
                    return (
                      <div
                        key={day.date}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm"
                      >
                        <p className="min-w-0 flex-1">
                          <span className="font-medium text-foreground">{formatDate(day.date)}</span>
                          <span className="ml-1.5 tabular-nums text-muted-foreground">
                            — {day.orderCount} orders · {formatMoney(day.totalTips)} tips · {day.shiftCount} staff
                          </span>
                          {day.hasOrphanedShifts && (
                            <span className="ml-1.5 inline-flex items-center rounded-full border-0 bg-muted/60 px-2 py-0.5 text-[10px] font-medium">
                              has orphaned shifts
                            </span>
                          )}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium shadow-sm"
                          disabled={!isFirstUnclosed}
                          onClick={() => onCloseOutDay(day.date)}
                        >
                          {isFirstUnclosed
                            ? day.hasOrphanedShifts
                              ? "Clock Out & Close"
                              : "Close Out"
                            : `Close ${unclosedDays[0].date.split("-")[2]} first`}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ForceClockOutDialog
        open={!!clockingOutShift}
        onOpenChange={(open) => { if (!open) setClockingOutShift(null); }}
        shift={clockingOutShift}
        onConfirm={handleForceClockOut}
        isLoading={isForceClockOutLoading}
      />
    </>
  );
}
