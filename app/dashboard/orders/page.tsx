"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { useOrderOverview, useOrdersPage } from "../hooks/useOrder";
import { isOrderReportable } from "@/lib/reporting/recognized-order";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingBag,
  Clock,
  CheckCircle,
  CircleDollarSign,
  QrCode,
  Calendar,
  RefreshCcwDot,
  BarChart3,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { OrdersDataTable } from "@/components/dashboard/orders/OrdersDataTable";
import {
  OrderResponse,
  OrderStatus,
  OrderSortField,
  OrderType,
  PaymentMethod,
  OrderFilters,
} from "@/types/order-management";
import { OrderDetailSheet } from "@/components/dashboard/orders/OrderDetailSheet";
import { Empty } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { OrderFilters as OrderFiltersComponent } from "@/components/dashboard/orders/OrderFilters";
import { OverviewLinkButton } from "../components/OverviewSection";
import { ORDER_STATUS_GROUPS } from "@/lib/constants/order-status";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";

import { cn } from "@/lib/utils";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { buildPaginationMeta } from "@/lib/pagination";
import { useDebounce } from "@/lib/hooks/useDebounce";

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedPage = Number(searchParams.get("page"));
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1;
  const pageSize = 25;
  const [orderSearch, setOrderSearch] = useState("");
  const debouncedOrderSearch = useDebounce(orderSearch, 300);
  const [orderSorting, setOrderSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);

  // Parse filters from URL
  const filters: OrderFilters = useMemo(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status")?.split(",") as OrderStatus[];
    const type = searchParams.get("type")?.split(",") as OrderType[];
    const payment = searchParams.get("payment")?.split(",") as PaymentMethod[];
    const source = searchParams.get("source")?.split(",").filter(Boolean);
    const platform = searchParams.get("platform")?.split(",").filter(Boolean);
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
      orderSource: source?.length ? source : undefined,
      deliveryPlatform: platform?.length ? platform : undefined,
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

  const activeSort = orderSorting[0];
  const sortBy: OrderSortField =
    activeSort?.id === "order_display"
      ? "display_number"
      : activeSort?.id === "status" || activeSort?.id === "total_amount"
        ? activeSort.id
        : "created_at";

  const {
    data: orderResult,
    isLoading: isLoadingOrders,
    isFetching: isFetchingOrders,
    refetch: refetchOrders,
  } = useOrdersPage(filters, {
    page,
    pageSize,
    search: debouncedOrderSearch,
    sortBy,
    sortDirection: activeSort?.desc === false ? "asc" : "desc",
  });

  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(
    null
  );
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const ordersList = orderResult?.data ?? [];
  const pagination =
    orderResult?.pagination ?? buildPaginationMeta(0, { page, pageSize });

  // Stats dataset: same date-range + location as the table, but NOT narrowed by the
  // table's status/type/payment chips. This keeps the KPI cards a stable glance metric
  // that reconciles with the table (Open == open-group rows under the same scope).
  const statsFilters = useMemo(
    () => ({ dateRange: filters.dateRange }),
    [filters.dateRange]
  );
  const { data: statsOrders, isLoading: isLoadingStats } = useOrderOverview(
    statsFilters.dateRange,
  );
  const statsList = useMemo(
    () => (Array.isArray(statsOrders) ? statsOrders : []),
    [statsOrders],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextPage <= 1) params.delete("page");
      else params.set("page", String(nextPage));
      const query = params.toString();
      router.replace(query ? `/dashboard/orders?${query}` : "/dashboard/orders", {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const handleOrderSearchChange = useCallback(
    (value: string) => {
      setOrderSearch(value);
      setPage(1);
    },
    [setPage],
  );

  const handleOrderSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      setOrderSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.slice(0, 1);
      });
      setPage(1);
    },
    [setPage],
  );

  useEffect(() => {
    if (orderResult && page > orderResult.pagination.totalPages) {
      setPage(orderResult.pagination.totalPages);
    }
  }, [orderResult, page, setPage]);

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
    params.delete("page");
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

  // Plain-text window shown beside the preset pills, mirroring the dashboard's
  // Overview range bar ("Jul 01 – Jul 30"). Derived from the same URL-backed
  // dateRange the presets and the table's DateRangePicker both write.
  const rangeSummary = useMemo(() => {
    const { from, to } = filters.dateRange ?? {};
    if (!from && !to) return "All time";

    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });

    if (from && to) {
      const fromDay = new Date(from);
      const toDay = new Date(to);
      return fromDay.toDateString() === toDay.toDateString()
        ? fmt(fromDay)
        : `${fmt(fromDay)} – ${fmt(toDay)}`;
    }
    return from ? `From ${fmt(new Date(from))}` : `Until ${fmt(new Date(to!))}`;
  }, [filters.dateRange]);

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

  // The five glance metrics, described as data so every tile renders through one
  // markup path — colors stay on the reference's blue-led ramp rather than each
  // tile inventing its own hue.
  const KPI_TILES = useMemo(
    () => [
      {
        key: "orders",
        label: "Total orders",
        icon: ShoppingBag,
        value: stats.total,
        dataKey: "orders",
        color: "#0C4FD1",
        caption: null as string | null,
      },
      {
        key: "open",
        label: "Open",
        icon: Clock,
        value: stats.open,
        dataKey: "open",
        color: "#f59e0b",
        caption: null as string | null,
      },
      {
        key: "completed",
        label: "Completed",
        icon: CheckCircle,
        value: stats.completed,
        dataKey: "completed",
        color: "#10b981",
        caption: null as string | null,
      },
      {
        key: "revenue",
        label: "Revenue",
        icon: CircleDollarSign,
        value: revenueFormatter.format(stats.revenue),
        dataKey: "revenue",
        color: "#0d9488",
        caption: null as string | null,
      },
      {
        key: "qr",
        label: "QR table",
        icon: QrCode,
        value: stats.qrTableOrders,
        dataKey: "qrTableOrders",
        color: "#6366f1",
        caption: stats.topQrTable
          ? `Most active: ${stats.topQrTable}`
          : "No QR table orders",
      },
    ],
    [stats, revenueFormatter]
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
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">
            Orders
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View and manage all orders across your locations
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <OverviewLinkButton href="/dashboard/orders/analytics">
            <BarChart3 className="mr-0.5 h-4 w-4" />
            Analytics
          </OverviewLinkButton>
          <OverviewLinkButton href="/dashboard/orders/reports">
            <FileText className="mr-0.5 h-4 w-4" />
            Reports
          </OverviewLinkButton>
        </div>
      </div>

      {/* Overview: one bordered container, hairline-divided rows — the same
          shell the dashboard Overview uses, so both pages read as one system. */}
      <div className="rounded-3xl border bg-card">
        {/* Range bar: pill tabs on the left, resolved window on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-6 py-4">
          <div className="flex items-center gap-0.5 rounded-full bg-muted/70 p-1">
            {RANGE_PRESETS.map((range) => (
              <button
                key={range.value}
                type="button"
                onClick={() => setPresetRange(range.value)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors",
                  activePreset === range.value
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {rangeSummary}
          </div>
        </div>

        {/* KPI tiles. No rules anywhere — not between the tiles, and none
            splitting them off from the range bar above. Whitespace alone does
            the separating, leaving the container's rounded outline as the only
            edge on the block. */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-6 px-2 pb-6 xl:grid-cols-5">
          {KPI_TILES.map((tile) => (
            // min-w-0: without it the grid track floors at its content's
            // intrinsic width, so a wide figure like "$2,674.53" pushes past
            // the column instead of the text scaling down inside it.
            <div key={tile.key} className="min-w-0 px-4">
              {isLoadingStats ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <>
                  {/* Section label in the brand blue, as on the reference. */}
                  <div className="flex items-center gap-2 text-[0.9375rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                    <tile.icon className="h-[1.0625rem] w-[1.0625rem] shrink-0" />
                    <span className="truncate">{tile.label}</span>
                  </div>

                  {/* Currency runs much wider than the plain counts, so the
                      figure steps down a size on narrow columns and returns to
                      the reference's 2rem once the tiles go single-file. */}
                  <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <span className="min-w-0 max-w-full truncate text-[1.625rem] font-medium leading-tight tracking-[-0.02em] tabular-nums sm:text-[2rem]">
                      {tile.value}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {rangeLabel}
                    </span>
                  </div>

                  {tile.caption && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {tile.caption}
                    </p>
                  )}

                  <div className="mt-4 h-12">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={dailyData}
                        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id={`ordersKpiGrad-${tile.key}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={tile.color}
                              stopOpacity={0.22}
                            />
                            <stop
                              offset="100%"
                              stopColor={tile.color}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey={tile.dataKey}
                          stroke={tile.color}
                          strokeWidth={2}
                          fill={`url(#ordersKpiGrad-${tile.key})`}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* All Orders. Same single-frame treatment as the Overview: one rounded
          container, nothing inside it drawing its own box. */}
      <div className="rounded-3xl border bg-card px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[1.0625rem] font-semibold">All Orders</h2>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer rounded-full text-muted-foreground hover:text-foreground"
            onClick={async () => await refetchOrders()}
          >
            <RefreshCcwDot className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <OrderFiltersComponent className="mt-4 w-full" />

        <div className="mt-4">
          {isLoadingOrders && ordersList.length === 0 ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : ordersList.length === 0 && !orderSearch ? (
            <Empty
              icon={ShoppingBag}
              title={"No orders found"}
              description={"Try adjusting your filters to see more results."}
            />
          ) : (
            <OrdersDataTable
              data={ordersList}
              isLoading={isFetchingOrders}
              onOrderClick={handleOrderClick}
              serverPaginated
              searchValue={orderSearch}
              onSearchChange={handleOrderSearchChange}
              searchPlaceholder="Search order number or customer..."
              sortingValue={orderSorting}
              onSortingChange={handleOrderSortingChange}
            />
          )}
          <PaginationBar
            pagination={pagination}
            onPageChange={setPage}
            isLoading={isFetchingOrders}
            itemLabel="orders"
          />
        </div>
      </div>

      {/* Order Detail Sheet */}
      <OrderDetailSheet
        order={selectedOrder}
        open={isDetailOpen && !!selectedOrder}
        onOpenChange={handleDetailClose}
      />
    </main>
  );
}
