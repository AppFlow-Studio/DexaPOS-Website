"use client";

import { useState } from "react";
import { startOfWeek, endOfWeek } from "date-fns";
import { useTimesheets, useTimesheetResources } from "@/hooks/useTimesheets";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import {
  useGatedLocationId,
  useGatedLocation,
} from "@/stores/location-store";
import { DateRange } from "react-day-picker";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ArrowLeft, Download, Store } from "lucide-react";
import Link from "next/link";
import {
  downloadTimesheetCSV,
  calculateShiftDuration,
} from "@/utils/exportTimesheets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function TimesheetsPage() {
  // Resolve to the gated location so single-location accounts (locked to 'all')
  // skip the "Select a Location" prompt. Multi-location on 'all' -> null.
  const gatedLocationId = useGatedLocationId();
  const isAllLocations = !gatedLocationId;
  const selectedLocation = useGatedLocation();

  // Impersonation-aware org id (NOT useAuth().orgId, which stays HQ during impersonation).
  const clerkOrgId = useClerkOrgId();

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfWeek(new Date()),
    to: endOfWeek(new Date()),
  });

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Fetch resources (staff) - must be called before any conditional returns
  const { data: resources } = useTimesheetResources(clerkOrgId);

  // Prepare filters - use safe defaults if no location selected
  const filters = {
    clerkOrgId,
    dateRange,
    locationIds:
      selectedLocation && !isAllLocations ? [selectedLocation.id] : [],
    employeeIds: selectedEmployeeId !== "all" ? [selectedEmployeeId] : [],
  };

  // Hook handles fetching - must be called before any conditional returns
  // The hook's enabled state will prevent fetching if dateRange is missing
  const { data: shifts, isLoading } = useTimesheets(filters);

  // If global location is not specific, show empty state
  if (isAllLocations || !selectedLocation) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] space-y-4 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="p-4 rounded-full bg-muted">
          <Store className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">
            Select a Location
          </h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Please select a specific location from the dashboard header to view
            timesheets and labor costs.
          </p>
        </div>
      </div>
    );
  }

  // Aggregations
  // Filter locally by status? Or pass to hook?
  // User spec asked for Status Filter. My hook doesn't accept status.
  // I'll filter strictly on client side for status to keep hook simple/matching snippet.
  const filteredShifts =
    shifts?.filter((s) => {
      if (selectedStatus === "all") return true;
      return s.status === selectedStatus;
    }) || [];

  const totalHours = filteredShifts.reduce(
    (acc, s) => acc + calculateShiftDuration(s),
    0
  );
  const activeShiftsCount = filteredShifts.filter(
    (s) => !s.clock_out_time
  ).length;
  const estLaborCost = filteredShifts.reduce((acc, s) => {
    const hours = calculateShiftDuration(s);
    return acc + hours * (s.hourly_rate_snapshot || 0);
  }, 0);

  return (
    <div className="space-y-6 p-6">
      {/* Back to Staff */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 gap-1.5 text-muted-foreground"
        asChild
      >
        <Link href="/dashboard/staff">
          <ArrowLeft className="h-4 w-4" />
          Back to Staff
        </Link>
      </Button>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Timesheets</h1>
          <p className="text-muted-foreground">
            Manage staff hours for{" "}
            <span className="font-medium text-foreground">
              {selectedLocation.name}
            </span>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => downloadTimesheetCSV(filteredShifts)}
            disabled={!filteredShifts.length}
          >
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 p-4 bg-card border rounded-lg shadow-sm items-center">
        <DateRangePicker
          date={dateRange}
          setDate={setDateRange}
          className="w-full sm:w-[260px]"
        />

        {/* Location Select Removed - Using Global Context */}

        <Select
          value={selectedEmployeeId}
          onValueChange={setSelectedEmployeeId}
        >
          <SelectTrigger className="flex-1 min-w-[140px] sm:w-[200px] sm:flex-none">
            <SelectValue placeholder="All Employees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {resources?.staff.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.first_name} {member.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="flex-1 min-w-[120px] sm:w-[150px] sm:flex-none">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">Filtered period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Shifts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeShiftsCount}</div>
            <p className="text-xs text-muted-foreground">Currently working</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Est. Labor Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${estLaborCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Estimated gross pay</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border bg-card">
        <DataTable
          columns={columns}
          data={filteredShifts}
          loading={isLoading}
          tableClassName="min-w-[900px]"
        />
      </div>
    </div>
  );
}
