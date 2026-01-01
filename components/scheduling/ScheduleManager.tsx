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
  addDays,
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
import { TemplateDrawer } from "./templates/TemplateDrawer";
import { ApplyTemplateDialog } from "./templates/ApplyTemplateDialog";
import { ApplyMode, ScheduleTemplate } from "@/types/schedule";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";

export function ScheduleManager({ scheduleId }: { scheduleId: string }) {
  const {
    currentViewDate,
    setCurrentViewDate,
    weeklySchedules,
    schedulePeriods,
    applyTemplate,
  } = useScheduleStore();
  const { templates } = useScheduleTemplateStore();

  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [applyMode, setApplyMode] = useState<ApplyMode>("merge");

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

  const weekStart = startOfDay(currentDate);
  const weekEnd = addDays(weekStart, 6);

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

  // Template Handlers
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setIsApplyDialogOpen(true);
  };

  const handleApplyTemplate = () => {
    if (!selectedTemplateId || !schedule) return;

    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    applyTemplate(scheduleId, schedule.type, template, applyMode);
    setIsApplyDialogOpen(false);
    setSelectedTemplateId(null);
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

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
          {/* <TemplateManager onApply={handleSelectTemplate} /> Replaces with dedicated page */}
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() =>
              window.open("/dashboard/schedules/templates", "_blank")
            }
            // Using window.open for now to keep context, or use router.push if we want to leave.
            // Plan says "navigation to /dashboard/schedules/templates".
          >
            <CalendarIcon className="h-4 w-4" />
            Library
          </Button>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Publish
          </Button>
        </div>
      </div>

      {/* Main Content Area with Drawer */}
      <div className="flex-1 flex overflow-hidden border rounded-lg bg-background">
        <div className="flex-1 overflow-auto">
          <WeeklyCalendar
            currentDate={currentDate}
            scheduleId={scheduleId}
            minDate={scheduleStart || undefined}
            maxDate={scheduleEnd || undefined}
          />
        </div>

        {/* Template Drawer Sidebar */}
        <TemplateDrawer onApplyTemplate={handleSelectTemplate} />
      </div>

      {/* Template Dialogs */}
      {selectedTemplate && (
        <ApplyTemplateDialog
          isOpen={isApplyDialogOpen}
          onClose={() => setIsApplyDialogOpen(false)}
          templateName={selectedTemplate.name}
          shiftsToAdd={selectedTemplate.shifts.length}
          conflictsDetected={0} // TODO: Implement pre-calculation if needed
          applyMode={applyMode}
          onApplyModeChange={setApplyMode}
          onApply={handleApplyTemplate}
        />
      )}
    </div>
  );
}
