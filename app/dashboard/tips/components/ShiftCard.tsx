"use client";

import { format } from "date-fns";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { TodayShift } from "@/app/dashboard/actions/tips";
import { formatMoney } from "../lib/constants";

interface ShiftCardProps {
  shift: TodayShift;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatTime(iso: string): string {
  return format(new Date(iso), "h:mm a");
}

export function ShiftCard({ shift }: ShiftCardProps) {
  const isStillWorking = !shift.clockOutTime;
  const clockedOutWithoutDeclaring =
    shift.clockOutTime && !shift.tipsDeclaredAt;

  return (
    <div className="flex min-w-0 flex-col rounded-2xl border bg-card p-4">
      {/* Identity row */}
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          {shift.avatarUrl && <AvatarImage src={shift.avatarUrl} alt={shift.staffName} />}
          <AvatarFallback className="text-xs font-semibold">
            {getInitials(shift.staffName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{shift.staffName}</p>
          <p className="truncate text-[0.8125rem] text-muted-foreground">{shift.roleCode}</p>
        </div>
        {/* One neutral pill (DS-CTL-09 / D-12) — the word carries the state. */}
        {isStillWorking && (
          <span className="inline-flex shrink-0 items-center rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium">
            Working
          </span>
        )}
      </div>

      {/* Clock window */}
      <div className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-2 text-[0.8125rem] text-muted-foreground">
        <span className="tabular-nums">
          {formatTime(shift.clockInTime)}
          {shift.clockOutTime ? ` → ${formatTime(shift.clockOutTime)}` : " → now"}
        </span>
        <span className="font-medium tabular-nums text-foreground">{shift.hoursWorked}h</span>
      </div>

      {/* Figures — one inset well (§3.1 tier 3), not a 2-col grid of
          label/value pairs that each collapse to two words per line on a
          phone. §5.5: rows are separated by spacing on a changed surface,
          never by hairlines. */}
      <div className="mt-3 rounded-2xl border-0 bg-muted/60 px-3 py-1 shadow-none">
        <div className="flex min-w-0 items-center justify-between gap-3 py-2">
          <span className="text-[0.8125rem] text-muted-foreground">Card tips</span>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {formatMoney(shift.chargedTips)}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 py-2">
          <span className="min-w-0 truncate text-[0.8125rem] text-muted-foreground">
            Cash tips (orders)
          </span>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {formatMoney(shift.cashPaymentTips)}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 py-2">
          <span className="text-[0.8125rem] text-muted-foreground">Gross sales</span>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {formatMoney(shift.grossSales)}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 py-2">
          <span className="text-[0.8125rem] text-muted-foreground">Cash declared</span>
          {clockedOutWithoutDeclaring ? (
            <span className="inline-flex shrink-0 items-center rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium">
              Not declared
            </span>
          ) : (
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {formatMoney(shift.declaredCashTips)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
