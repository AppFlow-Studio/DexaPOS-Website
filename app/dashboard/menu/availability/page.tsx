"use client";

import { MenuSchedulesView } from "@/components/scheduling/dashboard/MenuSchedulesView";
import { PageHeader, PageShell } from "@/components/dashboard/shell";

export default function MenuAvailabilityPage() {
  return (
    <PageShell>
      <PageHeader
        title="Menu availability"
        subtitle="Set when menus are available and assign them to schedules."
      />
      <MenuSchedulesView />
    </PageShell>
  );
}
