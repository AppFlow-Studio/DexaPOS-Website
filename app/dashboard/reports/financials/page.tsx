"use client";

import React, { useState, useMemo } from "react";
import { subDays } from "date-fns";
import { CreditCard, FileSpreadsheet } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinancialKPIs, useWaterfallReport } from "../../hooks/useOrderAnalytics";
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

  // Calculated Total Amount (Revenue)
  const totalAmount = summary.net_sales + summary.tax_total + summary.tip_total;

  return (
    // Desktop (xl): height-constrained so inner panels scroll. Mobile/tablet: natural height, page scrolls.
    <div className="flex flex-col xl:flex-row xl:h-[calc(100vh-116px)] w-full max-w-[1920px] mx-auto gap-6 overflow-x-hidden xl:overflow-hidden bg-[#F9FAFB] font-sans pb-4 xl:pb-0">
      {/* LEFT COLUMN: Controls & Summaries (Scrollable) */}
      <div className="xl:w-[440px] shrink-0 flex flex-col gap-6 xl:h-full">
        {/* Fixed Header Section in Left Col */}
        <div className="shrink-0 space-y-4 px-1">
          <div className="min-w-0">
            <h1 className="text-2xl xl:text-3xl font-bold tracking-tight text-[#111827] truncate">
              Financial Information
            </h1>
            <p className="text-gray-500 text-sm mt-1 truncate">
              {selectedLocation?.name || "All Locations"} • Real-time overview
            </p>
          </div>

          <div className="w-full">
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
              className="w-full"
            />
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="bg-white p-1 h-auto rounded-xl shadow-sm border border-gray-200/50 w-full grid grid-cols-4">
              <TabsTrigger
                value="overview"
                className="rounded-lg data-[state=active]:bg-[#6366f1] data-[state=active]:text-white py-2 text-xs font-medium"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="waterfall"
                className="rounded-lg data-[state=active]:bg-[#6366f1] data-[state=active]:text-white py-2 text-xs font-medium truncate"
              >
                Waterfall
              </TabsTrigger>
              <TabsTrigger
                value="transactions"
                className="rounded-lg data-[state=active]:bg-[#6366f1] data-[state=active]:text-white py-2 text-xs font-medium truncate"
              >
                Transactions
              </TabsTrigger>
              <TabsTrigger
                value="payments"
                className="rounded-lg data-[state=active]:bg-[#6366f1] data-[state=active]:text-white py-2 text-xs font-medium"
              >
                Payments
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Scrollable Summary Cards - Hidden Scrollbar */}
        <div className="xl:flex-1 overflow-y-auto pr-2 space-y-4 pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          {activeTab === "overview" && (
            <>
              <Card className="border-none shadow-[0_2px_8px_rgba(0,0,0,0.04)] bg-white rounded-2xl overflow-hidden shrink-0">
                <CardHeader className="pt-6 px-6 pb-2">
                  <CardTitle className="text-base font-bold text-gray-900">
                    Revenue Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-2 space-y-4">
                  {/* List Items */}
                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-sm text-gray-500">
                      Net sales
                    </span>
                    <span className="font-mono font-bold text-gray-900 text-base">
                      {summary.net_sales.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-sm text-gray-500">
                      Gratuity
                    </span>
                    <span className="font-mono font-bold text-gray-900 text-base">
                      $0.00
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-sm text-gray-500">
                      Tax amount
                    </span>
                    <span className="font-mono font-bold text-gray-900 text-base">
                      {summary.tax_total.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-sm text-gray-500">
                      Tips
                    </span>
                    <span className="font-mono font-bold text-gray-900 text-base">
                      {summary.tip_total.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-sm text-[#6366f1]">
                      Paid in total
                    </span>
                    <span className="font-mono font-bold text-[#6366f1] text-base">
                      {totalAmount.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="h-px bg-gray-100 w-full my-2" />

                  <div className="flex justify-between items-center pt-1">
                    <span className="font-bold text-base text-gray-900">
                      Total amount
                    </span>
                    <span className="font-mono font-extrabold text-lg text-gray-900">
                      {totalAmount.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-[0_2px_8px_rgba(0,0,0,0.04)] bg-white rounded-2xl overflow-hidden shrink-0">
                <CardHeader className="pt-6 px-6 pb-2">
                  <CardTitle className="text-base font-bold text-gray-900">
                    Net Sales Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-2 space-y-4">
                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-sm text-gray-500">
                      Gross sales
                    </span>
                    <span className="font-mono font-bold text-gray-900 text-base">
                      {summary.gross_sales.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-sm text-gray-500">
                      Discounts
                    </span>
                    <span className="font-mono font-bold text-red-500 text-base">
                      -
                      {summary.discounts_total.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-sm text-gray-500">
                      Refunds
                    </span>
                    <span className="font-mono font-bold text-gray-900 text-base">
                      {summary.refunds_total.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </div>

                  <div className="h-px bg-gray-100 w-full my-2" />

                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <span className="font-bold text-base text-gray-900">
                      Net sales
                    </span>
                    <span className="font-mono font-black text-lg text-gray-900">
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
          <div className="h-full w-full rounded-[32px] overflow-hidden shadow-sm bg-white border border-gray-100 relative">
            <FinancialHeroChart data={chartData} />
          </div>
        )}

        {activeTab === "waterfall" && (
          <div className="h-full w-full rounded-[32px] overflow-hidden shadow-sm bg-white border border-gray-100 relative flex flex-col items-center justify-center p-8">
            <FileSpreadsheet className="w-16 h-16 text-[#6366f1]/20 mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Net Collected Statement
            </h3>
            <p className="text-gray-500 text-center text-sm max-w-md">
              Click any line item in the waterfall report to expand and see the
              contributing transactions. Use the date picker to adjust the
              reporting period.
            </p>
          </div>
        )}

        {activeTab === "transactions" && (
          <Card className="h-full w-full border-none shadow-sm bg-white rounded-[32px] overflow-hidden flex flex-col">
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
          <div className="h-full w-full rounded-[32px] bg-white border border-dashed border-gray-200 flex flex-col items-center justify-center">
            <CreditCard className="w-16 h-16 text-gray-200 mb-4" />
            <h3 className="text-xl font-bold text-gray-900">
              Payments Dashboard
            </h3>
            <p className="text-gray-500">Detailed analytics coming soon.</p>
          </div>
        )}
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
    </div>
  );
}
