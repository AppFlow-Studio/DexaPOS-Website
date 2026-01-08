"use client";

import { useScheduleStore } from "@/stores/useScheduleStore";
import { useUnifiedStaff } from "@/app/dashboard/hooks/useStaff";
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
  startOfWeek,
  addDays,
  isSameDay,
} from "date-fns";
import {
  AlertTriangle,
  Download,
  FileText,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Clock,
  Briefcase,
  AlertCircle,
} from "lucide-react";

// --- Mock Data & Helpers ---

const HOURLY_WAGE_ESTIMATE = 18.5; // Mock average wage
const SALES_FORECAST = 45000; // Mock weekly sales

const MOCK_COMPLIANCE = [
  { name: "John Doe", violations: 0, missedBreaks: 1, lateStarts: 2 },
  { name: "Sarah Smith", violations: 0, missedBreaks: 0, lateStarts: 0 },
  { name: "Mike Jones", violations: 1, missedBreaks: 0, lateStarts: 1 },
];

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

const VarianceChart = ({
  data,
  maxVal,
}: {
  data: {
    label: string;
    value: number;
    type: "scheduled" | "actual" | "forecast";
  }[];
  maxVal: number;
}) => {
  return (
    <div className="flex items-end justify-between h-[150px] gap-2 pt-4">
      {data.map((item, i) => (
        <div key={i} className="flex flex-col items-center gap-2 flex-1 group">
          <div className="relative w-full flex items-end justify-center h-full">
            <div
              className={`w-full max-w-[30px] rounded-t-sm transition-all duration-500 ${
                item.type === "forecast"
                  ? "bg-primary/20 border-t-2 border-primary border-dashed"
                  : item.type === "actual"
                  ? "bg-primary"
                  : "bg-muted-foreground/30"
              }`}
              style={{ height: `${(item.value / maxVal) * 100}%` }}
            >
              <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded shadow-sm whitespace-nowrap z-10">
                ${item.value.toLocaleString()}
              </div>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground uppercase font-medium">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
};

export function ScheduleReports() {
  const { weeklySchedules } = useScheduleStore();
  const { data: staffMembers = [] } = useUnifiedStaff();

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

    let totalMinutes = 0;
    const scheduledDailySales: any[] = []; // Mock Daily Sales

    // Calculate Totals & Daily Buckets
    shifts.forEach((shift) => {
      const start = parseISO(shift.start_time);
      const end = parseISO(shift.end_time);
      totalMinutes += differenceInMinutes(end, start);
    });

    const totalHours = totalMinutes / 60;
    const estLaborCost = totalHours * HOURLY_WAGE_ESTIMATE;
    const laborPercentage = (estLaborCost / SALES_FORECAST) * 100;

    // Daily Mock Data Generation for Chart
    const startOfSchedule = parseISO(selectedSchedule.startDate);
    const chartData = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(startOfSchedule, i);
      const dayName = format(day, "EEE");
      // Generate vaguely realistic curve (higher on weekends)
      const isWeekend = i === 5 || i === 6;
      const dailySales = isWeekend ? 8500 : 5500;
      const dailyLabor = isWeekend ? 2200 : 1400; // Mock actuals

      return { day: dayName, sales: dailySales, labor: dailyLabor };
    });

    return {
      totalHours,
      totalShifts,
      estLaborCost,
      laborPercentage,
      chartData,
      employeeCount: new Set(
        shifts.map((s) => s.employee_id).filter((id) => id !== "unassigned")
      ).size,
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
              title="Total Labor Cost"
              value={`$${stats.estLaborCost.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}`}
              trend="-2.4% vs Forecast"
              trendColor="text-green-500"
              icon={DollarSign}
            />
            <StatCard
              title="Labor %"
              value={`${stats.laborPercentage.toFixed(1)}%`}
              trend="Within Target"
              trendColor="text-green-500"
              icon={Briefcase}
            />
            <StatCard
              title="Scheduled Hours"
              value={`${stats.totalHours.toFixed(0)}h`}
              icon={Clock}
            />
            <StatCard
              title="Overtime Hours"
              value="12.5h"
              trend="+4.5h vs Last Week"
              trendColor="text-red-500"
              icon={AlertCircle}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-7">
            {/* Variance Chart */}
            <Card className="md:col-span-2 lg:col-span-4">
              <CardHeader>
                <CardTitle className="text-base">
                  Labor vs Sales Variance
                </CardTitle>
                <CardDescription>
                  Daily labor costs compared to sales revenue.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] w-full flex items-end justify-between gap-4 px-2">
                  {stats.chartData.map((day, i) => (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center gap-2 h-full justify-end group"
                    >
                      <div className="w-full flex items-end justify-center gap-1 h-full relative">
                        {/* Sales Bar */}
                        <div
                          className="w-3 bg-primary/20 rounded-t-sm h-full max-h-full transition-all relative group-hover:bg-primary/30"
                          style={{ height: `${(day.sales / 10000) * 100}%` }}
                        ></div>
                        {/* Labor Bar */}
                        <div
                          className="w-3 bg-primary rounded-t-sm h-full max-h-full transition-all relative"
                          style={{ height: `${(day.labor / 10000) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">
                        {day.day}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-6 mt-6">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-3 h-3 bg-primary/20 rounded-sm"></div>
                    Sales Revenue
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-3 h-3 bg-primary rounded-sm"></div>
                    Labor Cost
                  </div>
                </div>
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
                    {(stats.totalHours / stats.totalShifts).toFixed(1)}h
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">
                    Call-offs
                  </span>
                  <span className="font-medium text-yellow-500">2</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">
                    Late Clock-ins
                  </span>
                  <span className="font-medium text-yellow-500">3</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Compliance Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  Break & Time Compliance
                </CardTitle>
                <CardDescription>
                  Monitor labor law compliance and attendance exceptions.
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="h-8">
                View All
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-center">Violations</TableHead>
                    <TableHead className="text-center">Missed Breaks</TableHead>
                    <TableHead className="text-center">Late Starts</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_COMPLIANCE.map((emp) => (
                    <TableRow key={emp.name}>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell className="text-center">
                        {emp.violations > 0 ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            {emp.violations}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {emp.missedBreaks > 0 ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                            {emp.missedBreaks}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {emp.lateStarts > 0 ? (
                          <span className="text-xs font-medium text-muted-foreground">
                            {emp.lateStarts}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {emp.violations === 0 && emp.missedBreaks === 0 ? (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                            Compliant
                          </span>
                        ) : (
                          <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                            Review
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Add more mock rows if needed */}
                  <TableRow>
                    <TableCell className="font-medium">Emily Davis</TableCell>
                    <TableCell className="text-center">
                      <span className="text-muted-foreground">-</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-muted-foreground">-</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-muted-foreground">-</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        Compliant
                      </span>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Robert Wilson</TableCell>
                    <TableCell className="text-center">
                      <span className="text-muted-foreground">-</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-muted-foreground">-</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-muted-foreground">-</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        Compliant
                      </span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
