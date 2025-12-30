"use client";

import { useState, useEffect, useMemo } from "react";
import {
  startOfWeek,
  endOfWeek,
  format,
  addWeeks,
  subWeeks,
  parseISO,
  isAfter,
  isBefore,
  startOfDay,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Copy,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { useScheduleStore } from "@/stores/useScheduleStore";
import { Badge } from "@/components/ui/badge";
import { WeeklyCalendar } from "./WeeklyCalendar";

export function ScheduleManager({ scheduleId }: { scheduleId: string }) {
  const {
    currentViewDate,
    setCurrentViewDate,
    weeklySchedules,
    schedulePeriods,
  } = useScheduleStore();

  // Fetch the current schedule to get its bounds
  const schedule = useMemo(() => {
    return (
      weeklySchedules.find((s) => s.id === scheduleId) ||
      schedulePeriods.find((s) => s.id === scheduleId)
    );
  }, [scheduleId, weeklySchedules, schedulePeriods]);

  const scheduleStart = useMemo(
    () => (schedule ? parseISO(schedule.startDate) : null),
    [schedule]
  );
  const scheduleEnd = useMemo(
    () => (schedule ? parseISO(schedule.endDate) : null),
    [schedule]
  );

  // Ensure date object
  const currentDate = useMemo(
    () => new Date(currentViewDate),
    [currentViewDate]
  );

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

  // Auto-initialize view to schedule start date
  useEffect(() => {
    if (schedule?.startDate) {
      setCurrentViewDate(parseISO(schedule.startDate));
    }
  }, [schedule?.startDate, setCurrentViewDate]);

  // Navigation Guards
  const isWeekly = schedule?.type === "weekly";

  const canGoPrev = useMemo(() => {
    if (!scheduleStart) return true;
    // If weekly, strictly lock to the start date (cannot go before)
    if (isWeekly) return false;
    return isAfter(weekStart, scheduleStart);
  }, [scheduleStart, weekStart, isWeekly]);

  const canGoNext = useMemo(() => {
    if (!scheduleEnd) return true;
    // If weekly, strictly lock to the end date (cannot go after)
    if (isWeekly) return false;
    return isBefore(weekEnd, scheduleEnd);
  }, [scheduleEnd, weekEnd, isWeekly]);

  const handlePrevWeek = () => {
    if (canGoPrev) setCurrentViewDate(subWeeks(currentDate, 1));
  };
  const handleNextWeek = () => {
    if (canGoNext) setCurrentViewDate(addWeeks(currentDate, 1));
  };

  /* Removed unused state and handlers */

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-4">
      {/* Header / Toolbar */}
      <div className="flex items-center justify-between p-4 bg-background border rounded-lg shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-muted p-1 rounded-md">
            {!isWeekly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevWeek}
                disabled={!canGoPrev}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <span className="text-sm font-medium px-2 min-w-[200px] text-center">
              {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
            </span>
            {!isWeekly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextWeek}
                disabled={!canGoNext}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 gap-1">
            <CalendarIcon className="h-3 w-3" />
            Draft Mode
          </Badge>
          {/* Templates and Actions placeholders */}
          <Button variant="outline" size="sm" className="gap-2">
            <Copy className="h-4 w-4" />
            Templates
          </Button>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Publish
          </Button>
        </div>
      </div>

      {/* Main Calendar Area */}
      <div className="flex-1 border rounded-lg overflow-hidden bg-background">
        <WeeklyCalendar
          currentDate={currentDate}
          scheduleId={scheduleId}
          minDate={scheduleStart || undefined}
          maxDate={scheduleEnd || undefined}
        />
      </div>
    </div>
  );
}
