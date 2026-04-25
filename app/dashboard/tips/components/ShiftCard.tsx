"use client";

import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
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
    <Card
      className={cn(
        "p-4 border-l-4 transition-colors",
        isStillWorking
          ? "border-l-teal-500"
          : "border-l-gray-300 dark:border-l-gray-600"
      )}
    >
      {/* Top row: avatar + name + role */}
      <div className="flex items-center gap-3 mb-3">
        <Avatar className="w-9 h-9">
          {shift.avatarUrl && <AvatarImage src={shift.avatarUrl} alt={shift.staffName} />}
          <AvatarFallback className="text-xs font-semibold">
            {getInitials(shift.staffName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{shift.staffName}</p>
          <Badge variant="secondary" className="text-[10px] mt-0.5">
            {shift.roleCode}
          </Badge>
        </div>
        {isStillWorking && (
          <Badge className="bg-teal-500/10 text-teal-600 border-teal-500/30 text-[10px] shrink-0">
            Working
          </Badge>
        )}
      </div>

      {/* Clock times */}
      <div className="text-xs text-muted-foreground mb-3">
        {formatTime(shift.clockInTime)}
        {shift.clockOutTime ? ` → ${formatTime(shift.clockOutTime)}` : " → now"}
        <span className="ml-2 font-medium text-foreground">{shift.hoursWorked}h</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Card tips</span>
          <span className="font-medium">{formatMoney(shift.chargedTips)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cash tips (orders)</span>
          <span className="font-medium">{formatMoney(shift.cashPaymentTips)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Gross sales</span>
          <span className="font-medium">{formatMoney(shift.grossSales)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cash declared</span>
          {clockedOutWithoutDeclaring ? (
            <Badge
              variant="outline"
              className="text-[10px] border-amber-400/60 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400"
            >
              Not yet declared
            </Badge>
          ) : (
            <span className="font-medium">{formatMoney(shift.declaredCashTips)}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
