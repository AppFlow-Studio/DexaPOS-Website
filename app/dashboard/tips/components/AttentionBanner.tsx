"use client";

import { useState } from "react";
import { AlertTriangle, Clock, CalendarX, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
      <div className="rounded-2xl border-0 bg-amber-50 dark:bg-amber-900/20">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-400">
              {totalIssues} issue{totalIssues !== 1 ? "s" : ""} need attention
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          )}
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-4">
            {/* Orphaned Shifts */}
            {orphanedShifts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                  <span className="text-sm font-medium text-red-700 dark:text-red-400">
                    {orphanedShifts.length} staff still clocked in from previous days
                  </span>
                </div>
                <div className="space-y-1.5 ml-5">
                  {orphanedShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="text-amber-800 dark:text-amber-400">
                        <span className="font-medium">{shift.staffName}</span>
                        <span className="text-amber-600 dark:text-amber-400/80 ml-1.5">
                          — clocked in {format(new Date(shift.clockInTime), "EEE h:mm a")}
                          {" "}({Math.round(shift.hoursSinceClockIn)}h ago)
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-full text-xs border-0 bg-amber-500/15 text-amber-700 shadow-none hover:bg-amber-500/25 dark:text-amber-400"
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
                <div className="flex items-center gap-1.5">
                  <CalendarX className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    {unclosedDays.length} day{unclosedDays.length !== 1 ? "s" : ""} need tip close-out
                  </span>
                </div>
                <div className="space-y-1.5 ml-5">
                  {unclosedDays.map((day, index) => {
                    const isFirstUnclosed = index === 0;
                    return (
                      <div
                        key={day.date}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="text-amber-800 dark:text-amber-400">
                          <span className="font-medium">{formatDate(day.date)}</span>
                          <span className="text-amber-600 dark:text-amber-400/80 ml-1.5">
                            — {day.orderCount} orders · {formatMoney(day.totalTips)} tips · {day.shiftCount} staff
                          </span>
                          {day.hasOrphanedShifts && (
                            <Badge variant="outline" className="ml-1.5 text-[10px] border-0 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
                              has orphaned shifts
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-full text-xs border-0 bg-amber-500/15 text-amber-700 shadow-none hover:bg-amber-500/25 dark:text-amber-400"
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
