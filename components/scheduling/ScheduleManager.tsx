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
  getDay,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Copy,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { useScheduleStore } from "@/stores/useScheduleStore";
import { Badge } from "@/components/ui/badge";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { TemplateDrawer } from "./templates/TemplateDrawer";
import { ApplyTemplateDialog } from "./templates/ApplyTemplateDialog";
import { ApplyTemplateBar } from "./templates/ApplyTemplateBar";
import { ConflictResolutionModal } from "./templates/ConflictResolutionModal";
import { ApplyMode, ScheduleTemplate } from "@/types/schedule";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";
import { detectTemplateConflicts } from "@/lib/scheduling-rules";

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
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

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
  const handleApplyTemplate = () => {
    if (!selectedTemplateId || !schedule) return;

    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    applyTemplate(scheduleId, schedule.type, template, applyMode);
    setIsApplyDialogOpen(false);
    setSelectedTemplateId(null);
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  /* Template Preview Logic */
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(
    null
  );

  const previewTemplate = templates.find((t) => t.id === previewTemplateId);

  const previewShifts = useMemo(() => {
    if (!previewTemplateId || !previewTemplate) return undefined;

    const generatedShifts: any[] = [];

    // Iterate exactly 7 days starting from currentViewDate (start of grid)
    // This allows mapping template shifts correctly even if the view is Tue-Mon or Thu-Wed
    for (let i = 0; i < 7; i++) {
      const date = addDays(currentDate, i);
      const dayOfWeek = getDay(date); // 0 (Sun) to 6 (Sat)

      // Find all template shifts for this specific day of week
      // We assume template.shifts store dayOfWeek as 0-6 matching date-fns
      // Validated by previous logic: tShift.dayOfWeek === 0 (Sun)
      const dailyShifts = previewTemplate.shifts.filter(
        (s) => s.dayOfWeek === dayOfWeek
      );

      dailyShifts.forEach((tShift) => {
        const dateStr = format(date, "yyyy-MM-dd");
        const startTimePart = tShift.startTime.includes("T")
          ? tShift.startTime.split("T")[1]
          : "09:00:00";
        const endTimePart = tShift.endTime.includes("T")
          ? tShift.endTime.split("T")[1]
          : "17:00:00";

        generatedShifts.push({
          id: `preview-${tShift.tempId}`,
          employee_id: tShift.employeeId || "unassigned",
          start_time: `${dateStr}T${startTimePart}`,
          end_time: `${dateStr}T${endTimePart}`,
          role: tShift.role,
          is_preview: true,
        });
      });
    }

    return generatedShifts;
  }, [previewTemplateId, previewTemplate, currentDate]);

  const templateConflictSummary = useMemo(() => {
    if (!previewTemplate || !schedule)
      return { shiftsToAdd: 0, conflictsDetected: 0, conflictDetails: [] };

    // We need to pass the full schedule period start/end to the rule function
    // schedule.startDate/endDate are ISO strings
    return detectTemplateConflicts(
      previewTemplate,
      schedule,
      new Date(schedule.startDate),
      new Date(schedule.endDate)
    );
  }, [previewTemplate, schedule]);

  const handleSelectPreview = (templateId: string) => {
    setPreviewTemplateId(templateId);
    setApplyMode("merge"); // Reset mode on new selection
  };

  const handleApplyFromBar = () => {
    if (!previewTemplateId || !schedule) return;

    // If "Merge" is selected and Conflicts exist, ask for resolution
    if (
      applyMode === "merge" &&
      templateConflictSummary.conflictsDetected > 0
    ) {
      setIsConflictModalOpen(true);
      return;
    }

    // Otherwise apply directly (Replace All, Fill Gaps, or Merge with 0 conflicts)
    const template = templates.find((t) => t.id === previewTemplateId);
    if (template) {
      applyTemplate(scheduleId, schedule.type, template, applyMode);
    }
    setPreviewTemplateId(null);
  };

  const handleResolveConflict = (resolution: "keep" | "override") => {
    if (!previewTemplateId || !schedule) return;
    const template = templates.find((t) => t.id === previewTemplateId);
    if (!template) return;

    if (resolution === "keep") {
      // Keep Existing -> Fill Gaps
      applyTemplate(scheduleId, schedule.type, template, "fill-gaps");
    } else {
      // Override -> Merge (which we confirmed overwrites overlaps in store)
      applyTemplate(scheduleId, schedule.type, template, "merge");
    }

    setIsConflictModalOpen(false);
    setPreviewTemplateId(null);
  };

  const handleCancelPreview = () => {
    setPreviewTemplateId(null);
    setIsConflictModalOpen(false);
  };

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
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() =>
              window.open("/dashboard/schedules/templates", "_blank")
            }
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

      {/* Template Preview Logic Integrations */}
      {previewTemplateId && previewTemplate && (
        <ApplyTemplateBar
          templateName={previewTemplate.name}
          shiftsToAdd={previewTemplate.shifts.length} // Rough count, could be refined by rule summary
          conflictsDetected={templateConflictSummary.conflictsDetected}
          applyMode={applyMode}
          onApplyModeChange={setApplyMode}
          onCancel={handleCancelPreview}
          onApply={handleApplyFromBar}
          onViewDetails={() => setIsConflictModalOpen(true)}
        />
      )}

      <ConflictResolutionModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        conflicts={templateConflictSummary.conflictDetails}
        onKeepExisting={() => handleResolveConflict("keep")}
        onOverride={() => handleResolveConflict("override")}
      />

      {/* Main Content Area with Drawer */}
      <div className="flex-1 flex overflow-hidden border rounded-lg bg-background">
        <div className="flex-1 overflow-auto">
          <WeeklyCalendar
            currentDate={currentDate}
            scheduleId={scheduleId}
            minDate={scheduleStart || undefined}
            maxDate={scheduleEnd || undefined}
            previewShifts={previewShifts}
            conflictingPreviewIds={
              new Set(
                templateConflictSummary.conflictDetails.map(
                  (d) => d.templateShift.tempId
                )
              )
            }
          />
        </div>

        {/* Template Drawer Sidebar */}
        <TemplateDrawer onApplyTemplate={handleSelectPreview} />
      </div>

      {/* Template Dialogs (Only used for manual flow, not preview flow) */}
      {/* {selectedTemplate && (
        <ApplyTemplateDialog ... />
      )} */}
    </div>
  );
}
