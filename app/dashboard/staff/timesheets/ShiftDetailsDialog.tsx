"use client";

import type { ReactNode } from "react";
import { differenceInMinutes, format } from "date-fns";
import { Clock, DollarSign, MapPin, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StaffShift } from "@/types/staff";

interface ShiftDetailsDialogProps {
  shift: StaffShift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Active / not clocked out";
  return format(new Date(value), "MMM d, yyyy h:mm a");
}

function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function getBreakDurationMinutes(
  breakLog: NonNullable<StaffShift["break_logs"]>[number],
) {
  if (typeof breakLog.duration_minutes === "number") {
    return breakLog.duration_minutes;
  }

  if (!breakLog.start_at || !breakLog.end_at) {
    return 0;
  }

  const minutes = differenceInMinutes(
    new Date(breakLog.end_at),
    new Date(breakLog.start_at),
  );

  return minutes > 0 ? minutes : 0;
}

function DetailCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-base font-semibold text-foreground">{value}</div>
      {helper ? (
        <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
      ) : null}
    </div>
  );
}

export function ShiftDetailsDialog({
  shift,
  open,
  onOpenChange,
}: ShiftDetailsDialogProps) {
  if (!shift) {
    return null;
  }

  const employeeName = shift.staff_profile
    ? `${shift.staff_profile.first_name} ${shift.staff_profile.last_name}`
    : "Unknown staff";
  const breaks = shift.break_logs ?? [];
  const clockIn = new Date(shift.clock_in_time);
  const clockOut = shift.clock_out_time ? new Date(shift.clock_out_time) : null;
  const grossMinutes = differenceInMinutes(clockOut ?? new Date(), clockIn);
  const unpaidBreakMinutes = breaks
    .filter((breakLog) => breakLog.type === "unpaid")
    .reduce((acc, breakLog) => acc + getBreakDurationMinutes(breakLog), 0);
  const paidBreakMinutes = breaks
    .filter((breakLog) => breakLog.type === "paid")
    .reduce((acc, breakLog) => acc + getBreakDurationMinutes(breakLog), 0);
  const netMinutes = Math.max(0, grossMinutes - unpaidBreakMinutes);
  const rate = shift.hourly_rate_snapshot ?? 0;
  const estimatedPay = rate > 0 ? (netMinutes / 60) * rate : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-0 bg-white shadow-lg max-sm:h-dvh max-sm:min-h-dvh max-sm:max-h-none sm:max-h-[90vh] sm:max-w-3xl sm:overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Shift details</DialogTitle>
            <Badge
              variant={shift.status === "active" ? "secondary" : "outline"}
              className="capitalize"
            >
              {shift.status}
            </Badge>
            {shift.is_verified ? <Badge>Verified</Badge> : null}
          </div>
          <DialogDescription>
            Review clock times, breaks, estimated pay, and adjustment notes for
            this shift.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard
            icon={<UserRound className="h-3.5 w-3.5" />}
            label="Employee"
            value={employeeName}
            helper={shift.staff_profile_id}
          />
          <DetailCard
            icon={<MapPin className="h-3.5 w-3.5" />}
            label="Location"
            value={shift.location?.name ?? "N/A"}
            helper={shift.location_id}
          />
          <DetailCard
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Paid time"
            value={formatDuration(netMinutes)}
            helper={`${formatDuration(grossMinutes)} gross - ${formatDuration(unpaidBreakMinutes)} unpaid`}
          />
          <DetailCard
            icon={<DollarSign className="h-3.5 w-3.5" />}
            label="Est. pay"
            value={estimatedPay === null ? "-" : `$${estimatedPay.toFixed(2)}`}
            helper={rate > 0 ? `$${rate.toFixed(2)} / hr` : "No hourly rate"}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-muted/40 p-4">
            <h3 className="text-sm font-semibold">Clock times</h3>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Clock in</dt>
                <dd className="font-medium">
                  {formatDateTime(shift.clock_in_time)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Clock out</dt>
                <dd className="font-medium">
                  {formatDateTime(shift.clock_out_time)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-medium">
                  {formatDateTime(shift.created_at)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last updated</dt>
                <dd className="font-medium">
                  {formatDateTime(shift.updated_at)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl bg-muted/40 p-4">
            <h3 className="text-sm font-semibold">Break summary</h3>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Total breaks</dt>
                <dd className="font-medium">{breaks.length}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Paid break time</dt>
                <dd className="font-medium">
                  {formatDuration(paidBreakMinutes)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Unpaid break deduction
                </dt>
                <dd className="font-medium">
                  {formatDuration(unpaidBreakMinutes)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Adjustment note</dt>
                <dd className="font-medium">{shift.notes?.trim() || "-"}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="rounded-xl bg-muted/40">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sm font-semibold">Break log</h3>
          </div>
          {breaks.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No breaks recorded.
            </p>
          ) : (
            <div>
              {breaks.map((breakLog, index) => (
                <div
                  key={breakLog.id || index}
                  className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-4"
                >
                  <div>
                    <div className="text-xs text-muted-foreground">Type</div>
                    <div className="font-medium capitalize">
                      {breakLog.type}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Start</div>
                    <div className="font-medium">
                      {formatDateTime(breakLog.start_at)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">End</div>
                    <div className="font-medium">
                      {formatDateTime(breakLog.end_at)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Duration
                    </div>
                    <div className="font-medium">
                      {formatDuration(getBreakDurationMinutes(breakLog))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Shift ID</div>
          <div className="mt-1 break-all font-mono">{shift.id}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
