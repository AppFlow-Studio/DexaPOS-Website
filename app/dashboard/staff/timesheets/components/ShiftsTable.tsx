"use client";

import type { ReactNode } from "react";
import { Eye, Moon, MoreHorizontal, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDuration, formatHours, formatMoney, formatStampAt } from "@/lib/timesheets/format";
import type { TimesheetEmployee, TimesheetShift } from "@/lib/timesheets/types";

/** One neutral pill for every state (D-12) — the word carries the meaning. */
function statusLabel(shift: TimesheetShift): string {
  if (shift.isMissingOut) return "Missing clock-out";
  if (shift.status === "on_break") return "On break";
  if (shift.isOpen) return "On the clock";
  return "Completed";
}

function StatusPills({ shift }: { shift: TimesheetShift }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex shrink-0 items-center rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium">
        {statusLabel(shift)}
      </span>
      {shift.isEdited && (
        <span
          title={shift.notes ?? "Edited by a manager"}
          className="inline-flex shrink-0 items-center rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium"
        >
          Edited
        </span>
      )}
      {shift.isAutoClosed && (
        <span
          title={shift.notes ?? undefined}
          className="inline-flex shrink-0 items-center rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium"
        >
          Auto-closed
        </span>
      )}
    </div>
  );
}

function RowMenu({
  shift,
  name,
  onAdjust,
  onView,
}: {
  shift: TimesheetShift;
  name: string;
  onAdjust: (shift: TimesheetShift) => void;
  onView: (shift: TimesheetShift) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 rounded-full p-0" aria-label={`Actions for ${name}'s shift`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onView(shift)}>
          <Eye className="mr-2 h-4 w-4" />
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdjust(shift)}>
          <Pencil className="mr-2 h-4 w-4" />
          Adjust shift
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function breakText(shift: TimesheetShift) {
  const total = shift.unpaidBreakMinutes + shift.paidBreakMinutes;
  return total > 0 ? formatDuration(total) : "—";
}

export function ShiftsTable({
  shifts,
  people,
  timeZone,
  isLoading,
  isStale,
  onAdjust,
  onView,
  empty,
}: {
  shifts: TimesheetShift[];
  people: Map<string, TimesheetEmployee>;
  timeZone: string;
  isLoading: boolean;
  isStale: boolean;
  onAdjust: (shift: TimesheetShift) => void;
  onView: (shift: TimesheetShift) => void;
  empty: ReactNode;
}) {
  const showSkeleton = isLoading && shifts.length === 0;
  const nameOf = (shift: TimesheetShift) => people.get(shift.staffProfileId)?.displayName ?? "Unknown";

  return (
    <div className={cn("min-w-0 transition-opacity", isStale && "opacity-60")} aria-busy={isLoading || isStale}>
      <Table variant="data" containerClassName="hidden xl:block" className="min-w-[960px]">
        <TableHeader className="[&_tr]:border-0">
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className="pl-4">Team member</TableHead>
            <TableHead>Clock in</TableHead>
            <TableHead>Clock out</TableHead>
            <TableHead className="text-right">Breaks</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead className="text-right">Est. pay</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {showSkeleton ? (
            Array.from({ length: 8 }).map((_, index) => (
              <TableRow key={`loading-${index}`} className="border-0">
                {Array.from({ length: 8 }).map((__, i) => (
                  <TableCell key={i}>
                    <div className="h-4 w-full max-w-28 animate-pulse rounded-full bg-muted/70 motion-reduce:animate-none" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : shifts.length === 0 ? (
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell colSpan={8} className="h-24 text-center">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            shifts.map((shift) => (
              <TableRow key={shift.id} className="border-0">
                <TableCell className="pl-4 font-medium">{nameOf(shift)}</TableCell>
                <TableCell className="tabular-nums">{formatStampAt(shift.clockIn, timeZone)}</TableCell>
                <TableCell className="tabular-nums">
                  {shift.clockOut ? (
                    <span className="inline-flex items-center gap-1.5">
                      {shift.isOvernight && (
                        <Moon className="h-3.5 w-3.5 text-muted-foreground" aria-label="Ends the next day" />
                      )}
                      {formatStampAt(shift.clockOut, timeZone)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not recorded</span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    breakText(shift) === "—" && "text-muted-foreground",
                  )}
                >
                  {breakText(shift)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {shift.isOpen ? <span className="text-muted-foreground">—</span> : formatHours(shift.netMinutes)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {shift.payCents === null ? (
                    <span className="text-muted-foreground" title="No pay rate">
                      —
                    </span>
                  ) : (
                    formatMoney(shift.payCents)
                  )}
                </TableCell>
                <TableCell>
                  <StatusPills shift={shift} />
                </TableCell>
                <TableCell className="text-right">
                  <RowMenu shift={shift} name={nameOf(shift)} onAdjust={onAdjust} onView={onView} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        {showSkeleton ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-2xl border-0 bg-muted/45 p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48 max-w-full" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
          ))
        ) : shifts.length === 0 ? (
          <div className="col-span-full flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 px-4 py-6 text-center">
            {empty}
          </div>
        ) : (
          shifts.map((shift) => (
            <article key={shift.id} className="min-w-0 space-y-3 rounded-2xl border-0 bg-muted/45 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{nameOf(shift)}</p>
                  <div className="mt-1">
                    <StatusPills shift={shift} />
                  </div>
                </div>
                <RowMenu shift={shift} name={nameOf(shift)} onAdjust={onAdjust} onView={onView} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Clock in → out</dt>
                  <dd className="font-medium tabular-nums">
                    {formatStampAt(shift.clockIn, timeZone)} →{" "}
                    {shift.clockOut ? formatStampAt(shift.clockOut, timeZone) : "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Hours</dt>
                  <dd className="font-medium tabular-nums">{shift.isOpen ? "—" : formatHours(shift.netMinutes)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Est. pay</dt>
                  <dd className="font-medium tabular-nums">
                    {shift.payCents === null ? "No pay rate" : formatMoney(shift.payCents)}
                  </dd>
                </div>
              </dl>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
