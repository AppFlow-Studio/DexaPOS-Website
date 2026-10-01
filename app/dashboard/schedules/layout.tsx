"use client";

import { CalendarDays } from "lucide-react";
import { PageHeader, PageShell } from "@/components/dashboard/shell";
import { Empty } from "@/components/ui/empty";

/**
 * Staff scheduling is not released yet — its schedules have no backend and
 * live only in the browser. This layout stands in for every
 * /dashboard/schedules/* route until it ships; delete it to turn them back on.
 * Menu schedules live under Menus and are unaffected.
 */
export default function SchedulesLayout(_props: { children: React.ReactNode }) {
  return (
    <PageShell>
      <PageHeader
        title="Staff Scheduling"
        subtitle="Build team schedules and review labor coverage."
      />
      <Empty
        icon={CalendarDays}
        title="Coming soon"
        description="Staff scheduling is on its way. We'll let you know when it's ready."
      />
    </PageShell>
  );
}
