"use client";

import { useScheduleStore } from "@/stores/useScheduleStore";
import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  format,
  parseISO,
  differenceInMinutes,
  addDays,
  isSameDay,
} from "date-fns";
import {
  Download,
  FileText,
  DollarSign,
  Clock,
  Briefcase,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { VarianceChart } from "./VarianceChart";
import { BreakComplianceTable, ComplianceRecord } from "./BreakComplianceTable";
import { Panel, StatRow, StatTile } from "@/components/dashboard/shell";

// --- Helpers ---

const HOURLY_WAGE_ESTIMATE = 18.5; // Average wage estimate used for labor cost calculations

const StatCard = ({
  title,
  value,
  trend,
  trendColor,
  icon: Icon,
}: {
  title: string;
  value: string;
  trend?: string;
  trendColor?: string;
  icon?: LucideIcon;
}) => (
  <StatTile
    label={title}
    value={value}
    icon={Icon ? <Icon /> : undefined}
    meta={trend ? <span className={trendColor}>{trend}</span> : undefined}
  />
);

export function ScheduleReports() {
  const { weeklySchedules } = useScheduleStore();

  // Selected Schedule State
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(
    weeklySchedules[0]?.id || ""
  );

  const selectedSchedule = useMemo(
    () =>
      weeklySchedules.find((s) => s.id === selectedScheduleId) ??
      weeklySchedules[0],
    [weeklySchedules, selectedScheduleId]
  );

  // --- Calculations ---
  const stats = useMemo(() => {
    if (!selectedSchedule) return null;

    const shifts = selectedSchedule.shifts;
    const totalShifts = shifts.length;

    // Per-employee hours map for overtime calculation
    const employeeHoursMap = new Map<string, number>();

    let totalMinutes = 0;
    shifts.forEach((shift) => {
      const start = parseISO(shift.start_time);
      const end = parseISO(shift.end_time);
      const mins = differenceInMinutes(end, start);
      totalMinutes += mins;

      if (shift.employee_id && shift.employee_id !== "unassigned") {
        const prev = employeeHoursMap.get(shift.employee_id) || 0;
        employeeHoursMap.set(shift.employee_id, prev + mins / 60);
      }
    });

    const totalHours = totalMinutes / 60;
    const estLaborCost = totalHours * HOURLY_WAGE_ESTIMATE;

    // Overtime = hours scheduled beyond 40h/week per employee
    let overtimeHours = 0;
    for (const hours of employeeHoursMap.values()) {
      if (hours > 40) overtimeHours += hours - 40;
    }

    // Real daily labor cost from actual shifts
    const startOfSchedule = parseISO(selectedSchedule.startDate);
    const chartData = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(startOfSchedule, i);
      const dayName = format(day, "EEE");
      const dayMins = shifts
        .filter((s) => isSameDay(parseISO(s.start_time), day))
        .reduce((acc, s) => acc + differenceInMinutes(parseISO(s.end_time), parseISO(s.start_time)), 0);
      return { day: dayName, labor: Math.round((dayMins / 60) * HOURLY_WAGE_ESTIMATE) };
    });

    // Compliance records built from real scheduled employees (violations require actual timesheet data)
    const uniqueEmployees = new Map<string, string>();
    shifts.forEach((s) => {
      if (s.employee_id && s.employee_id !== "unassigned" && s.employee_name) {
        uniqueEmployees.set(s.employee_id, s.employee_name);
      }
    });
    const complianceData: ComplianceRecord[] = Array.from(uniqueEmployees.values()).map((name) => ({
      name,
      violations: 0,
      missedBreaks: 0,
      lateStarts: 0,
      earlyOuts: 0,
    }));

    return {
      totalHours,
      totalShifts,
      estLaborCost,
      overtimeHours,
      chartData,
      complianceData,
      employeeCount: uniqueEmployees.size,
    };
  }, [selectedSchedule]);

  if (weeklySchedules.length === 0) {
    return (
      <Panel className="flex min-h-[360px] flex-col items-center justify-center bg-muted/15 p-12 text-center text-muted-foreground">
        <FileText className="w-12 h-12 mb-4 opacity-20" />
        <p>No schedules available to report on.</p>
        <p className="mt-1 text-sm">Publish or save a weekly schedule to unlock labor reporting.</p>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <section className="flex flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-primary">
            Weekly performance
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedSchedule
              ? `${format(parseISO(selectedSchedule.startDate), "MMM d")} - ${format(
                  parseISO(selectedSchedule.endDate),
                  "MMM d, yyyy"
                )}`
              : "Selected range"}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
          <Select
            value={selectedSchedule?.id ?? ""}
            onValueChange={setSelectedScheduleId}
          >
            <SelectTrigger className="h-9 w-full rounded-full bg-muted/40 shadow-none sm:w-[220px]">
              <SelectValue placeholder="Select week" />
            </SelectTrigger>
            <SelectContent>
              {weeklySchedules.map((schedule) => (
                <SelectItem key={schedule.id} value={schedule.id}>
                  {format(parseISO(schedule.startDate), "MMM d")} -{" "}
                  {format(parseISO(schedule.endDate), "MMM d")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full gap-2 sm:w-auto"
            disabled={!selectedSchedule || !stats}
            onClick={() => {
              if (!selectedSchedule || !stats) return;
              const rows = [
                ["Employee", "Role", "Date", "Start", "End", "Hours"],
                ...selectedSchedule.shifts.map((shift) => [
                  shift.employee_name || "Unassigned",
                  shift.role,
                  format(parseISO(shift.start_time), "yyyy-MM-dd"),
                  format(parseISO(shift.start_time), "HH:mm"),
                  format(parseISO(shift.end_time), "HH:mm"),
                  (
                    differenceInMinutes(
                      parseISO(shift.end_time),
                      parseISO(shift.start_time)
                    ) / 60
                  ).toFixed(2),
                ]),
              ];
              const csv = rows
                .map((row) => row.map((cell) => `"${cell}"`).join(","))
                .join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `schedule-${selectedSchedule.name.replace(/\s+/g, "-")}.csv`;
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </section>

      {selectedSchedule && stats ? (
        <>
          <section className="border-t border-border/60 px-4 py-6 sm:px-6">
            <StatRow columns={4}>
            <StatCard
              title="Est. Labor Cost"
              value={`$${stats.estLaborCost.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}`}
              icon={DollarSign}
            />
            <StatCard
              title="Employees Scheduled"
              value={String(stats.employeeCount)}
              icon={Briefcase}
            />
            <StatCard
              title="Scheduled Hours"
              value={`${stats.totalHours.toFixed(1)}h`}
              icon={Clock}
            />
            <StatCard
              title="Overtime Hours"
              value={`${stats.overtimeHours.toFixed(1)}h`}
              trendColor={stats.overtimeHours > 0 ? "text-red-500" : "text-green-500"}
              trend={stats.overtimeHours > 0 ? "Over 40h threshold" : "No overtime"}
              icon={AlertCircle}
            />
            </StatRow>
          </section>

          <section className="grid border-t border-border/60 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <div className="min-w-0 px-4 py-6 sm:px-6">
              <h3 className="font-semibold">Daily labor cost</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                  Estimated labor cost per day based on scheduled hours.
              </p>
              <div className="mt-5 min-w-0">
                <VarianceChart data={stats.chartData} />
              </div>
            </div>

            <div className="border-t border-border/60 px-4 py-6 sm:px-6 lg:border-l lg:border-t-0">
              <h3 className="font-semibold">Week summary</h3>
              <div className="mt-4 space-y-1">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground">
                    Total Employees
                  </span>
                  <span className="font-medium">{stats.employeeCount}</span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground">
                    Total Shifts
                  </span>
                  <span className="font-medium">{stats.totalShifts}</span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground">
                    Avg Shift Length
                  </span>
                  <span className="font-medium">
                    {stats.totalShifts > 0
                      ? `${(stats.totalHours / stats.totalShifts).toFixed(1)}h`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground">
                    Overtime Hours
                  </span>
                  <span className={`font-medium ${stats.overtimeHours > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {stats.overtimeHours > 0 ? `${stats.overtimeHours.toFixed(1)}h` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground">
                    Open Shifts
                  </span>
                  <span className="font-medium">
                    {selectedSchedule.shifts.filter((s) => !s.employee_id || s.employee_id === "unassigned").length}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-border/60 px-4 py-6 sm:px-6">
            <BreakComplianceTable data={stats.complianceData} />
          </section>
        </>
      ) : (
        <div className="flex min-h-[360px] flex-col items-center justify-center border-t border-border/60 p-12 text-center text-muted-foreground">
          <FileText className="w-12 h-12 mb-4 opacity-20" />
          <p>Select a schedule to view detailed reports.</p>
        </div>
      )}
    </Panel>
  );
}
