"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CHART_GRID,
  CHART_TICK,
  Panel,
  StatRow,
  StatTile,
} from "@/components/dashboard/shell";
import {
  DollarSign,
  AlertTriangle,
  Trash2,
  ShoppingCart,
  MapPin,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useInventoryKpis, useCogsReport } from "../hooks/useInventoryReports";
import type { DateRange } from "../../actions/inventory-reports";

const TEAL = "#2DD4BF";

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shortWeek(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface InventoryDashboardTabProps {
  isAllLocations: boolean;
}

export function InventoryDashboardTab({
  isAllLocations,
}: InventoryDashboardTabProps) {
  // Top-5 chart + reference COGS use a fixed last-30-days window.
  const last30: DateRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, []);

  const { data: kpiRes, isLoading: kpiLoading } = useInventoryKpis();
  const { data: cogsRes, isLoading: cogsLoading } = useCogsReport(last30);

  if (isAllLocations) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-3 rounded-full bg-muted mb-3">
          <MapPin className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-medium">Select a specific location</p>
        <p className="text-sm text-muted-foreground mt-1">
          The inventory dashboard is scoped per location. Choose one from the
          switcher to see KPIs and COGS trends.
        </p>
      </div>
    );
  }

  const kpis = kpiRes?.data;
  const cogs = cogsRes?.data;

  const trendData = (kpis?.cogs_trend ?? []).map((w) => ({
    week: shortWeek(w.week_start),
    cogs: w.cogs,
  }));

  const topItems = (cogs?.by_item ?? [])
    .filter((i) => i.cogs > 0)
    .slice(0, 5)
    .map((i) => ({ name: i.name, cogs: i.cogs }));

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6">
      <StatRow columns={4}>
        <StatTile
          label="Inventory value"
          value={kpis ? fmtMoney(kpis.inventory_value) : "$0.00"}
          meta="Stock on hand at cost"
          icon={<DollarSign />}
          isLoading={kpiLoading}
        />
        <StatTile
          label="Low stock"
          value={kpis?.low_stock_count ?? 0}
          meta="At or below reorder point"
          icon={<AlertTriangle />}
          isLoading={kpiLoading}
        />
        <StatTile
          label="Today’s waste"
          value={kpis ? fmtMoney(kpis.today_waste_cost) : "$0.00"}
          meta="Estimated cost logged today"
          icon={<Trash2 />}
          isLoading={kpiLoading}
        />
        <StatTile
          label="Open purchase orders"
          value={kpis?.open_po_count ?? 0}
          meta={
            kpis ? `${fmtMoney(kpis.open_po_amount)} pending` : "0 pending"
          }
          icon={<ShoppingCart />}
          isLoading={kpiLoading}
        />
      </StatRow>

      {kpiRes?.error && (
        <p className="text-sm text-rose-600">{kpiRes.error}</p>
      )}

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* COGS trend */}
        <Panel nested className="border-0 bg-muted/40 p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">COGS Trend — Last 4 Weeks</h3>
            </div>
            {kpiLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : trendData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No COGS data yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={256}>
                <AreaChart data={trendData} margin={{ left: 8, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="cogsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={TEAL} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={TEAL} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} {...CHART_GRID} />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} tick={CHART_TICK} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={CHART_TICK}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Area
                    type="monotone"
                    dataKey="cogs"
                    stroke={TEAL}
                    strokeWidth={2}
                    fill="url(#cogsFill)"
                    name="COGS"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
        </Panel>

        {/* Top 5 items by cost */}
        <Panel nested className="border-0 bg-muted/40 p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Top 5 Items by Cost (30 days)</h3>
            </div>
            {cogsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : topItems.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No item cost data for the last 30 days.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart
                  data={topItems}
                  layout="vertical"
                  margin={{ left: 8, right: 16, top: 8 }}
                >
                  <CartesianGrid horizontal={false} {...CHART_GRID} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={CHART_TICK}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={CHART_TICK}
                    width={110}
                  />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Bar dataKey="cogs" fill={TEAL} radius={[0, 4, 4, 0]} name="COGS" />
                </BarChart>
              </ResponsiveContainer>
            )}
        </Panel>
      </div>
    </div>
  );
}
