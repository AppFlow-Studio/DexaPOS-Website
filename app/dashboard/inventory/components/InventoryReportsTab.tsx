"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DateRangePicker,
  type DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import {
  useCogsReport,
  useFoodCostAnalysis,
  useWasteAnalytics,
} from "../hooks/useInventoryReports";
import type { DateRange } from "../../actions/inventory-reports";

const TEAL = "#2DD4BF";
const ROSE = "#F43F5E";
const SLATE = "#94A3B8";

const REASON_COLORS: Record<string, string> = {
  spoilage: "#F43F5E",
  overproduction: "#F59E0B",
  spill: "#3B82F6",
  theft: "#8B5CF6",
  damaged: "#EF4444",
  expired: "#EC4899",
  other: "#94A3B8",
};

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortWeek(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={cn("mt-2 text-2xl font-bold tracking-tight", accent)}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

interface InventoryReportsTabProps {
  isAllLocations: boolean;
}

export function InventoryReportsTab({
  isAllLocations,
}: InventoryReportsTabProps) {
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d;
  });
  const [dateTo, setDateTo] = useState<Date>(() => new Date());
  const [preset, setPreset] = useState<DatePreset>("last_30_days");

  const range: DateRange = useMemo(
    () => ({ from: isoDate(dateFrom), to: isoDate(dateTo) }),
    [dateFrom, dateTo],
  );

  const { data: cogsRes, isLoading: cogsLoading } = useCogsReport(range);
  const { data: foodRes, isLoading: foodLoading } = useFoodCostAnalysis(range);
  const { data: wasteRes, isLoading: wasteLoading } = useWasteAnalytics(range);

  if (isAllLocations) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-3 rounded-full bg-muted mb-3">
          <MapPin className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-medium">Select a specific location</p>
        <p className="text-sm text-muted-foreground mt-1">
          COGS and food-cost reports are scoped per location. Choose one from
          the switcher.
        </p>
      </div>
    );
  }

  const cogs = cogsRes?.data;
  const food = foodRes?.data;
  const waste = wasteRes?.data;

  const weekData = (food?.by_week ?? []).map((w) => ({
    week: shortWeek(w.week_start),
    theoretical: w.theoretical,
    actual: w.actual,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Date range */}
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold">COGS &amp; Food Cost</h3>
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          preset={preset}
          onPresetChange={setPreset}
          onDateRangeChange={(from, to) => {
            if (from) setDateFrom(from);
            if (to) setDateTo(to);
          }}
        />
      </div>

      {(cogsRes?.error || foodRes?.error) && (
        <p className="text-sm text-rose-600">
          {cogsRes?.error || foodRes?.error}
        </p>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cogsLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : (
          <>
            <SummaryCard label="Total COGS" value={fmtMoney(cogs?.total_cogs ?? 0)} />
            <SummaryCard
              label="COGS %"
              value={`${(cogs?.cogs_percent ?? 0).toFixed(1)}%`}
            />
            <SummaryCard label="Revenue" value={fmtMoney(cogs?.revenue ?? 0)} />
            <SummaryCard
              label="Gross Profit"
              value={fmtMoney(cogs?.gross_profit ?? 0)}
              accent={
                (cogs?.gross_profit ?? 0) >= 0
                  ? "text-emerald-600"
                  : "text-rose-600"
              }
            />
          </>
        )}
      </div>

      {/* Actual vs Theoretical by week */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-1">Actual vs. Theoretical Food Cost</h3>
          <p className="text-xs text-muted-foreground mb-4">
            A positive variance signals shrinkage, over-portioning, or recipe
            drift.
          </p>
          {foodLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : weekData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No food-cost data for this period.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={256}>
              <BarChart data={weekData} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Bar dataKey="theoretical" fill={SLATE} radius={[4, 4, 0, 0]} name="Theoretical" />
                <Bar dataKey="actual" fill={TEAL} radius={[4, 4, 0, 0]} name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Category breakdown */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Category Breakdown</h3>
          {foodLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (food?.by_category ?? []).length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No category data for this period.
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Theoretical</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(food?.by_category ?? []).map((row) => (
                    <TableRow key={row.category}>
                      <TableCell className="font-medium">{row.category}</TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(row.theoretical)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(row.actual)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium",
                          row.variance > 0
                            ? "text-rose-600"
                            : row.variance < 0
                              ? "text-emerald-600"
                              : "text-muted-foreground",
                        )}
                      >
                        {row.variance > 0 ? "+" : ""}
                        {fmtMoney(row.variance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Item-level COGS drill-down */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Item COGS Detail</h3>
          {cogsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (cogs?.by_item ?? []).length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No item COGS for this period.
            </p>
          ) : (
            <div className="rounded-lg border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Purchases</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(cogs?.by_item ?? []).map((row) => (
                    <TableRow key={row.inventory_item_id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.category}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(row.purchases)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtMoney(row.cogs)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Waste analytics (T2.6) */}
      <div>
        <h3 className="font-semibold mb-1">Waste Analytics</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Total waste this period:{" "}
          <span className="font-semibold text-rose-600">
            {fmtMoney(waste?.total_cost ?? 0)}
          </span>
        </p>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* By reason */}
          <Card>
            <CardContent className="p-6">
              <h4 className="text-sm font-semibold mb-4">By Reason</h4>
              {wasteLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (waste?.by_reason ?? []).length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No waste logged.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={224}>
                  <PieChart>
                    <Pie
                      data={waste?.by_reason ?? []}
                      dataKey="cost"
                      nameKey="reason"
                      innerRadius="55%"
                      outerRadius="85%"
                    >
                      {(waste?.by_reason ?? []).map((r) => (
                        <Cell
                          key={r.reason}
                          fill={REASON_COLORS[r.reason] ?? SLATE}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtMoney(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* By item */}
          <Card>
            <CardContent className="p-6">
              <h4 className="text-sm font-semibold mb-4">By Item</h4>
              {wasteLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (waste?.by_item ?? []).length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No waste logged.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={224}>
                  <BarChart
                    data={(waste?.by_item ?? []).slice(0, 6)}
                    layout="vertical"
                    margin={{ left: 8, right: 12 }}
                  >
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={90}
                    />
                    <Tooltip formatter={(v: number) => fmtMoney(v)} />
                    <Bar dataKey="cost" fill={ROSE} radius={[0, 4, 4, 0]} name="Waste" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* By week */}
          <Card>
            <CardContent className="p-6">
              <h4 className="text-sm font-semibold mb-4">By Week</h4>
              {wasteLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (waste?.by_week ?? []).length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No waste logged.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={224}>
                  <BarChart
                    data={(waste?.by_week ?? []).map((w) => ({
                      week: shortWeek(w.week_start),
                      cost: w.cost,
                    }))}
                    margin={{ left: 8, right: 8 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                    <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip formatter={(v: number) => fmtMoney(v)} />
                    <Bar dataKey="cost" fill={ROSE} radius={[4, 4, 0, 0]} name="Waste" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
