"use client";

import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShiftCard } from "./ShiftCard";
import type { TodayShift } from "@/app/dashboard/actions/tips";

interface ActiveShiftsPanelProps {
  shifts: TodayShift[];
  isLoading: boolean;
}

export function ActiveShiftsPanel({ shifts, isLoading }: ActiveShiftsPanelProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Staff Shifts
        </h3>
        {!isLoading && shifts.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {shifts.length}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      ) : shifts.length === 0 ? (
        <div className="border rounded-lg p-8 text-center">
          <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No shifts recorded for today yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Staff will appear here when they clock in
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shifts.map((shift) => (
            <ShiftCard key={shift.id} shift={shift} />
          ))}
        </div>
      )}
    </section>
  );
}
