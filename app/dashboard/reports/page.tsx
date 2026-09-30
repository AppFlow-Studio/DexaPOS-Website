"use client";

import { useState } from "react";
import { useReportDateRange } from "@/stores/report-date-range-store";
import {
  useFinancialKPIs,
  useDualPricingComparison,
} from "../hooks/useOrderAnalytics";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { subDays } from "date-fns";
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
  Globe,
  Calculator,
  Timer,
  Scale,
} from "lucide-react";
import Link from "next/link";
import { useSelectedLocation } from "@/stores/location-store";
import { SalesChart } from "./components/SalesChart";
import { OrderTypeChart } from "./components/OrderTypeChart";
import { cn } from "@/lib/utils";
import { useReportingQueryRange } from "../hooks/useReportingDateRange";
import { fillDailyFinancialStats } from "@/lib/reporting/date-range";
import { ReportExportButtons } from "./components/ReportExportButtons";
import { formatDateForExport, type ExportColumn } from "@/utils/export";
import {
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
  StatRow,
  StatTile,
} from "@/components/dashboard/shell";

type SalesOverviewRow = {
  date: string;
  sales: number;
  orders: number;
  tax: number;
  serviceCharges: number;
  discounts: number;
  cardRevenue: number;
  cashRevenue: number;
};

const usd = (v: number) => `$${v.toFixed(2)}`;

const salesOverviewBaseColumns: ExportColumn<SalesOverviewRow>[] = [
  { key: "date", header: "Date", format: (v: string) => formatDateForExport(v) },
  { key: "sales", header: "Net Sales", format: usd },
  { key: "orders", header: "Orders", format: (v: number) => v.toLocaleString() },
  { key: "tax", header: "Tax", format: usd },
  { key: "serviceCharges", header: "Service Charge", format: usd },
  { key: "discounts", header: "Discounts", format: usd },
];

const salesOverviewDualPricingColumns: ExportColumn<SalesOverviewRow>[] = [
  { key: "cardRevenue", header: "Card Revenue", format: usd },
  { key: "cashRevenue", header: "Cash Revenue", format: usd },
];

// Order mirrors the sidebar's Reports submenu (app/dashboard/layout.tsx) so a
// report sits in the same position whichever way the user navigates. Keep the
// two lists in step when adding a report.
const SUB_REPORTS = [
  {
    label: "Financials",
    href: "/dashboard/reports/financials",
    icon: Wallet,
    desc: "P&L & waterfall statement",
  },
  {
    label: "Comparison",
    href: "/dashboard/reports/comparison",
    icon: GitCompare,
    desc: "Location vs location",
  },
  {
    label: "Orders",
    href: "/dashboard/orders/reports",
    icon: ShoppingCart,
    desc: "Order-level breakdown",
  },
  {
    label: "Sales by Items",
    href: "/dashboard/reports/sales-by-items",
    icon: BarChart3,
    desc: "Top-selling products",
  },
  {
    label: "Cash Management",
    href: "/dashboard/reports/cash-management",
    icon: Banknote,
    desc: "Cash flow summary",
  },
  {
    label: "Voids & Refunds",
    href: "/dashboard/reports/voids",
    icon: FileText,
    desc: "Voided transactions",
  },
  {
    label: "Online Ordering",
    href: "/dashboard/reports/online-ordering",
    icon: Globe,
    desc: "Delivery & pickup channels",
  },
  {
    label: "Cash Drawers",
    href: "/dashboard/reports/cash-drawers",
    icon: Calculator,
    desc: "Drawer sessions & counts",
  },
  {
    label: "Tax Report",
    href: "/dashboard/reports/tax",
    icon: Receipt,
    desc: "Tax & tender breakdown",
  },
  {
    label: "Kitchen Performance",
    href: "/dashboard/reports/kitchen-performance",
    icon: Timer,
    desc: "Prep & ticket times",
  },
  {
    label: "Discrepancy",
    href: "/dashboard/reports/discrepancy",
    icon: Scale,
    desc: "Over & short variances",
  },
];

export default function ReportsPage() {
  // Shared across every report page (stores/report-date-range-store.ts).
  const { dateRange, preset, setDateRange, setPreset } = useReportDateRange();
  const selectedLocation = useSelectedLocation();
  const queryDateRange = useReportingQueryRange(dateRange);

  // Every figure on this page comes from get_financial_kpis, so it matches the
  // other report pages by construction (shared definitions in
  // supabase/migrations/20260930150000_report_number_consistency.sql).
  const { data: financialKPIs, isLoading, isError } = useFinancialKPIs(
    queryDateRange.from,
    queryDateRange.to
  );
  // Trend: the same calculation over the equal-length window just before.
  const periodMs = queryDateRange.to.getTime() - queryDateRange.from.getTime();
  const previousFrom = new Date(queryDateRange.from.getTime() - periodMs);
  const { data: previousKPIs } = useFinancialKPIs(previousFrom, queryDateRange.from);
  // Card vs cash tender split for the export only
  const { data: dualPricing } = useDualPricingComparison(
    queryDateRange.from,
    queryDateRange.to
  );

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) setDateRange(from, to);
  };

  // Derived metrics
  const totalSales = financialKPIs?.summary.net_sales ?? 0;
  const previousSales = previousKPIs?.summary.net_sales ?? 0;
  const salesTrend =
    previousSales > 0 ? ((totalSales - previousSales) / previousSales) * 100 : null;
  const chartData = fillDailyFinancialStats(
    financialKPIs?.daily_stats ?? [],
    dateRange
  ).map((item) => ({
    date: item.date,
    sales: item.net_sales,
    orders: item.order_count,
  }));

  // Enriched daily rows for CSV/PDF export (tax, service charge, discounts, tender split)
  const dailyByDate = new Map(
    (financialKPIs?.daily_stats ?? []).map((d) => [d.date.slice(0, 10), d])
  );
  const dualByDate = new Map(
    (dualPricing?.byDate ?? []).map((d) => [d.date, d])
  );
  const hasDualPricing = dualPricing?.hasDualPricing ?? false;
  const salesOverviewExport: SalesOverviewRow[] = chartData.map((row) => {
    const day = dailyByDate.get(row.date);
    const dual = dualByDate.get(row.date);
    return {
      date: row.date,
      sales: row.sales,
      orders: row.orders,
      tax: day?.tax ?? 0,
      serviceCharges: day?.service_charge ?? 0,
      discounts: day?.discounts ?? 0,
      cardRevenue: dual?.cardRevenue ?? 0,
      cashRevenue: dual?.cashRevenue ?? 0,
    };
  });
  const salesOverviewColumns = hasDualPricing
    ? [...salesOverviewBaseColumns, ...salesOverviewDualPricingColumns]
    : salesOverviewBaseColumns;

  const orderTypeBreakdown = Object.fromEntries(
    (financialKPIs?.order_types ?? []).map((t) => [t.type, t.count])
  );
  const topOrderTypeEntry = Object.entries(orderTypeBreakdown).sort(([, a], [, b]) => (b as number) - (a as number))[0];

  const topOrderTypeLabel = topOrderTypeEntry
    ? topOrderTypeEntry[0]
        .replace(/^qr_dine_in$/, "QR Table")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";

  const isAnyError = isError;
  const kpiCards = [
    {
      label: "Total Revenue",
      value: isLoading ? null : isAnyError ? "—" : `$${totalSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      trend: isAnyError ? null : salesTrend,
      description: isAnyError
        ? "Failed to load"
        : previousSales > 0
          ? `vs $${previousSales.toLocaleString("en-US", { maximumFractionDigits: 0 })} prev.`
          : "For selected period",
    },
    {
      label: "Total Orders",
      value: isLoading ? null : isAnyError ? "—" : (financialKPIs?.summary.order_count ?? 0).toLocaleString(),
      icon: ShoppingCart,
      trend: null,
      description: isAnyError ? "Failed to load" : "Paid orders",
    },
    {
      label: "Avg Order Value",
      value: isLoading ? null : isAnyError ? "—" : `$${(financialKPIs?.summary.avg_order_value ?? 0).toFixed(2)}`,
      icon: TrendingUp,
      trend: null,
      description: isAnyError ? "Failed to load" : "Net sales ÷ orders",
    },
    {
      label: "Top Order Type",
      value: isLoading ? null : isAnyError ? "—" : topOrderTypeLabel,
      icon: Tag,
      trend: null,
      description: isAnyError ? "Failed to load" : topOrderTypeEntry ? `${topOrderTypeEntry[1]} orders` : "No data",
    },
  ];

  return (
    <PageShell className="pb-8">
      <PageHeader
        title="Sales Overview"
        subtitle="Review revenue, order volume, product performance, and sales mix for the selected period."
        actions={
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <DateRangePicker
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
              onDateRangeChange={handleDateRangeChange}
              preset={preset}
              onPresetChange={setPreset}
            />
            <ReportExportButtons
              data={salesOverviewExport}
              columns={salesOverviewColumns}
              filenameBase="sales-overview"
              pdfTitle="Sales Overview"
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
              locationName={
                selectedLocation && !Array.isArray(selectedLocation)
                  ? selectedLocation.name
                  : "All Locations"
              }
              summaryCards={[
                {
                  label: "Total Revenue",
                  value: `$${totalSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                },
                {
                  label: "Total Orders",
                  value: (financialKPIs?.summary.order_count ?? 0).toLocaleString(),
                },
                {
                  label: "Avg Order Value",
                  value: `$${(financialKPIs?.summary.avg_order_value ?? 0).toFixed(2)}`,
                },
              ]}
              disabled={isLoading || isAnyError}
            />
          </div>
        }
      />

      <Panel padded>
        <StatRow columns={4}>
          {kpiCards.map((kpi) => (
            <StatTile
              key={kpi.label}
              label={kpi.label}
              icon={<kpi.icon />}
              value={kpi.value ?? ""}
              isLoading={kpi.value === null}
              meta={
                <span className="inline-flex max-w-full items-center gap-1.5">
                  {kpi.trend !== null ? (
                    <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-muted-foreground">
                      {kpi.trend >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(kpi.trend).toFixed(1)}%
                    </span>
                  ) : null}
                  <span className="truncate">{kpi.description}</span>
                </span>
              }
            />
          ))}
        </StatRow>
      </Panel>

      {/* ── Sales Chart (full-width) ────────────────────────────── */}
      <SalesChart data={chartData} isLoading={isLoading} />

      {/* ── Bottom row: Order Sources / Top Items / Reports ──────── */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        {/* Order Sources */}
        <OrderTypeChart
          data={{
            dine_in: 0,
            qr_dine_in: 0,
            takeout: 0,
            delivery: 0,
            online: 0,
            catering: 0,
            ...orderTypeBreakdown,
          }}
          isLoading={isLoading}
        />

        {/* Top Selling Items */}
        <Panel className="h-full">
          <PanelSection
            icon={BarChart3}
            label="Top selling items"
            caption="Best-performing menu items for the selected period."
          >
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-10 bg-muted animate-pulse rounded-lg"
                  />
                ))}
              </div>
            ) : (financialKPIs?.best_sellers ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No item data available
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {(financialKPIs?.best_sellers ?? [])
                  .slice(0, 6)
                  .map((item, i) => (
                    <div
                      key={item.item_name}
                      className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
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
          </PanelSection>
        </Panel>

        {/* Sub-report Navigation */}
        <Panel className="h-full">
          <PanelSection
            icon={FileText}
            label="Detailed reports"
            caption="Open a focused report for a deeper operational view."
          >
            <div className="thin-scrollbar -mr-2 max-h-96 divide-y divide-border/60 overflow-y-auto pr-2">
              {SUB_REPORTS.map((report) => (
                <Link
                  key={report.href}
                  href={report.href}
                  className="group flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                    <div className="flex min-w-0 items-center gap-3">
                      <report.icon className="h-4 w-4 shrink-0 text-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{report.label}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {report.desc}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </PanelSection>
        </Panel>
      </div>
    </PageShell>
  );
}
