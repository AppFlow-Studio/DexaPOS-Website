"use client";

import { useEffect, useMemo, useState } from "react";
import { differenceInMinutes } from "date-fns";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DateTimePopover } from "@/components/dashboard/menu/DateTimePopover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ShiftBreakLog, StaffShift } from "@/types/staff";
import { useAdjustShiftTimes } from "@/hooks/useTimesheets";

type BreakDraft = {
  id: string;
  type: "paid" | "unpaid";
  startAt: string;
  endAt: string;
};

function toLocalDateTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value: string) {
  return new Date(value).toISOString();
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `break-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getBreakDurationMinutes(row: BreakDraft) {
  if (!row.startAt || !row.endAt) return 0;
  const minutes = differenceInMinutes(new Date(row.endAt), new Date(row.startAt));
  return minutes > 0 ? minutes : 0;
}

function addMinutesToLocalInput(value: string, minutes: number) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  date.setMinutes(date.getMinutes() + minutes);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function buildBreakDrafts(breakLogs: ShiftBreakLog[] | null | undefined): BreakDraft[] {
  return (breakLogs ?? []).map((breakLog) => ({
    id: breakLog.id || makeId(),
    type: breakLog.type,
    startAt: toLocalDateTimeInput(breakLog.start_at),
    endAt: toLocalDateTimeInput(breakLog.end_at ?? null),
  }));
}

interface ShiftAdjustmentDialogProps {
  clerkOrgId: string;
  shift: StaffShift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShiftAdjustmentDialog({
  clerkOrgId,
  shift,
  open,
  onOpenChange,
}: ShiftAdjustmentDialogProps) {
  const adjustShift = useAdjustShiftTimes();
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [breakRows, setBreakRows] = useState<BreakDraft[]>([]);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!shift || !open) return;

    setClockIn(toLocalDateTimeInput(shift.clock_in_time));
    setClockOut(toLocalDateTimeInput(shift.clock_out_time));
    setBreakRows(buildBreakDrafts(shift.break_logs));
    setReason(shift.notes ?? "");
  }, [shift, open]);

  const staffName = shift?.staff_profile
    ? `${shift.staff_profile.first_name} ${shift.staff_profile.last_name}`
    : "Unknown Staff";

  const preview = useMemo(() => {
    if (!clockIn || !clockOut) {
      return {
        totalMinutes: null,
        unpaidBreakMinutes: 0,
        netMinutes: null,
        estimatedPay: null,
      };
    }

    const totalMinutes = differenceInMinutes(new Date(clockOut), new Date(clockIn));
    const unpaidBreakMinutes = breakRows
      .filter((row) => row.type === "unpaid")
      .reduce((sum, row) => sum + getBreakDurationMinutes(row), 0);
    const netMinutes = Math.max(totalMinutes - unpaidBreakMinutes, 0);
    const estimatedPay =
      shift?.hourly_rate_snapshot != null
        ? (netMinutes / 60) * shift.hourly_rate_snapshot
        : null;

    return {
      totalMinutes,
      unpaidBreakMinutes,
      netMinutes,
      estimatedPay,
    };
  }, [breakRows, clockIn, clockOut, shift?.hourly_rate_snapshot]);

  const updateBreak = (id: string, patch: Partial<BreakDraft>) => {
    setBreakRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const addBreak = () => {
    setBreakRows((rows) => [
      ...rows,
      {
        id: makeId(),
        type: "unpaid",
        startAt: clockIn,
        endAt: addMinutesToLocalInput(clockIn, 30),
      },
    ]);
  };

  const removeBreak = (id: string) => {
    setBreakRows((rows) => rows.filter((row) => row.id !== id));
  };

  const buildBreakLogs = (): ShiftBreakLog[] => {
    return breakRows.map((row) => {
      const duration = getBreakDurationMinutes(row);
      return {
        id: row.id,
        type: row.type,
        start_at: fromLocalDateTimeInput(row.startAt),
        end_at: fromLocalDateTimeInput(row.endAt),
        duration_minutes: duration,
      };
    });
  };

  const handleSubmit = async () => {
    if (!shift) return;

    if (!clockIn) {
      toast.error("Clock-in time is required");
      return;
    }

    if (!reason.trim()) {
      toast.error("A correction reason is required");
      return;
    }

    if (clockOut && new Date(clockOut) <= new Date(clockIn)) {
      toast.error("Clock-out must be after clock-in");
      return;
    }

    for (const row of breakRows) {
      if (!row.startAt || !row.endAt) {
        toast.error("Each break needs a start and end time");
        return;
      }

      if (new Date(row.endAt) <= new Date(row.startAt)) {
        toast.error("Break end must be after break start");
        return;
      }
    }

    const result = await adjustShift.mutateAsync({
      clerkOrgId,
      shiftId: shift.id,
      clockInTime: fromLocalDateTimeInput(clockIn),
      clockOutTime: clockOut ? fromLocalDateTimeInput(clockOut) : null,
      breakLogs: buildBreakLogs(),
      reason: reason.trim(),
    });

    if (result.success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh min-h-0 w-full max-w-none flex-col overflow-hidden border-0 bg-white max-sm:rounded-none sm:h-auto sm:max-h-[90vh] sm:max-w-3xl">
        <DialogHeader className="shrink-0 text-left">
          <DialogTitle>Adjust shift</DialogTitle>
          <DialogDescription>
            Correct clock times and breaks for {staffName}. Saved corrections are marked verified and audited.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 overflow-x-hidden overflow-y-auto overscroll-contain pr-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="shift-clock-in">Clock in</Label>
              <DateTimePopover
                id="shift-clock-in"
                value={clockIn}
                onChange={setClockIn}
                placeholder="Select clock-in time"
                className="h-10 rounded-xl border-0 bg-muted/40 shadow-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-clock-out">Clock out</Label>
              <DateTimePopover
                id="shift-clock-out"
                value={clockOut}
                onChange={setClockOut}
                min={clockIn}
                placeholder="Leave empty for active shift"
                className="h-10 rounded-xl border-0 bg-muted/40 shadow-none"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty only if the shift should remain active.
              </p>
            </div>
          </div>

          <div className="rounded-xl border-0 bg-muted/40 p-4">
            <div className="grid min-w-0 gap-3 sm:flex sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Breaks</h3>
                <p className="text-xs text-muted-foreground">
                  Unpaid breaks reduce total hours. Paid breaks stay visible but do not reduce pay.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={addBreak}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add break
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {breakRows.length === 0 ? (
                <p className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
                  No breaks recorded.
                </p>
              ) : (
                breakRows.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid min-w-0 gap-3 rounded-xl border-0 bg-white p-3 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={row.type}
                        onValueChange={(value) =>
                          updateBreak(row.id, { type: value as BreakDraft["type"] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unpaid">Unpaid</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`break-${index}-start`}>Start</Label>
                      <DateTimePopover
                        id={`break-${index}-start`}
                        value={row.startAt}
                        onChange={(value) =>
                          updateBreak(row.id, { startAt: value })
                        }
                        min={clockIn}
                        placeholder="Select start time"
                        className="h-10 rounded-xl border-0 bg-muted/40 shadow-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`break-${index}-end`}>End</Label>
                      <DateTimePopover
                        id={`break-${index}-end`}
                        value={row.endAt}
                        onChange={(value) =>
                          updateBreak(row.id, { endAt: value })
                        }
                        min={row.startAt}
                        placeholder="Select end time"
                        className="h-10 rounded-xl border-0 bg-muted/40 shadow-none"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBreak(row.id)}
                        aria-label="Remove break"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Gross
              </p>
              <p className="text-sm font-semibold">
                {preview.totalMinutes === null
                  ? "Active"
                  : `${(preview.totalMinutes / 60).toFixed(2)}h`}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Unpaid break
              </p>
              <p className="text-sm font-semibold">
                {preview.unpaidBreakMinutes}m
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Net
              </p>
              <p className="text-sm font-semibold">
                {preview.netMinutes === null
                  ? "Active"
                  : `${(preview.netMinutes / 60).toFixed(2)}h`}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Est. pay
              </p>
              <p className="text-sm font-semibold">
                {preview.estimatedPay === null
                  ? "-"
                  : `$${preview.estimatedPay.toFixed(2)}`}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shift-adjustment-reason">Correction reason</Label>
            <Textarea
              id="shift-adjustment-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Example: Staff forgot to clock out after closing."
              className="min-h-24"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={adjustShift.isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={adjustShift.isPending}>
            {adjustShift.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save adjustment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
