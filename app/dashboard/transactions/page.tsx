"use client";

import React, { useState, useMemo } from "react";
import { format, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useSelectedLocation } from "@/stores/location-store";
import { useFinancialKPIs } from "../hooks/useOrderAnalytics";
import { useOrders } from "../hooks/useOrder";
import { OrderResponse } from "@/types/order-management";
import { ReceiptModal } from "@/components/dashboard/orders/ReceiptModal";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Receipt, CreditCard } from "lucide-react";

// Components
import { RevenueSummaryCard } from "./components/RevenueSummaryCard";
import { NetSalesSummaryCard } from "./components/NetSalesSummaryCard";
import { TipSummaryCard } from "./components/TipSummaryCard";
import { UnpaidOrdersCard } from "./components/UnpaidOrdersCard";
import { CashSummaryCard } from "./components/CashSummaryCard";
import { CashActivityCard } from "./components/CashActivityCard";
import { PaymentsSummaryCard } from "./components/PaymentsSummaryCard";
import { TransactionsList } from "./components/TransactionsList";
import { FinancialHeroChart } from "./components/FinancialHeroChart";
import { BestSellersCard } from "./components/BestSellersCard";

// ============================================================================
// Types
// ============================================================================

type TabType = "overview" | "transactions" | "payments";

interface TabConfig {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}

// ============================================================================
// Tab Configuration
// ============================================================================

const tabs: TabConfig[] = [
  {
    id: "overview",
    label: "Overview",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    id: "transactions",
    label: "Transactions",
    icon: <Receipt className="h-4 w-4" />,
  },
  {
    id: "payments",
    label: "Payments",
    icon: <CreditCard className="h-4 w-4" />,
  },
];

// ============================================================================
// Main Component
// ============================================================================

export default function TransactionsPage() {
  // Left side date range (for cards/data)
  const [leftDate, setLeftDate] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  // Right side chart time range (independent)
  const [chartTimeRange, setChartTimeRange] = useState<string>("7d");

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(
    null
  );
  const selectedLocation = useSelectedLocation();

  // Calculate chart date range based on time range selection
  const chartDateRange = useMemo(() => {
    const now = new Date();
    let fromDate: Date;

    switch (chartTimeRange) {
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

  // Data fetching for left side (cards) - uses leftDate
  const { data: kpis, isLoading: isLoadingKPIs } = useFinancialKPIs(
    leftDate?.from || subDays(new Date(), 7),
    leftDate?.to || new Date()
  );

  // Data fetching for chart - uses chartDateRange
  const { data: chartKpis, isLoading: isLoadingChartKPIs } = useFinancialKPIs(
    chartDateRange.from,
    chartDateRange.to
  );

  const { data: orders, isLoading: isLoadingOrders } = useOrders({
    dateRange: {
      from: leftDate?.from || subDays(new Date(), 7),
      to: leftDate?.to || new Date(),
    },
  });

  // Derived data from KPIs (left side)
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

  // Transform daily stats for the hero chart (uses chartKpis - independent data)
  const chartData = useMemo(() => {
    if (!chartKpis?.daily_stats) return [];
    const chartSummary = chartKpis.summary || {
      discounts_total: 0,
      tax_total: 0,
      tip_total: 0,
    };
    return chartKpis.daily_stats.map((day) => ({
      date: day.date,
      net_sales: day.net_sales || 0,
      gross_sales:
        (day.net_sales || 0) +
        chartSummary.discounts_total / (chartKpis.daily_stats?.length || 1),
      order_count: day.order_count || 0,
      payments_collected:
        (day.net_sales || 0) +
        (chartSummary.tax_total + chartSummary.tip_total) /
          (chartKpis.daily_stats?.length || 1),
    }));
  }, [chartKpis]);

  const handleOrderClick = (order: OrderResponse) => {
    setSelectedOrder(order);
  };

  const isLoading = isLoadingKPIs;

  // ============================================================================
  // Tab Content Renderer
  // ============================================================================

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-4 animate-in fade-in-50 duration-300">
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

            <UnpaidOrdersCard
              unpaidAmount={unpaidData.amount}
              unpaidCount={unpaidData.count}
              isLoading={isLoadingOrders}
            />

            <CashSummaryCard
              expectedCloseoutCash={0}
              actualCloseoutCash={0}
              cashOverageShortage={0}
              expectedDeposit={0}
              actualDeposit={0}
              depositOverageShortage={0}
              isLoading={isLoading}
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
        );

      case "transactions":
        return (
          <div className="space-y-4 animate-in fade-in-50 duration-300">
            {/* Quick Stats Bar */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Total Orders
                </p>
                <p className="text-xl font-bold mt-0.5">
                  {summary.order_count}
                </p>
              </div>
              <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Gross Sales
                </p>
                <p className="text-xl font-bold mt-0.5 font-mono">
                  ${summary.gross_sales.toLocaleString()}
                </p>
              </div>
              <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Net Sales
                </p>
                <p className="text-xl font-bold mt-0.5 font-mono">
                  ${summary.net_sales.toLocaleString()}
                </p>
              </div>
              <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Avg. Ticket
                </p>
                <p className="text-xl font-bold mt-0.5 font-mono">
                  ${summary.avg_order_value.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Transactions List */}
            <TransactionsList
              transactions={orders || []}
              isLoading={isLoadingOrders}
              onTransactionClick={handleOrderClick}
            />
          </div>
        );

      case "payments":
        return (
          <div className="space-y-4 animate-in fade-in-50 duration-300">
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
        );

      default:
        return null;
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* ===================================================================== */}
      {/* MOBILE LAYOUT: Chart on top, content below */}
      {/* ===================================================================== */}
      <div className="lg:hidden">
        {/* Chart Section */}
        <div className="p-4 border-b border-muted/30">
          <FinancialHeroChart
            data={chartData}
            isLoading={isLoadingChartKPIs}
            defaultTimeRange={
              chartTimeRange as "7d" | "30d" | "90d" | "180d" | "365d" | "all"
            }
            onTimeRangeChange={setChartTimeRange}
          />
        </div>

        {/* Content Section */}
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex flex-col gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Financial Information
              </h1>
              <p className="text-sm text-muted-foreground">
                {selectedLocation && !Array.isArray(selectedLocation)
                  ? selectedLocation.name
                  : "All Locations"}
              </p>
            </div>
            <DateRangePicker date={leftDate} setDate={setLeftDate} />
          </div>

          {/* Horizontal Tabs for Mobile */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {renderTabContent()}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* DESKTOP LAYOUT: Two-column split (40/60) - Left smaller, Right bigger */}
      {/* ===================================================================== */}
      <div className="hidden lg:flex h-screen">
        {/* ------------------------------------------------------------------- */}
        {/* LEFT COLUMN: Header + Tabs + Content (Scrollable) - 40% */}
        {/* ------------------------------------------------------------------- */}
        <div className="w-[40%] h-full overflow-y-auto border-r border-muted/30 bg-background">
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="space-y-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Financial Information
                </h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {selectedLocation && !Array.isArray(selectedLocation)
                    ? selectedLocation.name
                    : "All Locations"}{" "}
                  • Real-time financial overview
                </p>
              </div>
              <DateRangePicker date={leftDate} setDate={setLeftDate} />
            </div>

            {/* Horizontal Pill Tabs */}
            <div className="flex gap-2 flex-wrap">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-200",
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-muted/30" />

            {/* Tab Content */}
            {renderTabContent()}
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* RIGHT COLUMN: Chart (Sticky) - 60% - Bigger chart */}
        {/* ------------------------------------------------------------------- */}
        <div className="w-[60%] h-full sticky top-0 bg-muted/5">
          <div className="h-full flex items-center justify-center p-8">
            <div className="w-full h-full max-h-[600px]">
              <FinancialHeroChart
                data={chartData}
                isLoading={isLoadingChartKPIs}
                defaultTimeRange={
                  chartTimeRange as
                    | "7d"
                    | "30d"
                    | "90d"
                    | "180d"
                    | "365d"
                    | "all"
                }
                onTimeRangeChange={setChartTimeRange}
              />
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
