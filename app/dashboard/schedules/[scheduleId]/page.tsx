"use client";
import { use } from "react";
import { ScheduleManager } from "@/components/scheduling/ScheduleManager";
import { PageHeader, PageShell } from "@/components/dashboard/shell";

export default function SchedulingPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = use(params);

  return (
    <PageShell>
      <PageHeader
        title="Schedule Editor"
        subtitle="Assign shifts and review weekly coverage. Schedules are saved only in this browser."
        backHref="/dashboard/schedules"
        backLabel="Back to schedules"
      />

      <ScheduleManager scheduleId={scheduleId} />
    </PageShell>
  );
}
