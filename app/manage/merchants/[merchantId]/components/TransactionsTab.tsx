'use client'

import React, { useState, useMemo } from "react";
import { format, subDays } from "date-fns";
import { CreditCard, LayoutDashboard, Receipt } from "lucide-react";
import { DateRange } from "react-day-picker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useFinancialKPIs, useOrderAnalytics } from "@/app/dashboard/hooks/useOrderAnalytics";
import { useOrders } from "@/app/dashboard/hooks/useOrder";
import { FinancialHeroChart } from "@/app/dashboard/transactions/components/FinancialHeroChart";
import { ReceiptModal } from "@/components/dashboard/orders/ReceiptModal";
import { OrderResponse } from "@/types/order-management";
import { MerchantInfoModel } from "@/types/db-modles";

// Import components from dashboard
import { RevenueSummaryCard } from "@/app/dashboard/transactions/components/RevenueSummaryCard";
import { NetSalesSummaryCard } from "@/app/dashboard/transactions/components/NetSalesSummaryCard";
import { TipSummaryCard } from "@/app/dashboard/transactions/components/TipSummaryCard";
import { UnpaidOrdersCard } from "@/app/dashboard/transactions/components/UnpaidOrdersCard";
import { CashSummaryCard } from "@/app/dashboard/transactions/components/CashSummaryCard";
import { CashActivityCard } from "@/app/dashboard/transactions/components/CashActivityCard";
import { PaymentsSummaryCard } from "@/app/dashboard/transactions/components/PaymentsSummaryCard";
import { TransactionsList } from "@/app/dashboard/transactions/components/TransactionsList";
import { BestSellersCard } from "@/app/dashboard/transactions/components/BestSellersCard";

type TimeRangeType = "1d" | "7d" | "30d" | "90d" | "180d" | "365d" | "all";
type TabType = "overview" | "transactions" | "payments";

interface TransactionsTabProps {
    merchantInfo: MerchantInfoModel;
}

export function TransactionsTab({ merchantInfo }: TransactionsTabProps) {
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const [chartTimeRange, setChartTimeRange] = useState<TimeRangeType>("7d");
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null);
  
  // Use merchant's org ID and null for location (All Locations)
  const orgId = merchantInfo?.clerk_org_id;
  const locationId = null; // Force all locations

  // 1. Fetch data for Left Column (Summary)
  const { data: kpis, isLoading: isLoadingKPIs } = useFinancialKPIs(
    date?.from || subDays(new Date(), 7),
    date?.to || new Date(),
    orgId,
    locationId
  );

  // 2. Calculate Chart Date Range
  const chartDateRange = useMemo(() => {
    const now = new Date();
    let fromDate: Date;

    switch (chartTimeRange) {
      case "1d": fromDate = subDays(now, 1); break;
      case "7d": fromDate = subDays(now, 7); break;
      case "30d": fromDate = subDays(now, 30); break;
      case "90d": fromDate = subDays(now, 90); break;
      case "180d": fromDate = subDays(now, 180); break;
      case "365d": fromDate = subDays(now, 365); break;
      case "all": fromDate = subDays(now, 365 * 2); break;
      default: fromDate = subDays(now, 7);
    }
    return { from: fromDate, to: now };
  }, [chartTimeRange]);

  // 3. Fetch data for Chart
  const { data: chartKpis, isLoading: isLoadingChartKPIs } = useFinancialKPIs(
    chartDateRange.from,
    chartDateRange.to,
    orgId,
    locationId
  );

  // Fetch orders for the transactions tab
  const { data: orders, isLoading: isLoadingOrders, refetch: refetchOrders } = useOrders({
    dateRange: {
      from: date?.from || subDays(new Date(), 7),
      to: date?.to || new Date(),
    },
  }, orgId, locationId);

  const handleOrderClick = (order: OrderResponse) => {
    setSelectedOrder(order);
  };

  // 4. Prepare Chart Data from Chart KPIs
  const chartData = useMemo(() => {
    return (
      chartKpis?.daily_stats?.map((stat) => ({
        ...stat,
        gross_sales: stat.net_sales, 
        payments_collected: stat.net_sales,
      })) || []
    );
  }, [chartKpis?.daily_stats]);

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

  const paymentMethods = useMemo(() => {
    if (!kpis?.payment_methods) return [];
    return kpis.payment_methods.map((pm) => ({
      method: pm.method,
      amount: pm.amount,
      count: pm.count,
    }));
  }, [kpis]);

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

  if (!orgId) {
      return <div>Loading merchant configuration...</div>;
  }

  return (
    // Fixed height layout instead of vh
    <div className="h-[800px] w-full flex overflow-hidden bg-[#F9FAFB] font-sans border rounded-xl">
      {/* LEFT COLUMN: Header + Tabs + Content (50%) */}
      <div className="w-1/2 h-full flex flex-col border-r border-gray-200">
        <div className="shrink-0 p-6 pb-2 space-y-4 bg-[#F9FAFB] z-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#111827]">
              Financial Information
            </h1>
            <p className="text-gray-500 text-sm mt-1 truncate">
               All Locations • Real-time overview
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DateRangePicker date={date} setDate={setDate} className="w-full" />
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabType)}
            className="w-full"
          >
            <TabsList className="bg-white p-1 h-auto rounded-xl shadow-sm border border-gray-200/50 w-full grid grid-cols-3">
              <TabsTrigger
                value="overview"
                className="rounded-lg data-[state=active]:bg-[#6366f1] data-[state=active]:text-white py-2.5 text-sm font-medium transition-all"
              >
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="transactions"
                className="rounded-lg data-[state=active]:bg-[#6366f1] data-[state=active]:text-white py-2.5 text-sm font-medium transition-all"
              >
                <Receipt className="w-4 h-4 mr-2" />
                Transactions
              </TabsTrigger>
              <TabsTrigger
                value="payments"
                className="rounded-lg data-[state=active]:bg-[#6366f1] data-[state=active]:text-white py-2.5 text-sm font-medium transition-all"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Payments
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          {activeTab === "overview" && (
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
          )}

          {activeTab === "transactions" && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    Total Orders
                  </p>
                  <p className="text-2xl font-bold mt-1 text-gray-900">
                    {summary.order_count}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    Avg Ticket
                  </p>
                  <p className="text-2xl font-bold mt-1 text-gray-900 font-mono">
                    ${summary.avg_order_value.toFixed(2)}
                  </p>
                </div>
              </div>
              <TransactionsList
                transactions={orders || []}
                isLoading={isLoadingOrders}
                onTransactionClick={handleOrderClick}
              />
            </div>
          )}

          {activeTab === "payments" && (
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
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Chart (50%) */}
      <div className="w-1/2 h-full bg-white p-6 relative">
        <div className="h-full w-full rounded-[32px] overflow-hidden shadow-sm bg-white border border-gray-100 relative">
          <FinancialHeroChart
            data={chartData}
            isLoading={isLoadingChartKPIs}
            defaultTimeRange={chartTimeRange}
            onTimeRangeChange={setChartTimeRange}
          />
        </div>
      </div>

      {selectedOrder && (
        <ReceiptModal
          order={selectedOrder}
          location={null} 
          open={!!selectedOrder}
          onOpenChange={(open: boolean) => !open && setSelectedOrder(null)}
          showAdminActions={true}
          onOrderUpdate={() => {
            refetchOrders()
          }}
        />
      )}
    </div>
  );
}
