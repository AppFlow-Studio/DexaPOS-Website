"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScheduleDashboard } from "@/components/scheduling/dashboard/Dashboard";
import { MenuSchedulesView } from "@/components/scheduling/dashboard/MenuSchedulesView";

export default function SchedulesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Schedules</h2>
      </div>

      <Tabs defaultValue="staff" className="space-y-4">
        <TabsList>
          <TabsTrigger value="staff">Staff Shifts</TabsTrigger>
          <TabsTrigger value="menu">Menu Availability</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="space-y-4">
          <ScheduleDashboard />
        </TabsContent>

        <TabsContent value="menu" className="space-y-4">
          <MenuSchedulesView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
