"use client";

import { useState, useMemo } from "react";
import { useKitchenPerformance } from "../../hooks/useOrderAnalytics";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { subDays, format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Clock,
  Utensils,
  Zap,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChefHat,
  Timer,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSelectedLocation } from "@/stores/location-store";
import type { KitchenStationStats } from "@/types/analytics";
import { useReportingQueryRange } from "@/app/dashboard/hooks/useReportingDateRange";

type StationSort = keyof Pick<KitchenStationStats, "display_name" | "total_items" | "avg_prep_minutes" | "auto_bumped">;
type SortDir = "asc" | "desc";

function SortIcon({ col, active, dir }: { col: StationSort; active: StationSort; dir: SortDir }) {
  if (col !== active) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40 ml-1 shrink-0" />;
  return dir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />
    : <ArrowDown className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />;
}

const chartConfig = {
  avg_ticket_minutes: {
    label: "Avg Ticket Time (min)",
    color: "#6366f1",
  },
};

export default function KitchenPerformancePage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_30_days");
  const [stationSort, setStationSort] = useState<StationSort>("total_items");
  const [stationDir, setStationDir] = useState<SortDir>("desc");

  const selectedLocation = useSelectedLocation();
  const queryDateRange = useReportingQueryRange(dateRange);
  const { data: kitchen, isLoading, isError } = useKitchenPerformance(queryDateRange.from, queryDateRange.to);

  function handleStationSort(key: StationSort) {
    if (key === stationSort) setStationDir(d => d === "asc" ? "desc" : "asc");
    else { setStationSort(key); setStationDir("desc"); }
  }

  const sortedStations = useMemo(() => {
    const stations = kitchen?.by_station ?? [];
    return [...stations].sort((a, b) => {
      const av = a[stationSort] ?? "";
      const bv = b[stationSort] ?? "";
      if (typeof av === "string" && typeof bv === "string")
        return stationDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return stationDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [kitchen?.by_station, stationSort, stationDir]);

  const maxItems = sortedStations.reduce((m, s) => Math.max(m, s.total_items), 0);
  const maxPrep = sortedStations.reduce((m, s) => Math.max(m, s.avg_prep_minutes), 0);

  const kpis = [
    {
      label: "Avg Ticket Time",
      value: isLoading ? null : isError ? "—" : `${(kitchen?.avg_ticket_time_minutes ?? 0).toFixed(1)} min`,
      sub: isError ? "Failed to load" : "Per kitchen ticket",
      icon: Clock,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-50",
    },
    {
      label: "Items Processed",
      value: isLoading ? null : isError ? "—" : (kitchen?.total_items_processed ?? 0).toLocaleString(),
      sub: isError ? "Failed to load" : "Total items completed",
      icon: Utensils,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
    },
    {
      label: "Rush Item Rate",
      value: isLoading ? null : isError ? "—" : `${(kitchen?.rush_stats?.rush_percentage ?? 0).toFixed(1)}%`,
      sub: isError ? "Failed to load" : `${kitchen?.rush_stats?.rush_items ?? 0} rush items`,
      icon: Zap,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
    },
    {
      label: "Auto-Bump Rate",
      value: isLoading ? null : isError ? "—" : `${(kitchen?.auto_bump_stats?.auto_bump_rate ?? 0).toFixed(1)}%`,
      sub: isError ? "Failed to load" : `${kitchen?.auto_bump_stats?.auto_bumped ?? 0} auto-bumped`,
      icon: Activity,
      iconColor: "text-purple-500",
      iconBg: "bg-purple-50",
    },
  ];

  const dailyTrend = kitchen?.daily_trend ?? [];

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kitchen Performance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedLocation && !Array.isArray(selectedLocation)
              ? selectedLocation.name
              : "All Locations"}{" "}
            · Ticket times, throughput & station efficiency
          </p>
        </div>
        <DateRangePicker
          dateFrom={dateRange.from}
          dateTo={dateRange.to}
          onDateRangeChange={(from, to) => { if (from && to) setDateRange({ from, to }); }}
          preset={preset}
          onPresetChange={setPreset}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2 rounded-xl", kpi.iconBg)}>
                  <kpi.icon className={cn("h-4 w-4", kpi.iconColor)} />
                </div>
              </div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
              {kpi.value === null
                ? <div className="h-7 w-24 bg-muted animate-pulse rounded mt-1.5" />
                : <p className="text-2xl font-bold mt-1">{kpi.value}</p>
              }
              <p className="text-[11px] text-muted-foreground mt-1">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rush vs Normal split + Auto-Bump row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Rush Stats */}
        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" /> Rush vs Normal Orders
            </CardTitle>
            <p className="text-xs text-muted-foreground">Prep time comparison</p>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-xl" />)}
              </div>
            ) : isError ? (
              <p className="text-sm text-muted-foreground text-center py-4">Failed to load</p>
            ) : (
              <>
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50">
                  <div>
                    <p className="text-xs font-semibold text-amber-700">Rush Items</p>
                    <p className="text-xl font-bold text-amber-700">{kitchen?.rush_stats?.avg_rush_time_minutes?.toFixed(1) ?? "—"} min</p>
                    <p className="text-xs text-amber-600">{kitchen?.rush_stats?.rush_items ?? 0} items avg prep</p>
                  </div>
                  <Zap className="h-8 w-8 text-amber-300" />
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Normal Items</p>
                    <p className="text-xl font-bold">{kitchen?.rush_stats?.avg_normal_time_minutes?.toFixed(1) ?? "—"} min</p>
                    <p className="text-xs text-muted-foreground">{(kitchen?.rush_stats?.total_items ?? 0) - (kitchen?.rush_stats?.rush_items ?? 0)} items avg prep</p>
                  </div>
                  <Timer className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Rush share</span>
                    <span className="font-semibold text-amber-600">{(kitchen?.rush_stats?.rush_percentage ?? 0).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${Math.min(kitchen?.rush_stats?.rush_percentage ?? 0, 100)}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Daily Trend Chart */}
        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-500" /> Ticket Time Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground">Daily avg minutes per ticket</p>
          </CardHeader>
          <CardContent className="px-3 pb-5">
            {isLoading ? (
              <div className="h-44 bg-muted animate-pulse rounded-xl" />
            ) : isError ? (
              <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">
                Failed to load trend data
              </div>
            ) : dailyTrend.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">
                No trend data available
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-44 w-full">
                <AreaChart data={dailyTrend} margin={{ left: 8, right: 8, top: 4 }}>
                  <defs>
                    <linearGradient id="fillTicket" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.08} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={24}
                    tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    className="text-[10px] fill-muted-foreground"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}m`}
                    className="text-[10px] fill-muted-foreground"
                    width={36}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent formatter={(v) => [`${Number(v).toFixed(1)} min`, "Avg Ticket"]} />}
                  />
                  <Area
                    dataKey="avg_ticket_minutes"
                    type="monotone"
                    fill="url(#fillTicket)"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Station Breakdown Table */}
      <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/50">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ChefHat className="h-4 w-4 text-muted-foreground" /> Station Breakdown
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${sortedStations.length} station${sortedStations.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/50">
                <TableHead className="pl-5 text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => handleStationSort("display_name")}>
                  <div className="flex items-center">Station <SortIcon col="display_name" active={stationSort} dir={stationDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right" onClick={() => handleStationSort("total_items")}>
                  <div className="flex items-center justify-end">Items Processed <SortIcon col="total_items" active={stationSort} dir={stationDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right" onClick={() => handleStationSort("avg_prep_minutes")}>
                  <div className="flex items-center justify-end">Avg Prep Time <SortIcon col="avg_prep_minutes" active={stationSort} dir={stationDir} /></div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">Manual Done</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right pr-5" onClick={() => handleStationSort("auto_bumped")}>
                  <div className="flex items-center justify-end">Auto-Bumped <SortIcon col="auto_bumped" active={stationSort} dir={stationDir} /></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/30">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j} className="py-3.5"><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ChefHat className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">Failed to load station data</p>
                      <p className="text-xs">Try refreshing the page or selecting a different date range.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : sortedStations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ChefHat className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">No station data available</p>
                      <p className="text-xs">Kitchen Display System may not be active</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sortedStations.map((station) => {
                  const itemsPct = maxItems > 0 ? (station.total_items / maxItems) * 100 : 0;
                  const prepPct = maxPrep > 0 ? (station.avg_prep_minutes / maxPrep) * 100 : 0;
                  const autoBumpRate = station.total_items > 0
                    ? ((station.auto_bumped / station.total_items) * 100).toFixed(1)
                    : "0.0";
                  return (
                    <TableRow key={station.station_id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <TableCell className="pl-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                            <ChefHat className="h-3.5 w-3.5 text-indigo-500" />
                          </div>
                          <span className="text-sm font-medium">{station.display_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold">{station.total_items.toLocaleString()}</span>
                          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-400" style={{ width: `${itemsPct}%` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn(
                            "text-sm font-semibold",
                            station.avg_prep_minutes > station.alert_threshold_minutes ? "text-rose-500" : "text-emerald-600"
                          )}>
                            {station.avg_prep_minutes.toFixed(1)} min
                          </span>
                          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", station.avg_prep_minutes > station.alert_threshold_minutes ? "bg-rose-400" : "bg-emerald-400")}
                              style={{ width: `${prepPct}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-right text-sm">
                        {station.manual_completed.toLocaleString()}
                      </TableCell>
                      <TableCell className="py-3.5 text-right pr-5">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-medium">{station.auto_bumped.toLocaleString()}</span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">
                            {autoBumpRate}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
