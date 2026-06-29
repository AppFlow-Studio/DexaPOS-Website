"use client";

import { ColumnDef } from "@tanstack/react-table";
import { StaffShift } from "@/types/staff";
import { calculateShiftDuration } from "@/utils/exportTimesheets";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Pencil } from "lucide-react";
import { differenceInMinutes, format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TimesheetColumnsOptions {
  onAdjustShift?: (shift: StaffShift) => void;
}

function getBreakDurationMinutes(breakLog: NonNullable<StaffShift["break_logs"]>[number]) {
  if (typeof breakLog.duration_minutes === "number") {
    return breakLog.duration_minutes;
  }

  if (!breakLog.start_at || !breakLog.end_at) {
    return 0;
  }

  const minutes = differenceInMinutes(
    new Date(breakLog.end_at),
    new Date(breakLog.start_at)
  );

  return minutes > 0 ? minutes : 0;
}

export function createColumns({
  onAdjustShift,
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
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
            <AvatarFallback>
              {profile?.first_name?.[0]}
              {profile?.last_name?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{name}</span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "location.name",
    header: "Location",
    cell: ({ row }) => row.original.location?.name || "N/A",
  },
  {
    accessorKey: "clock_in_time",
    header: "Date",
    cell: ({ row }) =>
      format(new Date(row.getValue("clock_in_time")), "MMM dd"),
  },
  {
    accessorFn: (row) => row.clock_in_time,
    id: "clock_in",
    header: "In",
    cell: ({ row }) => format(new Date(row.original.clock_in_time), "h:mm a"),
  },
  {
    accessorFn: (row) => row.clock_out_time,
    id: "clock_out",
    header: "Out",
    cell: ({ row }) => {
      const out = row.original.clock_out_time;
      return out ? (
        format(new Date(out), "h:mm a")
      ) : (
        <span className="text-muted-foreground italic">Active</span>
      );
    },
  },
  {
    id: "breaks",
    header: "Break",
    cell: ({ row }) => {
      const breaks = row.original.break_logs || [];
      const totalMinutes = breaks.reduce(
        (acc, b) => acc + getBreakDurationMinutes(b),
        0
      );
      return totalMinutes > 0 ? `${totalMinutes}m` : "-";
    },
  },
  {
    id: "total",
    header: "Total",
    cell: ({ row }) => {
      const hours = calculateShiftDuration(row.original);
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      return (
        <span className="font-medium">
          {h}h {m}m
        </span>
      );
    },
  },
  {
    id: "pay",
    header: "Est. Pay",
    cell: ({ row }) => {
      const hours = calculateShiftDuration(row.original);
      const rate = row.original.hourly_rate_snapshot;
      if (!rate) return <span className="text-muted-foreground">-</span>;
      return <span>${(hours * rate).toFixed(2)}</span>;
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status as string;
      const isAdjusted = Boolean(row.original.is_verified && row.original.notes);
      const variant =
        status === "approved"
          ? "default"
          : status === "active"
          ? "secondary"
          : "outline";
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={variant} className="capitalize">
            {status}
          </Badge>
          {isAdjusted ? (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-700"
              title={row.original.notes ?? "Manual adjustment"}
            >
              ADJUSTED
            </Badge>
          ) : null}
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const shift = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(shift.id)}
            >
              Copy Shift ID
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAdjustShift?.(shift)}>
              <Pencil className="mr-2 h-4 w-4" />
              Adjust shift
            </DropdownMenuItem>
            <DropdownMenuItem>View Details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
  ];
}

export const columns = createColumns();
