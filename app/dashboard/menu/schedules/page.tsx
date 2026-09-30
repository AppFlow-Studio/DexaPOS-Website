"use client";

import { PageShell } from "@/components/dashboard/shell";
import { MenuSchedulesView } from "@/components/scheduling/dashboard/MenuSchedulesView";

export default function MenuSchedulesPage() {
  return (
    <PageShell>
      <MenuSchedulesView />
    </PageShell>
  );
}
