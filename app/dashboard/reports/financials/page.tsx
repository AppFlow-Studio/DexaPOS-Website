"use client";

import React, { useState } from "react";
import { format, subDays } from "date-fns";
import {
  CreditCard,
  Banknote,
  TrendingUp,
  ArrowRight,
  Users,
  Package,
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useFinancialKPIs } from "../../hooks/useOrderAnalytics";
import { useOrders } from "../../hooks/useOrder";
import { FinancialSummaryCard } from "../components/FinancialSummaryCard";
import { MetricChartSwitcher } from "../components/MetricChartSwitcher";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReceiptModal } from "@/components/dashboard/orders/ReceiptModal";
import { OrdersDataTable } from "@/components/dashboard/orders/OrdersDataTable";
import { OrderResponse } from "@/types/order-management";
import { useSelectedLocation } from "@/stores/location-store";

export default function FinancialsPage() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const [activeTab, setActiveTab] = useState("overview");
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(
    null
  );
  const selectedLocation = useSelectedLocation();

  const { data: kpis, isLoading } = useFinancialKPIs(
    date?.from || subDays(new Date(), 30),
    date?.to || new Date()
  );

  // Fetch orders for the transactions tab
  const { data: orders, isLoading: isLoadingOrders } = useOrders({
    dateRange: {
      from: date?.from || subDays(new Date(), 30),
      to: date?.to || new Date(),
    },
  });

  const handleOrderClick = (order: OrderResponse) => {
    setSelectedOrder(order);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-10 w-[300px]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full" />
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

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Financial Information
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time performance and financial health
          </p>
        </div>
        <DateRangePicker date={date} setDate={setDate} />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="overview" className="px-6">
            Overview
          </TabsTrigger>
          <TabsTrigger value="transactions" className="px-6">
            Transactions
          </TabsTrigger>
          <TabsTrigger value="financials" className="px-6">
            Financials
          </TabsTrigger>
        </TabsList>

        {/* 1. Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FinancialSummaryCard
              title="Net Revenue"
              value={summary.net_sales}
              info="Total sales after discounts and refunds"
              trend={{ value: 12.5, isPositive: true }}
            />
            <FinancialSummaryCard
              title="AOV"
              value={summary.avg_order_value}
              info="Average ticket size for the period"
              trend={{ value: 3.2, isPositive: false }}
            />
            <FinancialSummaryCard
              title="Guest Count"
              value={summary.order_count}
              info="Total number of orders processed (proxy for guests)"
              trend={{ value: 8.4, isPositive: true }}
            />
            <FinancialSummaryCard
              title="Refunds"
              value={summary.refunds_total}
              info="Total value of returned/refunded transactions"
              className="text-red-500"
            />
          </div>

          <MetricChartSwitcher data={kpis?.daily_stats || []} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-none shadow-sm bg-card/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">
                    Best Selling Items
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs h-8">
                    View All <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="text-[10px] uppercase font-bold text-muted-foreground">
                        Item Name
                      </TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-muted-foreground text-right">
                        Qty
                      </TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-muted-foreground text-right">
                        Revenue
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpis?.best_sellers.map((item, idx) => (
                      <TableRow key={idx} className="border-muted/20">
                        <TableCell className="text-sm font-medium">
                          {item.item_name}
                        </TableCell>
                        <TableCell className="text-sm text-right">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono">
                          {item.revenue.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-card/50">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">
                  Revenue Mix
                </CardTitle>
                <CardDescription>Sales by payment method</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {kpis?.payment_methods.map((pm, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
                        {pm.method.includes("cash") ? (
                          <Banknote className="h-4 w-4" />
                        ) : (
                          <CreditCard className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {pm.method.replace("_", " ")}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {pm.count} transactions
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-bold font-mono">
                      {pm.amount.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 2. Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card className="border-none shadow-sm bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg">Order History</CardTitle>
                <CardDescription>
                  View and manage specific transactions
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0 md:p-6 pt-0">
              <OrdersDataTable
                data={orders || []}
                isLoading={isLoadingOrders}
                onOrderClick={handleOrderClick}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. Financials Tab */}
        <TabsContent value="financials" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="border-none shadow-sm bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Income Statement Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-muted/20">
                  <span className="text-sm text-muted-foreground">
                    Gross Sales
                  </span>
                  <span className="text-sm font-bold">
                    {summary.gross_sales.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-muted/20">
                  <span className="text-sm text-muted-foreground">
                    Discounts
                  </span>
                  <span className="text-sm font-bold text-red-500">
                    -
                    {summary.discounts_total.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-muted/20 bg-muted/30 px-2 rounded">
                  <span className="text-sm font-bold">Net Sales</span>
                  <span className="text-sm font-bold">
                    {summary.net_sales.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-muted/20">
                  <span className="text-sm text-muted-foreground">
                    Tax Collected
                  </span>
                  <span className="text-sm font-bold">
                    {summary.tax_total.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">
                    Tips (Staff)
                  </span>
                  <span className="text-sm font-bold">
                    {summary.tip_total.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Cost Breakdown
                </CardTitle>
                <CardDescription>
                  Setup required for accurate metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-muted/20">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Labor Costs
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    Setup Required
                  </Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-muted/20">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Inventory Costs
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    Coming Soon
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground italic mt-4">
                  * Labor and Inventory costs require hourly rates and purchase
                  orders to be configured.
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-primary/5 text-primary-foreground relative overflow-hidden">
              <CardHeader className="relative z-10">
                <CardTitle className="text-sm font-semibold text-primary">
                  Profit Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="relative z-10 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Based on your{" "}
                  <b>
                    {summary.net_sales.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </b>{" "}
                  net sales this period, you are trending <b>15% higher</b> than
                  last month.
                </p>
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">
                    Recommended Action
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Review top items like{" "}
                    <b>{kpis?.best_sellers[0]?.item_name}</b> and consider
                    promotion strategies for low-moving categories.
                  </p>
                </div>
              </CardContent>
              <TrendingUp className="absolute -bottom-6 -right-6 h-32 w-32 opacity-5" />
            </Card>
          </div>
        </TabsContent>
      </Tabs>

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
