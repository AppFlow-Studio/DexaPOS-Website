"use client";

import { ColumnDef } from "@tanstack/react-table";
import { StaffShift } from "@/types/staff";
import { calculateShiftDuration } from "@/utils/exportTimesheets";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Copy, Eye, MoreHorizontal, Pencil } from "lucide-react";
import { differenceInMinutes, format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TimesheetColumnsOptions {
  onAdjustShift?: (shift: StaffShift) => void;
  onViewShift?: (shift: StaffShift) => void;
}

const SHIFT_STATUS_STYLES: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  active: {
    label: "Active",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  completed: {
    label: "Completed",
    bg: "bg-muted/60",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  approved: {
    label: "Approved",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  rejected: {
    label: "Rejected",
    bg: "bg-red-50 dark:bg-red-950/40",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
};

const FALLBACK_STATUS_STYLE = {
  label: "Unknown",
  bg: "bg-muted/60",
  text: "text-muted-foreground",
  dot: "bg-muted-foreground/60",
};

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

export function createColumns({
  onAdjustShift,
  onViewShift,
}: TimesheetColumnsOptions = {}): ColumnDef<StaffShift>[] {
  return [
    {
      accessorFn: (row) =>
        `${row.staff_profile?.first_name} ${row.staff_profile?.last_name}`,
      id: "employee",
      header: "Employee",
      cell: ({ row }) => {
        const profile = row.original.staff_profile;
        const name = profile
          ? `${profile.first_name} ${profile.last_name}`
          : "Unknown";
        return (
          <div className="flex min-w-0 items-center gap-0 sm:min-w-44 sm:gap-2.5">
            <Avatar className="hidden h-8 w-8 sm:flex">
              <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
              <AvatarFallback>
                {profile?.first_name?.[0]}
                {profile?.last_name?.[0]}
              </AvatarFallback>
            </Avatar>
            <span className="max-w-28 truncate text-sm font-medium sm:max-w-none">
              {name}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "location.name",
      header: "Location",
      cell: ({ row }) => (
        <span className="block max-w-24 truncate whitespace-nowrap text-muted-foreground sm:max-w-none">
          {row.original.location?.name || "N/A"}
        </span>
      ),
    },
    {
      accessorKey: "clock_in_time",
      header: "Date",
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {format(new Date(row.getValue("clock_in_time")), "MMM dd, yyyy")}
        </span>
      ),
    },
    {
      accessorFn: (row) => row.clock_in_time,
      id: "clock_in",
      header: "In",
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {format(new Date(row.original.clock_in_time), "h:mm a")}
        </span>
      ),
    },
    {
      accessorFn: (row) => row.clock_out_time,
      id: "clock_out",
      header: "Out",
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        const out = row.original.clock_out_time;
        return out ? (
          <span className="whitespace-nowrap tabular-nums">
            {format(new Date(out), "h:mm a")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "breaks",
      header: "Break",
      meta: { numeric: true, mobileHidden: true },
      cell: ({ row }) => {
        const breaks = row.original.break_logs || [];
        const totalMinutes = breaks.reduce(
          (acc, b) => acc + getBreakDurationMinutes(b),
          0,
        );
        return totalMinutes > 0 ? `${totalMinutes}m` : "—";
      },
    },
    {
      id: "total",
      header: "Total",
      meta: { numeric: true, mobileHidden: true },
      cell: ({ row }) => {
        const hours = calculateShiftDuration(row.original);
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return (
          <span className="whitespace-nowrap font-medium tabular-nums">
            {h}h {m}m
          </span>
        );
      },
    },
    {
      id: "pay",
      header: "Est. Pay",
      meta: { numeric: true, mobileHidden: true },
      cell: ({ row }) => {
        const hours = calculateShiftDuration(row.original);
        const rate = row.original.hourly_rate_snapshot;
        if (!rate) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="whitespace-nowrap tabular-nums">
            ${(hours * rate).toFixed(2)}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        const status = row.original.status as string;
        const isAdjusted = Boolean(
          row.original.is_verified && row.original.notes,
        );
        const style = SHIFT_STATUS_STYLES[status] ?? {
          ...FALLBACK_STATUS_STYLE,
          label: status || FALLBACK_STATUS_STYLE.label,
        };
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                style.bg,
                style.text,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
              {style.label}
            </span>
            {isAdjusted ? (
              <span
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                title={row.original.notes ?? "Manual adjustment"}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Adjusted
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const shift = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
              >
                <span className="sr-only">More actions</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => navigator.clipboard.writeText(shift.id)}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy Shift ID
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAdjustShift?.(shift)}>
                <Pencil className="mr-2 h-4 w-4" />
                Adjust shift
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewShift?.(shift)}>
                <Eye className="mr-2 h-4 w-4" />
                View details
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}

export const columns = createColumns();
