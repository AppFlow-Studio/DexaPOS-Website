"use client";

import { useScheduleStore } from "@/stores/useScheduleStore";
import { SchedulePeriod, WeeklySchedule } from "@/types/schedule";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { PeriodCard, WeeklyScheduleCard } from "./ScheduleCards";
import { PeriodWizard, QuickScheduleModal } from "./Wizards";
import { useRouter } from "next/navigation";
import { format, addDays } from "date-fns";

export function ScheduleDashboard() {
  const router = useRouter();
  const {
    schedulePeriods,
    weeklySchedules,
    addSchedulePeriod,
    updateSchedulePeriod,
    addWeeklySchedule,
    deleteSchedule,
  } = useScheduleStore();

  const [isWizardOpen, setWizardOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<SchedulePeriod | null>(
    null
  );
  const [isQuickScheduleModalOpen, setIsQuickScheduleModalOpen] =
    useState(false);

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Schedule Manager</h2>
        <div className="flex items-center gap-2">
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
            {schedulePeriods.length === 0 ? (
              <div className="w-full h-24 border border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
                No schedule periods created yet.
              </div>
            ) : (
              schedulePeriods.map((period) => (
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
          {weeklySchedules.length === 0 ? (
            <div className="w-full h-32 border border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
              No weekly schedules created yet.
            </div>
          ) : (
            weeklySchedules.map((schedule) => (
              <WeeklyScheduleCard
                key={schedule.id}
                schedule={schedule}
                onEdit={() => {}} // TODO: Implement edit meta modal
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
    </div>
  );
}
