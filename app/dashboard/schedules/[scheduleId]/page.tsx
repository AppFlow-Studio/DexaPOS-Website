"use client";
import { use } from "react";
import { useRouter } from "next/navigation";
import { ScheduleManager } from "@/components/scheduling/ScheduleManager";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

export default function SchedulingPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = use(params);
  const router = useRouter();

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Staff Scheduling
          </h1>
          <p className="text-muted-foreground">
            Manage shifts, assignments, and weekly schedules for your team.
          </p>
        </div>
      </div>

      <ScheduleManager scheduleId={scheduleId} />
    </main>
  );
}
