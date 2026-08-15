"use client";

import { useState, useMemo } from "react";
import { useKitchenPerformance } from "../../hooks/useOrderAnalytics";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { subDays, format } from "date-fns";
import { ReportPanel as Card, ReportPanelContent as CardContent, ReportPanelHeader as CardHeader, ReportPanelTitle as CardTitle } from "@/components/dashboard/reports/ReportPanel";
import { ReportPageHeader } from "@/components/dashboard/reports/ReportPageHeader";
import { PageShell, Panel, StatRow, StatTile } from "@/components/dashboard/shell";
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
    },
    {
      label: "Items Processed",
      value: isLoading ? null : isError ? "—" : (kitchen?.total_items_processed ?? 0).toLocaleString(),
      sub: isError ? "Failed to load" : "Total items completed",
      icon: Utensils,
    },
    {
      label: "Rush Item Rate",
      value: isLoading ? null : isError ? "—" : `${(kitchen?.rush_stats?.rush_percentage ?? 0).toFixed(1)}%`,
      sub: isError ? "Failed to load" : `${kitchen?.rush_stats?.rush_items ?? 0} rush items`,
      icon: Zap,
    },
    {
      label: "Auto-Bump Rate",
      value: isLoading ? null : isError ? "—" : `${(kitchen?.auto_bump_stats?.auto_bump_rate ?? 0).toFixed(1)}%`,
      sub: isError ? "Failed to load" : `${kitchen?.auto_bump_stats?.auto_bumped ?? 0} auto-bumped`,
      icon: Activity,
    },
  ];

  const dailyTrend = kitchen?.daily_trend ?? [];

  return (
    <PageShell className="pb-8">
      <ReportPageHeader
        title="Kitchen Performance"
        description="Ticket times, throughput and station efficiency"
        locationName={selectedLocation && !Array.isArray(selectedLocation) ? selectedLocation.name : null}
        actions={
          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={(from, to) => { if (from && to) setDateRange({ from, to }); }}
            preset={preset}
            onPresetChange={setPreset}
          />
        }
      />

      {/* KPI Cards */}
      <Panel padded>
        <StatRow columns={4}>
        {kpis.map((kpi) => (
          <StatTile
            key={kpi.label}
            label={kpi.label}
            value={kpi.value ?? ""}
            meta={kpi.sub}
            icon={<kpi.icon />}
            isLoading={kpi.value === null}
          />
        ))}
        </StatRow>
      </Panel>

      {/* Rush vs Normal split + Auto-Bump row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Rush Stats */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" /> Rush vs Normal Orders
            </CardTitle>
            <p className="text-xs text-muted-foreground">Prep time comparison</p>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-2xl" />)}
              </div>
            ) : isError ? (
              <p className="text-sm text-muted-foreground text-center py-4">Failed to load</p>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/35 p-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Rush Items</p>
                    <p className="text-xl font-bold tabular-nums text-foreground">{kitchen?.rush_stats?.avg_rush_time_minutes?.toFixed(1) ?? "—"} min</p>
                    <p className="text-xs text-muted-foreground">{kitchen?.rush_stats?.rush_items ?? 0} items avg prep</p>
                  </div>
                  <Zap className="h-8 w-8 text-muted-foreground/45" />
                </div>
                <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/40">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Normal Items</p>
                    <p className="text-xl font-bold tabular-nums">{kitchen?.rush_stats?.avg_normal_time_minutes?.toFixed(1) ?? "—"} min</p>
                    <p className="text-xs text-muted-foreground">{(kitchen?.rush_stats?.total_items ?? 0) - (kitchen?.rush_stats?.rush_items ?? 0)} items avg prep</p>
                  </div>
                  <Timer className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Rush share</span>
                    <span className="font-semibold text-foreground">{(kitchen?.rush_stats?.rush_percentage ?? 0).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-foreground/35 transition-all"
                      style={{ width: `${Math.min(kitchen?.rush_stats?.rush_percentage ?? 0, 100)}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Daily Trend Chart */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" /> Ticket Time Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground">Daily avg minutes per ticket</p>
          </CardHeader>
          <CardContent className="px-3 pb-5">
            {isLoading ? (
              <div className="h-44 bg-muted animate-pulse rounded-2xl" />
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
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
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
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                            <ChefHat className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <span className="text-sm font-medium">{station.display_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold">{station.total_items.toLocaleString()}</span>
                          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-foreground/35" style={{ width: `${itemsPct}%` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold text-foreground">
                            {station.avg_prep_minutes.toFixed(1)} min
                          </span>
                          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-foreground/35"
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
                          <span className="text-[10px] font-medium text-muted-foreground">
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
    </PageShell>
  );
}
