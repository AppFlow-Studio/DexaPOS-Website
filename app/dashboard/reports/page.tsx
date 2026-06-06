"use client";

import { useState } from "react";
import { useFinancialKPIs, useOrderAnalytics } from "../hooks/useOrderAnalytics";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  BarChart3,
  Receipt,
  FileText,
  Banknote,
  Tag,
  GitCompare,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useSelectedLocation } from "@/stores/location-store";
import { SalesChart } from "./components/SalesChart";
import { OrderTypeChart } from "./components/OrderTypeChart";
import { cn } from "@/lib/utils";
import { useReportingQueryRange } from "../hooks/useReportingDateRange";
import { fillDailyFinancialStats } from "@/lib/reporting/date-range";

const SUB_REPORTS = [
  {
    label: "Financials",
    href: "/dashboard/reports/financials",
    icon: Wallet,
    desc: "P&L & waterfall statement",
  },
  {
    label: "Sales by Items",
    href: "/dashboard/reports/sales-by-items",
    icon: BarChart3,
    desc: "Top-selling products",
  },
  {
    label: "Tax Report",
    href: "/dashboard/reports/tax",
    icon: Receipt,
    desc: "Tax & tender breakdown",
  },
  {
    label: "Voids & Refunds",
    href: "/dashboard/reports/voids",
    icon: FileText,
    desc: "Voided transactions",
  },
  {
    label: "Cash Management",
    href: "/dashboard/reports/cash-management",
    icon: Banknote,
    desc: "Cash flow summary",
  },
  {
    label: "Comparison",
    href: "/dashboard/reports/comparison",
    icon: GitCompare,
    desc: "Location vs location",
  },
];

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_30_days");
  const selectedLocation = useSelectedLocation();
  const queryDateRange = useReportingQueryRange(dateRange);

  const { data: analytics, isLoading } = useOrderAnalytics(
    queryDateRange.from,
    queryDateRange.to
  );
  const { data: kpis, isLoading: kpisLoading } = useFinancialKPIs(
    queryDateRange.from,
    queryDateRange.to
  );

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) setDateRange({ from, to });
  };

  // Derived metrics
  const totalSales = kpis?.summary.net_sales ?? 0;
  const previousSales = analytics?.previousPeriodSales ?? 0;
  const salesTrend =
    previousSales > 0 ? ((totalSales - previousSales) / previousSales) * 100 : null;
  const chartData = fillDailyFinancialStats(
    kpis?.daily_stats ?? [],
    dateRange
  ).map((item) => ({
    date: item.date,
    sales: item.net_sales,
    orders: item.order_count,
  }));

  const topOrderTypeEntry = Object.entries(
    analytics?.orderTypeBreakdown ?? {}
  ).sort(([, a], [, b]) => (b as number) - (a as number))[0];

  const topOrderTypeLabel = topOrderTypeEntry
    ? topOrderTypeEntry[0]
        .replace(/^qr_dine_in$/, "QR Table")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";

  const kpiCards = [
    {
      label: "Total Revenue",
      value: isLoading || kpisLoading ? null : `$${totalSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      trend: salesTrend,
      description:
        previousSales > 0
          ? `vs $${previousSales.toLocaleString("en-US", { maximumFractionDigits: 0 })} prev.`
          : "For selected period",
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-50",
    },
    {
      label: "Total Orders",
      value: isLoading || kpisLoading ? null : (kpis?.summary.order_count ?? 0).toLocaleString(),
      icon: ShoppingCart,
      trend: null,
      description: "Completed orders",
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-50",
    },
    {
      label: "Avg Order Value",
      value: isLoading || kpisLoading ? null : `$${(kpis?.summary.avg_order_value ?? 0).toFixed(2)}`,
      icon: TrendingUp,
      trend: null,
      description: "Per transaction",
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
    },
    {
      label: "Top Order Type",
      value: isLoading ? null : topOrderTypeLabel,
      icon: Tag,
      trend: null,
      description: topOrderTypeEntry
        ? `${topOrderTypeEntry[1]} orders`
        : "No data",
      iconColor: "text-purple-500",
      iconBg: "bg-purple-50",
    },
  ];

  return (
    <div className="min-h-full space-y-6 pb-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedLocation && !Array.isArray(selectedLocation)
              ? selectedLocation.name
              : "All Locations"}{" "}
            · Sales performance and trends
          </p>
        </div>
        <DateRangePicker
          dateFrom={dateRange.from}
          dateTo={dateRange.to}
          onDateRangeChange={handleDateRangeChange}
          preset={preset}
          onPresetChange={setPreset}
        />
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <Card
            key={kpi.label}
            className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl overflow-hidden"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2 rounded-xl", kpi.iconBg)}>
                  <kpi.icon className={cn("h-4 w-4", kpi.iconColor)} />
                </div>
                {kpi.trend !== null && (
                  <div
                    className={cn(
                      "flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-full",
                      kpi.trend >= 0
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-red-500/10 text-red-500"
                    )}
                  >
                    {kpi.trend >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {Math.abs(kpi.trend).toFixed(1)}%
                  </div>
                )}
              </div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {kpi.label}
              </p>
              {kpi.value === null ? (
                <div className="h-7 w-24 bg-muted animate-pulse rounded mt-1.5" />
              ) : (
                <p className="text-2xl font-bold mt-1 truncate">{kpi.value}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {kpi.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Sales Chart (full-width) ────────────────────────────── */}
      <SalesChart data={chartData} isLoading={isLoading || kpisLoading} />

      {/* ── Bottom row: Order Sources / Top Items / Reports ──────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Order Sources */}
        <OrderTypeChart
          data={
            analytics?.orderTypeBreakdown ?? {
              dine_in: 0,
              qr_dine_in: 0,
              takeout: 0,
              delivery: 0,
              online: 0,
              catering: 0,
            }
          }
          isLoading={isLoading}
        />

        {/* Top Selling Items */}
        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold">
              Top Selling Items
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Best performers this period
            </p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-10 bg-muted animate-pulse rounded-lg"
                  />
                ))}
              </div>
            ) : (analytics?.bestSellingItems ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No item data available
              </p>
            ) : (
              <div className="space-y-0.5">
                {(analytics?.bestSellingItems ?? [])
                  .slice(0, 6)
                  .map((item, i) => (
                    <div
                      key={item.item_name}
                      className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium truncate">
                          {item.item_name}
                        </span>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-bold">
                          ${item.revenue.toFixed(2)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {item.quantity} sold
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sub-report Navigation */}
        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold">
              Detailed Reports
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Drill down into specific areas
            </p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-0.5">
              {SUB_REPORTS.map((report) => (
                <Link key={report.href} href={report.href}>
                  <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-primary/10 rounded-lg shrink-0">
                        <report.icon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{report.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {report.desc}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
