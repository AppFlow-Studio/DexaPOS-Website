"use client";

import { Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelSection } from "@/components/dashboard/shell";
import { ShiftCard } from "./ShiftCard";
import type { TodayShift } from "@/app/dashboard/actions/tips";

interface ActiveShiftsPanelProps {
  shifts: TodayShift[];
  isLoading: boolean;
}

export function ActiveShiftsPanel({ shifts, isLoading }: ActiveShiftsPanelProps) {
  const working = shifts.filter((s) => !s.clockOutTime).length;

  return (
    <Panel>
      <PanelSection
        icon={Users}
        label="Staff Shifts"
        caption={
          isLoading
            ? undefined
            : shifts.length === 0
            ? undefined
            : `${shifts.length} shift${shifts.length !== 1 ? "s" : ""} today · ${working} still working`
        }
      >
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-2xl" />
            ))}
          </div>
        ) : shifts.length === 0 ? (
          <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="font-medium text-foreground">No shifts recorded today yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Staff will appear here when they clock in.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shifts.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} />
            ))}
          </div>
        )}
      </PanelSection>
    </Panel>
  );
}
