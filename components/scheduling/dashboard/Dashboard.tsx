"use client";

import { useScheduleStore } from "@/stores/useScheduleStore";
import { SchedulePeriod, WeeklySchedule } from "@/types/schedule";
import { useState, useMemo, useCallback } from "react";
import { CalendarPlus, CalendarRange, LayoutTemplate } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { PeriodCard, WeeklyScheduleCard } from "./ScheduleCards";
import { PeriodWizard, QuickScheduleModal } from "./Wizards";
import { EditWeeklyScheduleModal } from "../EditWeeklyScheduleModal";
import { useRouter } from "next/navigation";
import { addDays, differenceInDays, format, parseISO } from "date-fns";
import { Panel } from "@/components/dashboard/shell";

export function ScheduleDashboard() {
  const router = useRouter();
  const { user } = useUser();
  const {
    schedulePeriods,
    weeklySchedules,
    addSchedulePeriod,
    updateSchedulePeriod,
    updateWeeklySchedule,
    addWeeklySchedule,
    deleteSchedule,
    compareSchedules,
  } = useScheduleStore();

  const [isWizardOpen, setWizardOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<SchedulePeriod | null>(
    null
  );
  const [isQuickScheduleModalOpen, setIsQuickScheduleModalOpen] =
    useState(false);
  const [editingWeekly, setEditingWeekly] = useState<WeeklySchedule | null>(
    null
  );

  const handleWizardComplete = (data: any) => {
    if (editingPeriod) {
      updateSchedulePeriod(editingPeriod.id, data);
    } else {
      addSchedulePeriod(data);
    }
    setWizardOpen(false);
    setEditingPeriod(null);
  };

  const handleCreateWeekly = (startDate: string, numberOfWeeks: number = 1) => {
    const totalDays = numberOfWeeks * 7 - 1;
    const parsedStartDate = parseISO(startDate);
    const endDate = format(addDays(parsedStartDate, totalDays), "yyyy-MM-dd");
    const name = numberOfWeeks === 1
      ? `Week of ${format(parsedStartDate, "MMM dd")} - ${format(parseISO(endDate), "MMM dd, yyyy")}`
      : `${format(parsedStartDate, "MMM dd")} - ${format(parseISO(endDate), "MMM dd, yyyy")} (${numberOfWeeks} weeks)`;

    const createdBy = user?.fullName || user?.firstName || "Manager";

    const newId = addWeeklySchedule({
      name,
      startDate,
      endDate,
      shifts: [],
      status: "draft",
      type: "weekly",
      createdBy,
    });

    setIsQuickScheduleModalOpen(false);
    router.push(`/dashboard/schedules/${newId}`);
  };

  const handleSaveWeeklyEdit = (startDate: string, numberOfWeeks?: number) => {
    if (!editingWeekly) return;
    // Preserve original duration if numberOfWeeks not explicitly changed
    const weeks = numberOfWeeks ?? Math.max(1, Math.round(
      (differenceInDays(parseISO(editingWeekly.endDate), parseISO(editingWeekly.startDate)) + 1) / 7
    ));
    const totalDays = weeks * 7 - 1;
    const parsedStartDate = parseISO(startDate);
    const endDate = format(addDays(parsedStartDate, totalDays), "yyyy-MM-dd");
    const name = weeks === 1
      ? `Week of ${format(parsedStartDate, "MMM dd")} - ${format(parseISO(endDate), "MMM dd, yyyy")}`
      : `${format(parsedStartDate, "MMM dd")} - ${format(parseISO(endDate), "MMM dd, yyyy")} (${weeks} weeks)`;
    updateWeeklySchedule(editingWeekly.id, { name, startDate, endDate });
    setEditingWeekly(null);
  };

  // Helper to check if a draft has actual changes — stable ref via useCallback
  const draftHasChanges = useCallback((schedule: WeeklySchedule | SchedulePeriod) => {
    if (schedule.status !== "draft-edit" || !schedule.originalScheduleId) {
      return true; // Not a draft-edit, keep it
    }
    const changes = compareSchedules(schedule.originalScheduleId, schedule.id);
    return changes.added > 0 || changes.updated > 0 || changes.removed > 0;
  }, [compareSchedules]);

  // Filter out published schedules that have an active draft-edit WITH changes
  // Also filter out unchanged drafts (show original instead)
  const filteredWeeklySchedules = useMemo(() => {
    const schedulesWithChangedDrafts = new Set(
      weeklySchedules
        .filter(
          (s) =>
            s.status === "draft-edit" &&
            s.originalScheduleId &&
            draftHasChanges(s)
        )
        .map((s) => s.originalScheduleId)
    );

    return weeklySchedules.filter((s) => {
      if (schedulesWithChangedDrafts.has(s.id)) return false;
      if (s.status === "draft-edit" && !draftHasChanges(s)) return false;
      return true;
    });
  }, [weeklySchedules, draftHasChanges]);

  const filteredSchedulePeriods = useMemo(() => {
    const schedulesWithChangedDrafts = new Set(
      schedulePeriods
        .filter(
          (s) =>
            s.status === "draft-edit" &&
            s.originalScheduleId &&
            draftHasChanges(s)
        )
        .map((s) => s.originalScheduleId)
    );

    return schedulePeriods.filter((s) => {
      if (schedulesWithChangedDrafts.has(s.id)) return false;
      if (s.status === "draft-edit" && !draftHasChanges(s)) return false;
      return true;
    });
  }, [schedulePeriods, draftHasChanges]);

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-primary">
            Schedule workspace
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a week quickly or organize longer scheduling periods.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => router.push("/dashboard/schedules/templates")}
            variant="ghost"
            className="gap-2"
          >
            <LayoutTemplate className="h-4 w-4" />
            Templates
          </Button>
          <Button
            onClick={() => setIsQuickScheduleModalOpen(true)}
            className="gap-2"
          >
            <CalendarPlus className="h-4 w-4" />
            New Schedule
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setEditingPeriod(null);
              setWizardOpen(true);
            }}
            className="gap-2"
          >
            <CalendarRange className="h-4 w-4" />
            New Period
          </Button>
        </div>
      </div>

      <section className="border-t border-border/60 px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="font-semibold">Schedule periods</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Longer ranges for seasons, events, or rotating coverage.
            </p>
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">
            {filteredSchedulePeriods.length} total
          </span>
        </div>
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-3 pb-3">
            {filteredSchedulePeriods.length === 0 ? (
              <div className="flex min-h-24 w-full items-center justify-center rounded-2xl bg-muted/35 px-5 text-sm text-muted-foreground">
                No schedule periods yet. Create one when you need a range longer than a week.
              </div>
            ) : (
              filteredSchedulePeriods.map((period) => (
                <PeriodCard
                  key={period.id}
                  period={period}
                  onEdit={() => {
                    setEditingPeriod(period);
                    setWizardOpen(true);
                  }}
                  onDelete={() => deleteSchedule(period.id, "period")}
                />
              ))
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </section>

      <section className="border-t border-border/60 px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="font-semibold">Weekly schedules</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Open a week to assign staff, resolve coverage, and publish shifts.
            </p>
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">
            {filteredWeeklySchedules.length} total
          </span>
        </div>
        <div className="grid gap-2">
          {filteredWeeklySchedules.length === 0 ? (
            <div className="flex min-h-28 w-full items-center justify-center rounded-2xl bg-muted/35 px-5 text-center text-sm text-muted-foreground">
              No weekly schedules yet. Create your first schedule to start assigning shifts.
            </div>
          ) : (
            filteredWeeklySchedules.map((schedule) => (
              <WeeklyScheduleCard
                key={schedule.id}
                schedule={schedule}
                onEdit={() => setEditingWeekly(schedule)}
                onDelete={() => deleteSchedule(schedule.id, "weekly")}
              />
            ))
          )}
        </div>
      </section>

      <PeriodWizard
        isOpen={isWizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={handleWizardComplete}
        periodToEdit={editingPeriod}
      />

      <QuickScheduleModal
        isOpen={isQuickScheduleModalOpen}
        onClose={() => setIsQuickScheduleModalOpen(false)}
        onCreate={handleCreateWeekly}
      />

      <EditWeeklyScheduleModal
        open={editingWeekly !== null}
        onOpenChange={(open) => !open && setEditingWeekly(null)}
        onSave={handleSaveWeeklyEdit}
        initialDate={editingWeekly?.startDate}
        initialEndDate={editingWeekly?.endDate}
        scheduleName={editingWeekly?.name}
      />
    </Panel>
  );
}
