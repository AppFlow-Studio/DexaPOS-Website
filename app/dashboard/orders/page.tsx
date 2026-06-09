"use client";

import { useMemo, useState } from "react";
import {
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { useOrders } from "../hooks/useOrder";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingBag,
  Clock,
  CheckCircle,
  DollarSign,
  QrCode,
  MapPin,
  Globe,
  RefreshCcwDot,
  BarChart3,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { OrdersDataTable } from "@/components/dashboard/orders/OrdersDataTable";
import {
  Order,
  OrderResponse,
  OrderStatus,
  OrderType,
  PaymentMethod,
  OrderFilters,
} from "@/types/order-management";
import { OrderDetailSheet } from "@/components/dashboard/orders/OrderDetailSheet";
import { Empty } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { OrderFilters as OrderFiltersComponent } from "@/components/dashboard/orders/OrderFilters";
import { useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";

import { cn } from "@/lib/utils";

export default function OrdersPage() {
  const selectedLocation = useSelectedLocation();
  const isAllLocations = useIsAllLocations();
  const searchParams = useSearchParams();

  // Parse filters from URL
  const filters: OrderFilters = useMemo(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status")?.split(",") as OrderStatus[];
    const type = searchParams.get("type")?.split(",") as OrderType[];
    const payment = searchParams.get("payment")?.split(",") as PaymentMethod[];
    const staff = searchParams.get("staff");
    const minAmount = searchParams.get("minAmount");
    const maxAmount = searchParams.get("maxAmount");

    return {
      dateRange:
        from || to
          ? {
              from: from ? new Date(from) : null,
              to: to ? new Date(to) : null,
            }
          : undefined,
      status: status?.length ? status : undefined,
      orderType: type?.length ? type : undefined,
      paymentMethod: payment?.length ? payment : undefined,
      staffId: staff || undefined,
      amountRange:
        minAmount || maxAmount
          ? {
              min: minAmount ? parseFloat(minAmount) : undefined,
              max: maxAmount ? parseFloat(maxAmount) : undefined,
            }
          : undefined,
    };
  }, [searchParams]);

  const {
    data: orders,
    isLoading,
    refetch: refetchOrders,
  } = useOrders(filters);

  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(
    null
  );
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [statsRange, setStatsRange] = useState<number>(7); // days
  const rangeLabel = statsRange === 1 ? "today" : `last ${statsRange}d`;
  // Removed local status filter state as it's now handled by URL and server

  const ordersList = Array.isArray(orders) ? orders : [];

  // Removed local filteredOrders useMemo

  // Calculate stats for today (this should ideally be efficient or separate query,
  // but for now keeping it on the returned list might be inaccurate if list is filtered.
  // However, the dashboard stats usually show "Today's" stats regardless of filters,
  // OR they should reflect the filtered view.
  // Given the requirement "Orders page needs more robust filtering options",
  // usually dashboard stats are summary of *activity*, while the list is for *finding* orders.
  // Making stats reflect filters is a good feature but might confuse "Total Orders Today" if date filter is "Last 7 days".
  // Let's keep stats based on "Today" as they were, but note that `ordersList` is now filtered.
  // ISSUE: If `ordersList` is filtered, we can't calculate "Today's" stats from it accurately if the filter excludes today.
  // SOLUTION: We should probably fetch stats separately or accept that stats will only reflect the *visible* orders if they match "today".
  // For now, to avoid breaking "Today" stats when filtering for "Last Week",
  // I should warn that stats might be empty.
  // However, the user asked for filtering on the *list*.
  // Ideally, stats should use a separate hook or `useOrders` without filters.
  // Let's fetch strict "Today" orders for stats separately to keep them accurate?
  // Or just let them reflect current view?
  // The original code calculated stats from `ordersList`.
  // If I change `ordersList` to be filtered, standard stats will break.
  // I will add a separate `useOrders` call for stats or just leave it dependent on current view (which is common MVP behavior).
  // Actually, `useOrders` caches. If I call it twice with different keys, it's fine.
  // Let's add `useStatsOrders` which fetches today's orders specifically for the cards,
  // preventing filters from hiding "Today's Revenue".
  // Wait, `useOrders` defaults to "All" if no filters? No, the original `useOrders` fetched EVERYTHING.
  // Now it fetches based on filters.
  // If I want to preserve the "Stats Cards" showing reliable "Today" data, I should fetch "Today's" data specifically.

  // Let's calculate stats from the filtered list for now to reflect "Access to data".
  // If I filter for "Yesterday", showing "Today's" stats as 0 is actually correct for the *view*,
  // but maybe not for the "Dashboard" feel.
  // Actually, the original code had:
  // const stats = useMemo(() => { ... }, [ordersList])
  // If `ordersList` only has "Yesterday's" orders, `stats.total` (which filters `ordersList` for `today`) will be 0.
  // This is acceptable behavior for a filtered view (e.g. "Show me last week's performance" -> Today stats are irrelevant or 0).
  // However, usually top cards show "Summary of what I see" or "General Status".
  // Let's stick to using `ordersList` which is now filtered.
  // If the user filters for "Last 7 Days", they might expect the stats to summarize those 7 days?
  // The current stats logic HARDCODES check for `today`.
  // I should probably update stats to reflect the *current filtered range* or stick to today.
  // If I stick to today, and user filters for "Last Month", stats show 0 for today if today is not in range?
  // Or if today IS in range, it shows today's subset.
  // To minimize scope creep, I will leave stats logic as "Today's Activity" derived from available data.
  // But this means if I filter for "Yesterday", "Today's" cards will be empty.

  const stats = useMemo(() => {
    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - statsRange);
    rangeStart.setHours(0, 0, 0, 0);

    const rangeOrders = ordersList.filter((order) => {
      const orderDate = new Date(order.created_at);
      return orderDate >= rangeStart;
    });

    const totalInRange = rangeOrders.length;
    const pendingInRange = rangeOrders.filter(
      (o) => o.status === "pending" || o.status === "preparing"
    ).length;
    const completedInRange = rangeOrders.filter(
      (o) => o.status === "completed"
    ).length;
    const revenueInRange = rangeOrders
      .filter(
        (o) => o.payment_status === "captured" || o.payment_status === "paid"
      )
      .reduce((sum, o) => sum + o.total_amount, 0);
    const qrTableOrders = rangeOrders.filter(
      (o) => o.order_type === "qr_dine_in"
    );
    const topQrTableCounts = new Map<string, number>();
    for (const order of qrTableOrders) {
      const tableLabel = order.table_number?.trim() || "Unknown table";
      topQrTableCounts.set(
        tableLabel,
        (topQrTableCounts.get(tableLabel) ?? 0) + 1
      );
    }
    const topQrTable =
      Array.from(topQrTableCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      null;

    return {
      total: totalInRange,
      pending: pendingInRange,
      completed: completedInRange,
      revenue: revenueInRange,
      qrTableOrders: qrTableOrders.length,
      topQrTable,
    };
  }, [ordersList, statsRange]);

  // Group with thousands separators so large revenue amounts stay compact and don't overflow the card.
  const revenueFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }),
    []
  );

  // Build daily breakdown for sparkline charts based on selected range
  const dailyData = useMemo(() => {
    const days: { date: string; label: string; orders: number; revenue: number; completed: number; pending: number }[] = [];
    const now = new Date();
    const numDays = statsRange;

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayOrders = ordersList.filter((o) => {
        const od = new Date(o.created_at);
        return od >= d && od < nextDay;
      });

      const dayLabel = i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "short" });

      days.push({
        date: d.toISOString().slice(0, 10),
        label: dayLabel,
        orders: dayOrders.length,
        revenue: dayOrders
          .filter((o) => o.payment_status === "captured" || o.payment_status === "paid")
          .reduce((sum, o) => sum + o.total_amount, 0),
        completed: dayOrders.filter((o) => o.status === "completed").length,
        pending: dayOrders.filter((o) => o.status === "pending" || o.status === "preparing").length,
        qrTableOrders: dayOrders.filter((o) => o.order_type === "qr_dine_in").length,
      });
    }
    return days;
  }, [ordersList, statsRange]);

  const handleOrderClick = (order: OrderResponse) => {
    setSelectedOrder(order);
    setIsDetailOpen(true);
  };

  const handleDetailClose = () => {
    setIsDetailOpen(false);
    setTimeout(() => setSelectedOrder(null), 200);
  };

  return (
    <main className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            View and manage all orders across your locations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" asChild>
            <Link href="/dashboard/orders/analytics">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" asChild>
            <Link href="/dashboard/orders/reports">
              <FileText className="h-4 w-4" />
              Reports
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Time Range Selector + Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Overview</h2>
          <div className="flex bg-muted/50 p-0.5 rounded-lg gap-0.5">
            {[
              { value: 1, label: "Today" },
              { value: 7, label: "7d" },
              { value: 30, label: "30d" },
              { value: 90, label: "90d" },
            ].map((range) => (
              <button
                key={range.value}
                onClick={() => setStatsRange(range.value)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  statsRange === range.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-5">
        {/* Total Orders */}
        <Card className="border-border/60 shadow-none overflow-hidden">
          <CardContent className="p-5">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-muted-foreground">Total Orders</span>
                  <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight">{stats.total}</span>
                  <span className="text-xs text-muted-foreground/60">{rangeLabel}</span>
                </div>
                <div className="mt-3 h-12">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="orders"
                        stroke="#6366f1"
                        strokeWidth={2}
                        fill="url(#ordersGrad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pending */}
        <Card className="border-border/60 shadow-none overflow-hidden">
          <CardContent className="p-5">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-muted-foreground">Pending</span>
                  <Clock className="h-4 w-4 text-amber-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-amber-600 dark:text-amber-400">{stats.pending}</span>
                  <span className="text-xs text-muted-foreground/60">{rangeLabel}</span>
                </div>
                <div className="mt-3 h-12">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pendingGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="pending"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        fill="url(#pendingGrad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Completed */}
        <Card className="border-border/60 shadow-none overflow-hidden">
          <CardContent className="p-5">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-muted-foreground">Completed</span>
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">{stats.completed}</span>
                  <span className="text-xs text-muted-foreground/60">{rangeLabel}</span>
                </div>
                <div className="mt-3 h-12">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="completed"
                        stroke="#10b981"
                        strokeWidth={1.5}
                        fill="url(#completedGrad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Revenue */}
        <Card className="border-border/60 shadow-none overflow-hidden">
          <CardContent className="p-5">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-muted-foreground">Revenue</span>
                  <DollarSign className="h-4 w-4 text-muted-foreground/40" />
                </div>
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-3xl font-semibold tracking-tight truncate">
                    {revenueFormatter.format(stats.revenue)}
                  </span>
                  <span className="text-xs text-muted-foreground/60 shrink-0">{rangeLabel}</span>
                </div>
                <div className="mt-3 h-12">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0d9488" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#0d9488"
                        strokeWidth={2}
                        fill="url(#revenueGrad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* QR Table Orders */}
        <Card className="border-border/60 shadow-none overflow-hidden">
          <CardContent className="p-5">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-muted-foreground">QR Table</span>
                  <QrCode className="h-4 w-4 text-[#0C4FD1]" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-[#0C4FD1]">
                    {stats.qrTableOrders}
                  </span>
                  <span className="text-xs text-muted-foreground/60">{rangeLabel}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {stats.topQrTable
                    ? `Most active table: ${stats.topQrTable}`
                    : "No QR table orders in this range."}
                </p>
                <div className="mt-3 h-12">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="qrOrdersGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0C4FD1" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#0C4FD1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="qrTableOrders"
                        stroke="#0C4FD1"
                        strokeWidth={2}
                        fill="url(#qrOrdersGrad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      </div>

      {/* Filter Tabs and Orders Table */}
      <Card className="border-border/60 shadow-none">
        <CardHeader className="w-full pb-4">
          <div className="flex flex-col items-start justify-between w-full space-y-4">
            <div className="flex items-center justify-between w-full">
              <CardTitle className="text-base font-medium">All Orders</CardTitle>
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground cursor-pointer"
                size="sm"
                onClick={async () => await refetchOrders()}
              >
                <RefreshCcwDot className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
            <OrderFiltersComponent className="w-full" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Orders Table */}
          {isLoading && ordersList.length === 0 ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : ordersList.length === 0 ? (
            <Empty
              icon={ShoppingBag}
              title={"No orders found"}
              description={"Try adjusting your filters to see more results."}
            />
          ) : (
            <OrdersDataTable
              data={ordersList}
              isLoading={isLoading}
              onOrderClick={handleOrderClick}
            />
          )}
        </CardContent>
      </Card>

      {/* Order Detail Sheet */}
      <OrderDetailSheet
        order={selectedOrder}
        open={isDetailOpen && !!selectedOrder}
        onOpenChange={handleDetailClose}
      />
    </main>
  );
}
