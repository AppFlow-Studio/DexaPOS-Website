"use client";

import { useScheduleStore } from "@/stores/useScheduleStore";
import { SchedulePeriod, WeeklySchedule } from "@/types/schedule";
import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { PeriodCard, WeeklyScheduleCard } from "./ScheduleCards";
import { PeriodWizard, QuickScheduleModal } from "./Wizards";
import { EditWeeklyScheduleModal } from "../EditWeeklyScheduleModal";
import { useRouter } from "next/navigation";
import { format, addDays } from "date-fns";

export function ScheduleDashboard() {
  const router = useRouter();
  const {
    schedulePeriods,
    weeklySchedules,
    addSchedulePeriod,
    updateSchedulePeriod,
    updateWeeklySchedule,
    addWeeklySchedule,
    deleteSchedule,
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

  const handleCreateWeekly = (startDate: string) => {
    const endDate = format(addDays(new Date(startDate), 6), "yyyy-MM-dd");
    const name = `Week of ${format(new Date(startDate), "MMM dd")} - ${format(
      new Date(endDate),
      "MMM dd, yyyy"
    )}`;

    const newId = addWeeklySchedule({
      name,
      startDate,
      endDate,
      shifts: [],
      status: "draft",
      type: "weekly",
      createdBy: "Manager", // Placeholder
    });

    setIsQuickScheduleModalOpen(false);
    router.push(`/dashboard/schedules/${newId}`);
  };

  const handleSaveWeeklyEdit = (startDate: string) => {
    if (!editingWeekly) return;
    const endDate = format(addDays(new Date(startDate), 6), "yyyy-MM-dd");
    const name = `Week of ${format(new Date(startDate), "MMM dd")} - ${format(
      new Date(endDate),
      "MMM dd, yyyy"
    )}`;
    updateWeeklySchedule(editingWeekly.id, { name, startDate, endDate });
    setEditingWeekly(null);
  };

  const { compareSchedules, deleteSchedule: deleteScheduleFn } =
    useScheduleStore();

  // Helper to check if a draft has actual changes
  const draftHasChanges = (schedule: WeeklySchedule | SchedulePeriod) => {
    if (schedule.status !== "draft-edit" || !schedule.originalScheduleId) {
      return true; // Not a draft-edit, keep it
    }
    const changes = compareSchedules(schedule.originalScheduleId, schedule.id);
    return changes.added > 0 || changes.updated > 0 || changes.removed > 0;
  };

  // Filter out published schedules that have an active draft-edit WITH changes
  // Also filter out unchanged drafts (show original instead)
  const filteredWeeklySchedules = useMemo(() => {
    // Get IDs of schedules that have active draft-edits WITH changes
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

    // Filter out:
    // 1. Originals that have drafts with changes (show draft instead)
    // 2. Unchanged drafts (show original instead)
    return weeklySchedules.filter((s) => {
      // Hide originals that have changed drafts
      if (schedulesWithChangedDrafts.has(s.id)) return false;
      // Hide unchanged drafts
      if (s.status === "draft-edit" && !draftHasChanges(s)) return false;
      return true;
    });
  }, [weeklySchedules]);

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
  }, [schedulePeriods]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Schedule Manager</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/schedules/templates")}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />{" "}
            {/* Using Plus generically or could use LayoutTemplate */}
            Templates
          </Button>
          <Button
            onClick={() => setIsQuickScheduleModalOpen(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New Week
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setEditingPeriod(null);
              setWizardOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New Period
          </Button>
        </div>
      </div>

      {/* Periods Section */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Schedule Periods</h3>
        <ScrollArea className="w-full whitespace-nowrap pb-4">
          <div className="flex gap-4">
            {filteredSchedulePeriods.length === 0 ? (
              <div className="w-full h-24 border border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
                No schedule periods created yet.
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
      </div>

      {/* Weekly Schedules Section */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Weekly Schedules</h3>
        <div className="grid gap-4">
          {filteredWeeklySchedules.length === 0 ? (
            <div className="w-full h-32 border border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
              No weekly schedules created yet.
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
      </div>

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
        scheduleName={editingWeekly?.name}
      />
    </div>
  );
}
