"use client";

import { useMemo, useState } from "react";
import {
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { useOrders } from "../hooks/useOrder";
import { isOrderReportable } from "@/lib/reporting/recognized-order";
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
import { ORDER_STATUS_GROUPS } from "@/lib/constants/order-status";
import { useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();

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

  const ordersList = Array.isArray(orders) ? orders : [];

  // Stats dataset: same date-range + location as the table, but NOT narrowed by the
  // table's status/type/payment chips. This keeps the KPI cards a stable glance metric
  // that reconciles with the table (Open == open-group rows under the same scope).
  const statsFilters = useMemo(
    () => ({ dateRange: filters.dateRange }),
    [filters.dateRange]
  );
  const { data: statsOrders } = useOrders(statsFilters);
  const statsList = Array.isArray(statsOrders) ? statsOrders : [];

  const OPEN_STATUSES = ORDER_STATUS_GROUPS.open as readonly OrderStatus[];

  // Overview quick-range presets write the shared URL date range (from/to), the same
  // range the table's DateRangePicker writes — one source of truth, no scope drift.
  const RANGE_PRESETS = useMemo(
    () => [
      { value: 1, label: "Today" },
      { value: 7, label: "7d" },
      { value: 30, label: "30d" },
      { value: 90, label: "90d" },
    ],
    []
  );

  const setPresetRange = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", from.toISOString());
    params.set("to", to.toISOString());
    router.push(`?${params.toString()}`);
  };

  // Which preset (if any) matches the active URL range — presets always end "today".
  const activePreset = useMemo(() => {
    const { from, to } = filters.dateRange ?? {};
    if (!from || !to) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const toDay = new Date(to);
    toDay.setHours(0, 0, 0, 0);
    if (toDay.getTime() !== today.getTime()) return null;
    const fromDay = new Date(from);
    fromDay.setHours(0, 0, 0, 0);
    const diffDays =
      Math.round((today.getTime() - fromDay.getTime()) / 86_400_000) + 1;
    return RANGE_PRESETS.some((p) => p.value === diffDays) ? diffDays : null;
  }, [filters.dateRange, RANGE_PRESETS]);

  const rangeLabel =
    activePreset === 1
      ? "today"
      : activePreset
        ? `last ${activePreset}d`
        : filters.dateRange?.from || filters.dateRange?.to
          ? "selected range"
          : "all time";

  // KPI rollups over the stats dataset (date-range + location scoped, status-unfiltered).
  // "Open" uses the shared ORDER_STATUS_GROUPS so it can't drift from the table filter.
  const stats = useMemo(() => {
    const total = statsList.length;
    const open = statsList.filter((o) =>
      OPEN_STATUSES.includes(o.status)
    ).length;
    const completed = statsList.filter(
      (o) => o.status === "completed"
    ).length;
    // Revenue = recognized orders only (payment collected AND not
    // draft/cancelled/void/refunded), matching every other reporting surface.
    const revenue = statsList
      .filter((o) => isOrderReportable(o))
      .reduce((sum, o) => sum + o.total_amount, 0);
    const qrTableOrders = statsList.filter(
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
      total,
      open,
      completed,
      revenue,
      qrTableOrders: qrTableOrders.length,
      topQrTable,
    };
  }, [statsList, OPEN_STATUSES]);

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

  // Build daily breakdown for sparkline charts over the active date window
  // (the shared from/to range, or the last 7 days when no range is set).
  const dailyData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDay = filters.dateRange?.to
      ? new Date(filters.dateRange.to)
      : new Date(today);
    endDay.setHours(0, 0, 0, 0);

    const startDay = filters.dateRange?.from
      ? new Date(filters.dateRange.from)
      : (() => {
          const d = new Date(endDay);
          d.setDate(d.getDate() - 6);
          return d;
        })();
    startDay.setHours(0, 0, 0, 0);

    const diff = Math.round(
      (endDay.getTime() - startDay.getTime()) / 86_400_000
    );
    const numDays = Math.min(Math.max(diff + 1, 1), 90);

    const days: {
      date: string;
      label: string;
      orders: number;
      revenue: number;
      completed: number;
      open: number;
      qrTableOrders: number;
    }[] = [];

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(endDay);
      d.setDate(d.getDate() - i);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayOrders = statsList.filter((o) => {
        const od = new Date(o.created_at);
        return od >= d && od < nextDay;
      });

      const dayLabel =
        d.getTime() === today.getTime()
          ? "Today"
          : d.getTime() === today.getTime() - 86_400_000
            ? "Yesterday"
            : d.toLocaleDateString("en-US", { weekday: "short" });

      days.push({
        date: d.toISOString().slice(0, 10),
        label: dayLabel,
        orders: dayOrders.length,
        revenue: dayOrders
          .filter((o) => isOrderReportable(o))
          .reduce((sum, o) => sum + o.total_amount, 0),
        completed: dayOrders.filter((o) => o.status === "completed").length,
        open: dayOrders.filter((o) => OPEN_STATUSES.includes(o.status)).length,
        qrTableOrders: dayOrders.filter((o) => o.order_type === "qr_dine_in").length,
      });
    }
    return days;
  }, [statsList, filters.dateRange, OPEN_STATUSES]);

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
            {RANGE_PRESETS.map((range) => (
              <button
                key={range.value}
                onClick={() => setPresetRange(range.value)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  activePreset === range.value
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
                  <span className="text-sm font-medium text-muted-foreground">Open</span>
                  <Clock className="h-4 w-4 text-amber-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-amber-600 dark:text-amber-400">{stats.open}</span>
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
                        dataKey="open"
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
