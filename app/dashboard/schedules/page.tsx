"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScheduleDashboard } from "@/components/scheduling/dashboard/Dashboard";
import { MenuSchedulesView } from "@/components/scheduling/dashboard/MenuSchedulesView";
import { ScheduleReports } from "@/components/scheduling/reports/ScheduleReports";
import { PageHeader, PageShell } from "@/components/dashboard/shell";
import { BarChart3, CalendarDays, UtensilsCrossed } from "lucide-react";

const SCHEDULE_TABS = [
  { value: "staff", label: "Staff shifts", icon: CalendarDays },
  { value: "reports", label: "Reports", icon: BarChart3 },
  { value: "menu", label: "Menu availability", icon: UtensilsCrossed },
] as const;

export default function SchedulesPage() {
  return (
    <PageShell>
      <PageHeader
        title="Staff Scheduling"
        subtitle="Build team schedules, review labor coverage, and manage menu availability."
      />

      <Tabs defaultValue="staff" className="min-w-0">
        <div className="w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-1 rounded-full bg-muted/70 p-1">
            {SCHEDULE_TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="shrink-0 gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
              >
                <Icon className="size-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="staff" className="mt-5">
          <ScheduleDashboard />
        </TabsContent>

        <TabsContent value="reports" className="mt-5">
          <ScheduleReports />
        </TabsContent>

        <TabsContent value="menu" className="mt-5">
          <MenuSchedulesView />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
