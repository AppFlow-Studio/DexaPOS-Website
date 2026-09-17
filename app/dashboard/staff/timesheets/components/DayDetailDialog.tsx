"use client";

import { ArrowRight, CircleAlert, Hourglass, Moon, Pencil, TabletSmartphone, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatDuration,
  formatHours,
  formatMoney,
  formatRate,
  formatStampAt,
  formatTimeAt,
} from "@/lib/timesheets/format";
import type { TimesheetEmployee, TimesheetShift } from "@/lib/timesheets/types";

function Pill({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium [&_svg]:h-3 [&_svg]:w-3"
    >
      {children}
    </span>
  );
}

function InsetFigure({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="min-w-0 rounded-2xl border-0 bg-muted/60 px-4 py-4">
      <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-medium leading-tight tracking-[-0.02em] tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground tabular-nums">{meta}</p>
    </div>
  );
}

function ShiftCard({ shift, timeZone }: { shift: TimesheetShift; timeZone: string }) {
  return (
    <div className="space-y-4 rounded-2xl border-0 bg-muted/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Clock in</dt>
            <dd className="text-sm font-medium tabular-nums">{formatStampAt(shift.clockIn, timeZone)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Clock out</dt>
            <dd className="text-sm font-medium tabular-nums">
              {shift.clockOut ? (
                formatStampAt(shift.clockOut, timeZone)
              ) : (
                <span className="text-muted-foreground">Not recorded</span>
              )}
            </dd>
          </div>
        </dl>
        <p className="shrink-0 text-sm font-semibold tabular-nums">
          {shift.isOpen ? <span className="text-muted-foreground">—</span> : `${formatHours(shift.netMinutes)} hrs`}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {shift.isMissingOut && (
          <Pill>
            <CircleAlert />
            Missing clock-out
          </Pill>
        )}
        {shift.isOnClock && (
          <Pill>
            <Timer />
            On the clock now
          </Pill>
        )}
        {shift.isOvernight && (
          <Pill>
            <Moon />
            Ends the next day
          </Pill>
        )}
        {shift.isOverMax && (
          <Pill>
            <Hourglass />
            Over 16 hours
          </Pill>
        )}
        {shift.fromPos && (
          <Pill>
            <TabletSmartphone />
            Clocked on POS
          </Pill>
        )}
        {shift.isEdited && (
          <Pill title={shift.notes ?? undefined}>
            <Pencil />
            Edited by manager
          </Pill>
        )}
        {shift.isAutoClosed && <Pill title={shift.notes ?? undefined}>Closed automatically</Pill>}
      </div>

      {shift.otMinutes > 0 && (
        <p className="text-sm text-muted-foreground tabular-nums">
          Includes {formatHours(shift.otMinutes)} overtime hours
        </p>
      )}

      {shift.breaks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Breaks</p>
          {shift.breaks.map((b, index) => (
            <div key={`${b.start}-${index}`} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 tabular-nums">
                {b.type === "paid" ? "Paid" : "Unpaid"} · {formatTimeAt(b.start, timeZone)}
                {b.end ? ` – ${formatTimeAt(b.end, timeZone)}` : " – still on break"}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{formatDuration(b.minutes)}</span>
            </div>
          ))}
        </div>
      )}

      {shift.isEdited && shift.notes?.trim() && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Reason: </span>
          {shift.notes}
        </p>
      )}
    </div>
  );
}

/**
 * The shifts behind one grid cell. A centred dialog (D-13), full screen on a
 * phone, and read-only by design — corrections live in the Shifts view.
 */
export function DayDetailDialog({
  open,
  onOpenChange,
  employee,
  heading,
  shifts,
  timeZone,
  continueLabel,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: TimesheetEmployee | null;
  /** "Tuesday, Sep 8, 2026". */
  heading: string;
  shifts: TimesheetShift[];
  timeZone: string;
  /** "All of Jordan's shifts this week". */
  continueLabel: string;
  onContinue: () => void;
}) {
  const worked = shifts.reduce((n, s) => n + s.netMinutes, 0);
  const unpaid = shifts.reduce((n, s) => n + s.unpaidBreakMinutes, 0);
  const priced = shifts.filter((s) => s.payCents !== null);
  const payCents = priced.reduce((n, s) => n + (s.payCents as number), 0);
  const rates = Array.from(new Set(priced.map((s) => s.rate)));
  const closed = shifts.filter((s) => !s.isOpen).length;
  const missing = shifts.filter((s) => s.isMissingOut).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 max-sm:overflow-hidden sm:max-h-[85vh] sm:max-w-xl">
        <DialogHeader className="shrink-0 px-6 pt-6 pr-14 text-left">
          <DialogTitle className="text-lg">{employee?.displayName ?? "Shift details"}</DialogTitle>
          <DialogDescription>
            {heading}
            {employee?.roleName ? ` · ${employee.roleName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pt-5 pb-2">
          {missing > 0 && (
            <div className="flex gap-3 rounded-2xl border-0 bg-muted/60 p-4">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {missing === 1 ? "This shift has no clock-out" : `${missing} shifts have no clock-out`}
                </p>
                <p className="text-sm text-pretty text-muted-foreground">
                  Hours without a clock-out aren&rsquo;t counted in any total until one is added. A manager can
                  add it from the shift list.
                </p>
              </div>
            </div>
          )}

          {closed > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <InsetFigure
                label="Worked"
                value={`${formatHours(worked)} hrs`}
                meta={`${closed} shift${closed === 1 ? "" : "s"}`}
              />
              <InsetFigure label="Unpaid breaks" value={formatDuration(unpaid)} meta="Taken off the hours" />
              <InsetFigure
                label="Est. pay"
                value={priced.length ? formatMoney(payCents) : "—"}
                meta={
                  priced.length === 0
                    ? "No pay rate"
                    : rates.length === 1
                      ? `${formatRate(rates[0])} an hour`
                      : "Several rates"
                }
              />
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Shifts</p>
            {shifts.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} timeZone={timeZone} />
            ))}
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 px-6 pt-4 pb-6 sm:justify-between">
          <Button
            variant="ghost"
            className="h-9 min-w-0 rounded-full px-3 text-[0.8125rem] font-medium text-muted-foreground"
            onClick={onContinue}
          >
            <span className="truncate">{continueLabel}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Button>
          <Button
            variant="outline"
            className="h-9 shrink-0 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
