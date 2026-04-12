"use client";

import { useScheduleStore } from "@/stores/useScheduleStore";
import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  TrendingDown,
  TrendingUp,
  DollarSign,
  Clock,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import { VarianceChart } from "./VarianceChart";
import { BreakComplianceTable, ComplianceRecord } from "./BreakComplianceTable";

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
  icon?: any;
}) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between space-y-0 pb-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex items-baseline justify-between pt-2">
        <div className="text-2xl font-bold">{value}</div>
        {trend && (
          <p className={`text-xs ${trendColor} flex items-center gap-1`}>
            {trend.includes("-") ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <TrendingUp className="h-3 w-3" />
            )}
            {trend}
          </p>
        )}
      </div>
    </CardContent>
  </Card>
);

export function ScheduleReports() {
  const { weeklySchedules } = useScheduleStore();

  // Selected Schedule State
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(
    weeklySchedules[0]?.id || ""
  );

  const selectedSchedule = useMemo(
    () => weeklySchedules.find((s) => s.id === selectedScheduleId),
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
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground border border-dashed rounded-lg bg-muted/10 h-[400px]">
        <FileText className="w-12 h-12 mb-4 opacity-20" />
        <p>No schedules available to report on.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card className="bg-muted/40 border-muted">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Weekly Performance
              </h2>
              <p className="text-sm text-muted-foreground">
                Showing data for{" "}
                {selectedSchedule
                  ? `${format(
                      parseISO(selectedSchedule.startDate),
                      "MMM d"
                    )} - ${format(
                      parseISO(selectedSchedule.endDate),
                      "MMM d, yyyy"
                    )}`
                  : "Selected Range"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={selectedScheduleId}
                onValueChange={setSelectedScheduleId}
              >
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="Select Week" />
                </SelectTrigger>
                <SelectContent>
                  {weeklySchedules.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {format(parseISO(s.startDate), "MMM d")} -{" "}
                      {format(parseISO(s.endDate), "MMM d")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 hidden md:flex"
                disabled={!selectedSchedule || !stats}
                onClick={() => {
                  if (!selectedSchedule || !stats) return;
                  const rows = [
                    ["Employee", "Role", "Date", "Start", "End", "Hours"],
                    ...selectedSchedule.shifts.map((s) => [
                      s.employee_name || "Unassigned",
                      s.role,
                      format(parseISO(s.start_time), "yyyy-MM-dd"),
                      format(parseISO(s.start_time), "HH:mm"),
                      format(parseISO(s.end_time), "HH:mm"),
                      (differenceInMinutes(parseISO(s.end_time), parseISO(s.start_time)) / 60).toFixed(2),
                    ]),
                  ];
                  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `schedule-${selectedSchedule.name.replace(/\s+/g, "-")}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedSchedule && stats ? (
        <div className="space-y-6">
          {/* Top Row Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          </div>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-7">
            {/* Variance Chart - Using Recharts */}
            <Card className="md:col-span-2 lg:col-span-4">
              <CardHeader>
                <CardTitle className="text-base">
                  Daily Labor Cost
                </CardTitle>
                <CardDescription>
                  Estimated labor cost per day based on scheduled hours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VarianceChart data={stats.chartData} />
              </CardContent>
            </Card>

            {/* Summary List */}
            <Card className="md:col-span-1 lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Week Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">
                    Total Employees
                  </span>
                  <span className="font-medium">{stats.employeeCount}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">
                    Total Shifts
                  </span>
                  <span className="font-medium">{stats.totalShifts}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">
                    Avg Shift Length
                  </span>
                  <span className="font-medium">
                    {stats.totalShifts > 0
                      ? `${(stats.totalHours / stats.totalShifts).toFixed(1)}h`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">
                    Overtime Hours
                  </span>
                  <span className={`font-medium ${stats.overtimeHours > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {stats.overtimeHours > 0 ? `${stats.overtimeHours.toFixed(1)}h` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">
                    Open Shifts
                  </span>
                  <span className="font-medium">
                    {selectedSchedule.shifts.filter((s) => !s.employee_id || s.employee_id === "unassigned").length}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Compliance Table - built from scheduled employees (violations require actual timesheet data) */}
          <BreakComplianceTable data={stats.complianceData} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground border border-dashed rounded-lg bg-muted/10 h-[400px]">
          <FileText className="w-12 h-12 mb-4 opacity-20" />
          <p>Select a schedule to view detailed reports.</p>
        </div>
      )}
    </div>
  );
}
