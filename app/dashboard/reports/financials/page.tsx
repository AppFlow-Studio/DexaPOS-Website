"use client";

import React, { useState, useMemo } from "react";
import { subDays } from "date-fns";
import { CreditCard, FileSpreadsheet } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportPanel as Card, ReportPanelContent as CardContent, ReportPanelHeader as CardHeader, ReportPanelTitle as CardTitle } from "@/components/dashboard/reports/ReportPanel";
import { PageHeader, PageShell } from "@/components/dashboard/shell";
import {
  useFinancialKPIs,
  useWaterfallReport,
  useRevenueBreakdown,
  useDualPricingComparison,
} from "../../hooks/useOrderAnalytics";
import { useOrders } from "../../hooks/useOrder";
import { FinancialHeroChart } from "@/app/dashboard/transactions/components/FinancialHeroChart";
import { Skeleton } from "@/components/ui/skeleton";
import { ReceiptModal } from "@/components/dashboard/orders/ReceiptModal";
import { OrdersDataTable } from "@/components/dashboard/orders/OrdersDataTable";
import { OrderResponse } from "@/types/order-management";
import { useSelectedLocation } from "@/stores/location-store";
import { WaterfallReportCard } from "./components/WaterfallReportCard";
import {
  DatePreset,
  DateRangePicker,
} from "@/components/dashboard/orders/DateRangePicker";
import { useReportingQueryRange } from "@/app/dashboard/hooks/useReportingDateRange";
import { fillDailyFinancialStats } from "@/lib/reporting/date-range";
import { ReportExportButtons } from "../components/ReportExportButtons";
import type { ExportColumn } from "@/utils/export";

type FinancialSummaryRow = { metric: string; amount: number };

const financialSummaryColumns: ExportColumn<FinancialSummaryRow>[] = [
  { key: "metric", header: "Metric" },
  { key: "amount", header: "Amount", format: (v: number) => `$${v.toFixed(2)}` },
];

export default function FinancialsPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_30_days");

  const [activeTab, setActiveTab] = useState("overview");
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(
    null
  );
  const selectedLocation = useSelectedLocation();
  const queryDateRange = useReportingQueryRange(dateRange);

  const { data: kpis, isLoading, isError } = useFinancialKPIs(
    queryDateRange.from,
    queryDateRange.to
  );

  // Fetch waterfall report data
  const { data: waterfallReport, isLoading: isLoadingWaterfall, isError: isErrorWaterfall } = useWaterfallReport(
    queryDateRange.from,
    queryDateRange.to
  );

  // Service charge + dual-pricing totals for a complete financial export
  const { data: revenueBreakdown } = useRevenueBreakdown(
    queryDateRange.from,
    queryDateRange.to
  );
  const { data: dualPricing } = useDualPricingComparison(
    queryDateRange.from,
    queryDateRange.to
  );

  // Fetch orders for the transactions tab
  const { data: orders, isLoading: isLoadingOrders } = useOrders({
    dateRange: {
      from: dateRange.from,
      to: dateRange.to,
    },
  });

  const handleOrderClick = (order: OrderResponse) => {
    setSelectedOrder(order);
  };

  const chartData = useMemo(() => {
    return fillDailyFinancialStats(kpis?.daily_stats ?? [], dateRange).map((stat) => ({
        ...stat,
        gross_sales: stat.net_sales, // Placeholder as backend data is missing
        payments_collected: stat.net_sales, // Placeholder as backend data is missing
      }));
  }, [dateRange, kpis?.daily_stats]);

  if (isLoading && !kpis) {
    return (
      <div className="w-full p-4 space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-10 w-full sm:w-[300px]" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <Skeleton className="h-[400px] w-full xl:col-span-1 rounded-3xl" />
          <Skeleton className="h-[400px] w-full xl:col-span-3 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (isError && !kpis) {
    return (
      <div className="w-full p-4 flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <p className="text-sm font-medium">Failed to load financial data</p>
        <p className="text-xs">Try refreshing the page or selecting a different date range.</p>
      </div>
    );
  }

  const summary = kpis?.summary || {
    gross_sales: 0,
    net_sales: 0,
    discounts_total: 0,
    refunds_total: 0,
    tax_total: 0,
    tip_total: 0,
    order_count: 0,
    avg_order_value: 0,
    paid_in_total: 0,
  };

  const serviceCharges = revenueBreakdown?.serviceCharges ?? 0;

  // Calculated Total Amount (Revenue) — net sales + tax + service charge + tips
  const totalAmount =
    summary.net_sales + summary.tax_total + serviceCharges + summary.tip_total;

  const exportRows: FinancialSummaryRow[] = [
    { metric: "Gross sales", amount: summary.gross_sales },
    { metric: "Discounts", amount: -summary.discounts_total },
    { metric: "Net sales", amount: summary.net_sales },
    { metric: "Tax collected", amount: summary.tax_total },
    { metric: "Service charge", amount: serviceCharges },
    { metric: "Tips", amount: summary.tip_total },
    { metric: "Refunds", amount: summary.refunds_total },
    { metric: "Total collected", amount: totalAmount },
    // Dual-pricing (cash discount) breakdown — only when enabled for this merchant
    ...(dualPricing?.hasDualPricing
      ? [
          { metric: "Card-priced revenue", amount: dualPricing.cardRevenue },
          { metric: "Cash-priced revenue", amount: dualPricing.cashRevenue },
          {
            metric: "Cash discount savings",
            amount: dualPricing.cashDiscountSavings,
          },
        ]
      : []),
  ];

  return (
    <PageShell>
      <PageHeader
        title="Financial Information"
        subtitle="Real-time revenue, collections, and transaction overview"
        backHref="/dashboard/reports"
        backLabel="Back to Reports"
        actions={
          <>
            <DateRangePicker
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
              onDateRangeChange={(from, to) => {
                if (from && to) {
                  setDateRange({ from, to });
                }
              }}
              preset={preset}
              onPresetChange={setPreset}
            />
            <ReportExportButtons
              data={exportRows}
              columns={financialSummaryColumns}
              filenameBase="financial-summary"
              pdfTitle="Financial Summary"
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
              locationName={selectedLocation?.name || "All Locations"}
              summaryCards={[
                {
                  label: "Net Sales",
                  value: summary.net_sales.toLocaleString("en-US", { style: "currency", currency: "USD" }),
                },
                {
                  label: "Tax",
                  value: summary.tax_total.toLocaleString("en-US", { style: "currency", currency: "USD" }),
                },
                {
                  label: "Total Amount",
                  value: totalAmount.toLocaleString("en-US", { style: "currency", currency: "USD" }),
                },
              ]}
              disabled={!kpis}
            />
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            {[
              ["overview", "Overview"],
              ["waterfall", "Waterfall"],
              ["transactions", "Transactions"],
              ["payments", "Payments"],
            ].map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="shrink-0 rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[440px_minmax(0,1fr)]">
      {/* LEFT COLUMN: Controls & Summaries */}
      <div className="min-w-0 space-y-4">

        {/* Scrollable Summary Cards - Hidden Scrollbar */}
        <div className="space-y-4">
          {activeTab === "overview" && (
            <>
              <Card className="shrink-0 overflow-hidden">
                <CardHeader className="pt-6 px-6 pb-2">
                  <CardTitle>
                    Revenue Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-2 space-y-4">
                  {/* List Items */}
                  <div className="flex justify-between items-center group">
                    <span className="text-sm text-muted-foreground">
                      Net sales
                    </span>
                    <span className="font-medium tabular-nums">
                      {summary.net_sales.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="text-sm text-muted-foreground">
                      Gratuity
                    </span>
                    <span className="font-medium tabular-nums">
                      $0.00
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="text-sm text-muted-foreground">
                      Tax amount
                    </span>
                    <span className="font-medium tabular-nums">
                      {summary.tax_total.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="text-sm text-muted-foreground">
                      Service charge
                    </span>
                    <span className="font-medium tabular-nums">
                      {serviceCharges.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="text-sm text-muted-foreground">
                      Tips
                    </span>
                    <span className="font-medium tabular-nums">
                      {summary.tip_total.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="text-sm font-medium text-foreground">
                      Paid in total
                    </span>
                    <span className="font-mono text-base font-bold text-foreground">
                      {totalAmount.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <span className="font-semibold">
                      Total amount
                    </span>
                    <span className="text-lg font-semibold tabular-nums">
                      {totalAmount.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shrink-0 overflow-hidden">
                <CardHeader className="pt-6 px-6 pb-2">
                  <CardTitle>
                    Net Sales Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-2 space-y-4">
                  <div className="flex justify-between items-center group">
                    <span className="text-sm text-muted-foreground">
                      Gross sales
                    </span>
                    <span className="font-medium tabular-nums">
                      {summary.gross_sales.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="text-sm text-muted-foreground">
                      Discounts
                    </span>
                    <span className="font-mono text-base font-bold text-foreground">
                      -
                      {summary.discounts_total.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="text-sm text-muted-foreground">
                      Refunds
                    </span>
                    <span className="font-medium tabular-nums">
                      {summary.refunds_total.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl bg-muted/60 p-4">
                    <span className="font-semibold">
                      Net sales
                    </span>
                    <span className="text-lg font-semibold tabular-nums">
                      {summary.net_sales.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "waterfall" && (
            <WaterfallReportCard
              report={waterfallReport}
              isLoading={isLoadingWaterfall}
              isError={isErrorWaterfall}
            />
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Fixed Chart Area */}
      <div className="flex-1 h-full min-w-0">
        {activeTab === "overview" && (
          <div className="relative min-h-[420px] w-full overflow-hidden rounded-3xl border bg-card">
            <FinancialHeroChart data={chartData} />
          </div>
        )}

        {activeTab === "waterfall" && (
          <div className="relative flex min-h-[420px] w-full flex-col items-center justify-center rounded-3xl border bg-card p-8">
            <FileSpreadsheet className="mb-4 h-16 w-16 text-muted-foreground/25" />
            <h3 className="mb-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
              Net Collected Statement
            </h3>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              Click any line item in the waterfall report to expand and see the
              contributing transactions. Use the date picker to adjust the
              reporting period.
            </p>
          </div>
        )}

        {activeTab === "transactions" && (
          <Card className="flex min-h-[420px] w-full flex-col overflow-hidden">
            <CardContent className="p-0 flex-1 overflow-hidden min-h-0 flex flex-col">
              <div className="flex-1 overflow-auto min-h-0 px-4 pb-4">
                <OrdersDataTable
                  data={orders || []}
                  isLoading={isLoadingOrders}
                  onOrderClick={handleOrderClick}
                  hideOrderStatus
                />
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "payments" && (
          <div className="flex min-h-[420px] w-full flex-col items-center justify-center rounded-3xl border bg-card">
            <CreditCard className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <h3 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
              Payments Dashboard
            </h3>
            <p className="text-sm text-muted-foreground">Detailed analytics coming soon.</p>
          </div>
        )}
      </div>

      </div>

      {/* Receipt Modal Integration */}
      {selectedOrder && (
        <ReceiptModal
          order={selectedOrder}
          location={
            selectedLocation?.id && !Array.isArray(selectedLocation)
              ? selectedLocation
              : null
          }
          open={!!selectedOrder}
          onOpenChange={(open) => !open && setSelectedOrder(null)}
        />
      )}
    </PageShell>
  );
}
