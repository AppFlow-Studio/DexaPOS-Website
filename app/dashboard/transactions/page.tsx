"use client";

import React, { useState, useMemo } from "react";
import { subDays } from "date-fns";
import {
  CreditCard,
  LayoutDashboard,
  Receipt,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageShell,
  PageHeader,
  LocationIndicator,
  Panel,
  StatRow,
  StatTile,
} from "@/components/dashboard/shell";
import { useFinancialKPIs } from "../hooks/useOrderAnalytics";
import { useOrders } from "../hooks/useOrder";
import { FinancialHeroChart } from "./components/FinancialHeroChart";
import { ReceiptModal } from "@/components/dashboard/orders/ReceiptModal";
import { OrderResponse } from "@/types/order-management";
import { useSelectedLocation, useIsAllLocations } from "@/stores/location-store";
import {
  DatePreset,
  DateRangePicker,
} from "@/components/dashboard/orders/DateRangePicker";
import { useReportingQueryRange } from "@/app/dashboard/hooks/useReportingDateRange";
import { fillDailyFinancialStats } from "@/lib/reporting/date-range";

// Restore Component Imports
import { RevenueSummaryCard } from "./components/RevenueSummaryCard";
import { NetSalesSummaryCard } from "./components/NetSalesSummaryCard";
import { TipSummaryCard } from "./components/TipSummaryCard";
import { UnpaidOrdersCard } from "./components/UnpaidOrdersCard";
import { CashSummaryCard } from "./components/CashSummaryCard";
import { CashActivityCard } from "./components/CashActivityCard";
import { PaymentsSummaryCard } from "./components/PaymentsSummaryCard";
import { TransactionsList } from "./components/TransactionsList";
import { BestSellersCard } from "./components/BestSellersCard";

type TimeRangeType = "1d" | "7d" | "30d" | "90d" | "180d" | "365d" | "all";
type TabType = "overview" | "transactions" | "payments";

export default function TransactionsPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_7_days");

  // Chart-specific time range state
  const [chartTimeRange, setChartTimeRange] = useState<TimeRangeType>("7d");

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(
    null
  );
  const selectedLocation = useSelectedLocation();
  const isAllLocations = useIsAllLocations();
  const queryDateRange = useReportingQueryRange(dateRange);

  // 1. Fetch data for Left Column (Summary) based on Picker Date
  const { data: kpis, isLoading: isLoadingKPIs } = useFinancialKPIs(
    queryDateRange.from,
    queryDateRange.to
  );

  // 2. Calculate Chart Date Range based on Chart Time Range Selection
  const chartDateRange = useMemo(() => {
    const now = new Date();
    let fromDate: Date;

    switch (chartTimeRange) {
      case "1d":
        fromDate = subDays(now, 1);
        break;
      case "7d":
        fromDate = subDays(now, 7);
        break;
      case "30d":
        fromDate = subDays(now, 30);
        break;
      case "90d":
        fromDate = subDays(now, 90);
        break;
      case "180d":
        fromDate = subDays(now, 180);
        break;
      case "365d":
        fromDate = subDays(now, 365);
        break;
      case "all":
        fromDate = subDays(now, 365 * 2);
        break;
      default:
        fromDate = subDays(now, 7);
    }
    return { from: fromDate, to: now };
  }, [chartTimeRange]);
  const queryChartDateRange = useReportingQueryRange(chartDateRange);

  // 3. Fetch data for Right Column (Chart) based on Chart Date Range
  const { data: chartKpis, isLoading: isLoadingChartKPIs } = useFinancialKPIs(
    queryChartDateRange.from,
    queryChartDateRange.to
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

  // 4. Prepare Chart Data from Chart KPIs
  const chartData = useMemo(() => {
    return fillDailyFinancialStats(chartKpis?.daily_stats ?? [], chartDateRange).map((stat) => ({
        ...stat,
        gross_sales: stat.net_sales, // Placeholder/Fallback
        payments_collected: stat.net_sales, // Placeholder/Fallback
      }));
  }, [chartDateRange, chartKpis?.daily_stats]);

  const isLoading = isLoadingKPIs;

  const summary = useMemo(
    () =>
      kpis?.summary || {
        gross_sales: 0,
        net_sales: 0,
        discounts_total: 0,
        refunds_total: 0,
        tax_total: 0,
        tip_total: 0,
        order_count: 0,
        avg_order_value: 0,
        paid_in_total: 0,
      },
    [kpis]
  );

  // Calculate payment method breakdown
  const paymentMethods = useMemo(() => {
    if (!kpis?.payment_methods) return [];
    return kpis.payment_methods.map((pm) => ({
      method: pm.method,
      amount: pm.amount,
      count: pm.count,
    }));
  }, [kpis]);

  // Calculate unpaid orders
  const unpaidData = useMemo(() => {
    if (!orders) return { amount: 0, count: 0 };
    const unpaidOrders = orders.filter(
      (order) =>
        order.payment_status !== "captured" &&
        order.status !== "void" &&
        order.status !== "cancelled"
    );
    return {
      amount: unpaidOrders.reduce(
        (sum, order) => sum + (order.amount_due || 0),
        0
      ),
      count: unpaidOrders.length,
    };
  }, [orders]);

  return (
    <PageShell>
      <PageHeader
        title="Financial Information"
        subtitle="Revenue, transactions, and payment activity"
        indicator={
          <LocationIndicator
            isAllLocations={isAllLocations}
            locationName={
              selectedLocation?.id && !Array.isArray(selectedLocation)
                ? selectedLocation.name
                : undefined
            }
          />
        }
        actions={
          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={(from, to) => { if (from && to) setDateRange({ from, to }); }}
            preset={preset}
            onPresetChange={setPreset}
            className="w-full sm:w-auto"
          />
        }
        stackActionsBelowIndicatorOnMobile
      />

      {/* Hero Chart */}
      <Panel>
        <div className="h-[460px] sm:h-[420px]">
          <FinancialHeroChart
            data={chartData}
            isLoading={isLoadingChartKPIs}
            defaultTimeRange={chartTimeRange}
            onTimeRangeChange={setChartTimeRange}
          />
        </div>
      </Panel>

      {/* Quick Stats Row */}
      <Panel>
        <div className="px-4 py-6 sm:px-6">
          <StatRow columns={4}>
            <StatTile
              label="Net Sales"
              value={`$${summary.net_sales.toFixed(2)}`}
              isLoading={isLoading}
            />
            <StatTile
              label="Orders"
              value={summary.order_count}
              isLoading={isLoading}
            />
            <StatTile
              label="Avg Ticket"
              value={`$${summary.avg_order_value.toFixed(2)}`}
              isLoading={isLoading}
            />
            <StatTile
              label="Tips"
              value={`$${summary.tip_total.toFixed(2)}`}
              isLoading={isLoading}
            />
          </StatRow>
        </div>
      </Panel>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabType)}
        className="w-full"
      >
        <div className="w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            <TabsTrigger
              value="overview"
              className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
            >
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="transactions"
              className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
            >
              <Receipt className="w-4 h-4 mr-2" />
              Transactions
            </TabsTrigger>
            <TabsTrigger
              value="payments"
              className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Payments
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2 animate-in fade-in-50 duration-300">
          <div className="space-y-4">
            <RevenueSummaryCard
              netSales={summary.net_sales}
              gratuity={0}
              taxAmount={summary.tax_total}
              tips={summary.tip_total}
              paidInTotal={summary.paid_in_total || 0}
              totalAmount={
                summary.net_sales +
                summary.tax_total +
                summary.tip_total +
                (summary.paid_in_total || 0)
              }
              isLoading={isLoading}
            />
            <NetSalesSummaryCard
              grossSales={summary.gross_sales}
              salesDiscounts={summary.discounts_total}
              salesRefunds={summary.refunds_total}
              netSales={summary.net_sales}
              instantDepositAvailable={0}
              isLoading={isLoading}
            />
            <TipSummaryCard
              tipsCollected={summary.tip_total}
              tipsRefunded={0}
              totalTips={summary.tip_total}
              isLoading={isLoading}
            />
          </div>
          <div className="space-y-4">
            <UnpaidOrdersCard
              unpaidAmount={unpaidData.amount}
              unpaidCount={unpaidData.count}
              isLoading={isLoadingOrders}
            />
            <PaymentsSummaryCard
              paymentMethods={paymentMethods}
              isLoading={isLoading}
            />
            <BestSellersCard
              items={kpis?.best_sellers || []}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}

      {activeTab === "transactions" && (
        <div className="space-y-4 animate-in fade-in-50 duration-300">
          <TransactionsList
            transactions={orders || []}
            isLoading={isLoadingOrders}
            onTransactionClick={handleOrderClick}
            timeZone={
              selectedLocation?.id && !Array.isArray(selectedLocation)
                ? selectedLocation.timezone
                : undefined
            }
          />
        </div>
      )}

      {activeTab === "payments" && (
        <div className="grid gap-4 md:grid-cols-2 animate-in fade-in-50 duration-300">
          <div className="space-y-4">
            <CashSummaryCard
              expectedCloseoutCash={0}
              actualCloseoutCash={0}
              cashOverageShortage={0}
              expectedDeposit={0}
              actualDeposit={0}
              depositOverageShortage={0}
              isLoading={isLoading}
            />
            <CashActivityCard
              totalCashPayments={
                paymentMethods.find((pm) =>
                  pm.method.toLowerCase().includes("cash")
                )?.amount || 0
              }
              cashAdjustments={0}
              cashRefunds={0}
              cashBeforeTipouts={0}
              cashGratuity={0}
              creditNonCashGratuity={0}
              creditNonCashTips={0}
              tipoutsTipsWithheld={0}
              totalCash={
                paymentMethods.find((pm) =>
                  pm.method.toLowerCase().includes("cash")
                )?.amount || 0
              }
              isLoading={isLoading}
            />
          </div>
          <div className="space-y-4">
            <PaymentsSummaryCard
              paymentMethods={paymentMethods}
              isLoading={isLoading}
            />
            <TipSummaryCard
              tipsCollected={summary.tip_total}
              tipsRefunded={0}
              totalTips={summary.tip_total}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}

      {/* Receipt Modal */}
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
