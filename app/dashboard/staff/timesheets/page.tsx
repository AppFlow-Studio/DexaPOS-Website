"use client";

import { useMemo, useState } from "react";
import { startOfWeek, endOfWeek } from "date-fns";
import { useTimesheets, useTimesheetResources } from "@/hooks/useTimesheets";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useGatedLocationId, useGatedLocation } from "@/stores/location-store";
import { DateRange } from "react-day-picker";
import { ReportDataTable } from "@/components/dashboard/orders/reports/ReportDataTable";
import { createColumns } from "./columns";
import { Button } from "@/components/ui/button";
import {
  DateRangePicker,
  type DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { Clock3, Download, Store, UserRound, WalletCards } from "lucide-react";
import {
  downloadTimesheetCSV,
  calculateShiftDuration,
} from "@/utils/exportTimesheets";
import { StaffShift } from "@/types/staff";
import { ShiftAdjustmentDialog } from "./ShiftAdjustmentDialog";
import { ShiftDetailsDialog } from "./ShiftDetailsDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
  StatRow,
  StatTile,
} from "@/components/dashboard/shell";

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
  const [datePreset, setDatePreset] = useState<DatePreset>("custom");

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [shiftToAdjust, setShiftToAdjust] = useState<StaffShift | null>(null);
  const [shiftToView, setShiftToView] = useState<StaffShift | null>(null);

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

  // Hooks must stay above the location empty-state return. The selected
  // location can change after hydration, so placing this memo below the return
  // caused TimesheetsPage to render a different number of hooks.
  const tableColumns = useMemo(
    () =>
      createColumns({
        onAdjustShift: setShiftToAdjust,
        onViewShift: setShiftToView,
      }),
    [],
  );

  // If global location is not specific, show empty state
  if (isAllLocations || !selectedLocation) {
    return (
      <PageShell>
        <PageHeader
          title="Timesheets"
          subtitle="Review staff hours, adjustments, and estimated labor costs"
          backHref="/dashboard/staff"
          backLabel="Back to Staff"
        />
        <Panel padded>
          <div className="flex min-h-72 flex-col items-center justify-center space-y-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted/60">
              <Store className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                Select a location
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Choose a specific location from the dashboard header to view
                timesheets and labor costs.
              </p>
            </div>
          </div>
        </Panel>
      </PageShell>
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
    0,
  );
  const activeShiftsCount = filteredShifts.filter(
    (s) => !s.clock_out_time,
  ).length;
  const estLaborCost = filteredShifts.reduce((acc, s) => {
    const hours = calculateShiftDuration(s);
    return acc + hours * (s.hourly_rate_snapshot || 0);
  }, 0);

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    setDateRange(from ? { from, to: to ?? undefined } : undefined);
  };

  return (
    <PageShell>
      <PageHeader
        title="Timesheets"
        subtitle="Review staff hours, adjustments, and estimated labor costs"
        backHref="/dashboard/staff"
        backLabel="Back to Staff"
        indicator={
          <LocationIndicator
            isAllLocations={false}
            locationName={selectedLocation.name}
          />
        }
        actions={
          <Button
            variant="outline"
            onClick={() => downloadTimesheetCSV(filteredShifts)}
            disabled={!filteredShifts.length}
            className="h-9 gap-2 px-4 text-[0.8125rem] font-medium shadow-sm"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        }
      />

      <Panel padded>
        <StatRow columns={3}>
          <StatTile
            label="Total hours"
            value={totalHours.toFixed(1)}
            meta="Filtered period"
            icon={<Clock3 />}
            isLoading={isLoading}
          />
          <StatTile
            label="Active shifts"
            value={activeShiftsCount}
            meta="Currently working"
            icon={<UserRound />}
            isLoading={isLoading}
          />
          <StatTile
            label="Estimated labor cost"
            value={`$${estLaborCost.toFixed(2)}`}
            meta="Estimated gross pay"
            icon={<WalletCards />}
            isLoading={isLoading}
          />
        </StatRow>
      </Panel>

      <Panel padded>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
            Timesheet records
          </h2>
          <p className="text-sm text-muted-foreground">
            Filter shifts by date, employee, or approval status.
          </p>
        </div>

        <div className="mt-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <DateRangePicker
            dateFrom={dateRange?.from ?? null}
            dateTo={dateRange?.to ?? null}
            onDateRangeChange={handleDateRangeChange}
            preset={datePreset}
            onPresetChange={setDatePreset}
            initializeWhenEmpty={false}
            className="w-full sm:w-auto"
            triggerClassName="h-9 w-full justify-between px-4 text-[0.8125rem] font-medium shadow-sm sm:w-auto"
          />

          <Select
            value={selectedEmployeeId}
            onValueChange={setSelectedEmployeeId}
          >
            <SelectTrigger className="h-9 w-full border-0 bg-muted/60 text-[0.8125rem] text-muted-foreground shadow-none hover:bg-muted hover:text-foreground sm:w-[200px]">
              <SelectValue placeholder="All employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {resources?.staff.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.first_name} {member.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-9 w-full border-0 bg-muted/60 text-[0.8125rem] text-muted-foreground shadow-none hover:bg-muted hover:text-foreground sm:w-[160px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-5 border-t border-border/60 pt-2">
          <ReportDataTable
          columns={tableColumns}
          data={filteredShifts}
          loading={isLoading}
        />
        </div>
      </Panel>

      <ShiftAdjustmentDialog
        clerkOrgId={clerkOrgId}
        shift={shiftToAdjust}
        open={Boolean(shiftToAdjust)}
        onOpenChange={(open) => {
          if (!open) setShiftToAdjust(null);
        }}
      />
      <ShiftDetailsDialog
        shift={shiftToView}
        open={Boolean(shiftToView)}
        onOpenChange={(open) => {
          if (!open) setShiftToView(null);
        }}
      />
    </PageShell>
  );
}
