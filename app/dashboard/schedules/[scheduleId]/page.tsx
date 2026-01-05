"use client";
import { use } from "react";
import { ScheduleManager } from "@/components/scheduling/ScheduleManager";

export default function SchedulingPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = use(params);

  return (
    <main className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Staff Scheduling</h1>
        <p className="text-muted-foreground">
          Manage shifts, assignments, and weekly schedules for your team.
        </p>
      </div>

      <ScheduleManager scheduleId={scheduleId} />
    </main>
  );
}
