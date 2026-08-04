"use client";

import { Button } from "@/components/ui/button";
import {
  ShoppingCart,
  Users,
  MapPin,
  Building2,
  Utensils,
  CheckCircle,
  AlertCircle,
  Lock,
  QrCode,
  X,
  CircleDollarSign,
  Tag,
} from "lucide-react";
import {
  useLocationStore,
  useSelectedLocation,
  useIsAllLocations,
} from "@/stores/location-store";
import {
  useLocationScopedMenus,
  useLocationScopedMenuItems,
  useLocationScopedSchedules,
} from "./hooks/useLocationScoped";
import { useOrders } from "./hooks/useOrder";
import {
  useOrderAnalytics,
  useFinancialKPIs,
  useWaterfallReport,
  useRevenueByCategoryReport,
  useTransactionVolumeReport,
  useNetCollectedBySourceReport,
  useTaxableRevenueByTenderReport,
} from "./hooks/useOrderAnalytics";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import {
  XAxis,
  YAxis,
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useUnifiedStaff, usePinStatus } from "./hooks/useStaff";
import { DashboardWaterfallCard } from "./components/DashboardWaterfallCard";
import { NetRevenueByCategoryCard } from "./components/NetRevenueByCategoryCard";
import { TransactionVolumeCard } from "./components/TransactionVolumeCard";
import { NetCollectedBySourceCard } from "./components/NetCollectedBySourceCard";
import { TaxableRevenueByTenderCard } from "./components/TaxableRevenueByTenderCard";
import { fillDailyFinancialStats } from "@/lib/reporting/date-range";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { DashboardGreeting } from "./components/DashboardGreeting";
import {
  OverviewRangeTabs,
  resolveOverviewRange,
  type OverviewRange,
} from "./components/OverviewRangeTabs";
import {
  OverviewSection,
  OverviewSplit,
  OverviewSubLabel,
  OverviewListRow,
  OverviewBreakdown,
} from "./components/OverviewSection";

export default function MerchantDashboardPage() {
  const { selectedLocationId, locations } = useLocationStore();
  const selectedLocation = useSelectedLocation();
  const isAllLocations = useIsAllLocations();

  const { data: menus, isLoading: menusLoading } = useLocationScopedMenus();
  const { data: menuItems, isLoading: itemsLoading } =
    useLocationScopedMenuItems();
  const { data: schedules, isLoading: schedulesLoading } =
    useLocationScopedSchedules();
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: staffMembers, isLoading: staffLoading } = useUnifiedStaff();
  const { data: pinStatus } = usePinStatus();
  const [pinBannerDismissed, setPinBannerDismissed] = useState(false);

  // Date ranges for analytics
  const last7Days = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const last30Days = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const now = useMemo(() => new Date(), []);


  // NEW: Use Financial KPIs RPC for more accurate aggregated data
  const { data: kpis7Days, isLoading: kpisLoading7Days } = useFinancialKPIs(
    last7Days,
    now
  );
  const { data: kpis30Days, isLoading: kpisLoading30Days } = useFinancialKPIs(
    last30Days,
    now
  );

  // ---- Financial reports: one shared range drives all five cards, mirroring
  // how the Overview container works. Previously each card had its own window
  // (four hardcoded to 30 days, the treemap with its own dropdown).
  const [financialRange, setFinancialRange] = useState<OverviewRange>("30d");
  const { from: financialFrom, to: financialTo } = useMemo(
    () => resolveOverviewRange(financialRange),
    [financialRange]
  );

  // Waterfall report for dashboard card
  const { data: waterfallReport, isLoading: waterfallLoading } =
    useWaterfallReport(financialFrom, financialTo);

  // Transaction volume report (Credits vs Debits by payment type)
  const { data: transactionVolumeReport, isLoading: transactionVolumeLoading } =
    useTransactionVolumeReport(financialFrom, financialTo);

  // Net Collected by Order Source (TICKET-005)
  const { data: netCollectedBySourceReport, isLoading: netCollectedBySourceLoading } =
    useNetCollectedBySourceReport(financialFrom, financialTo);

  // Taxable Revenue by Tender Type (TICKET-002)
  const { data: taxableRevenueByTenderReport, isLoading: taxableRevenueByTenderLoading } =
    useTaxableRevenueByTenderReport(financialFrom, financialTo);

  const {
    data: revenueByCategoryReport,
    isLoading: revenueByCategoryLoading,
  } = useRevenueByCategoryReport(financialFrom, financialTo);

  // ---- Overview: one shared date range drives every section in the container.
  const [range, setRange] = useState<OverviewRange>("30d");
  const { from: rangeFrom, to: rangeTo } = useMemo(
    () => resolveOverviewRange(range),
    [range]
  );

  const { data: rangeKpis, isLoading: rangeKpisLoading } = useFinancialKPIs(
    rangeFrom,
    rangeTo
  );
  const { data: rangeAnalytics, isLoading: rangeAnalyticsLoading } =
    useOrderAnalytics(rangeFrom, rangeTo);

  const { data: userInfo } = useUserInfo();

  const menusList = Array.isArray(menus) ? menus : [];
  const itemsList = Array.isArray(menuItems) ? menuItems : [];
  const schedulesList = Array.isArray(schedules) ? schedules : [];
  const ordersList = Array.isArray(orders) ? orders : [];

  const activeMenus = menusList.filter((m) => m.is_active).length;
  const activeLocations = locations.filter((l) => l.is_active).length;
  const acceptingOrdersCount = locations.filter(
    (l) => l.is_accepting_orders
  ).length;

  // Growth: last 7 days vs the 7 before them, extracted from the 30-day KPIs.
  // Note this is always a 7-day comparison and does not follow the Overview
  // range picker — the underlying RPC would need a second window to do that.
  const growth = useMemo(() => {
    if (!kpis30Days?.daily_stats) return 0;

    const last14Days = kpis30Days.daily_stats.slice(-14);
    const last7DaysSales = last14Days
      .slice(-7)
      .reduce((sum, item) => sum + item.net_sales, 0);
    const previous7DaysSales = last14Days
      .slice(0, 7)
      .reduce((sum, item) => sum + item.net_sales, 0);

    if (previous7DaysSales === 0) return last7DaysSales > 0 ? 100 : 0;
    return ((last7DaysSales - previous7DaysSales) / previous7DaysSales) * 100;
  }, [kpis30Days]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const orderTypeLabels: Record<string, string> = {
    dine_in: "Dine In",
    qr_dine_in: "QR Table",
    takeout: "Takeout",
    delivery: "Delivery",
    online: "Online",
    catering: "Catering",
  };

  // ---- Overview derived data (all keyed off the shared `range`) ----

  const rangeChartData = useMemo(() => {
    const data = fillDailyFinancialStats(rangeKpis?.daily_stats || [], {
      from: rangeFrom,
      to: rangeTo,
    });
    return data.map((item) => ({
      date: new Date(item.date).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
      }),
      sales: item.net_sales,
    }));
  }, [rangeKpis, rangeFrom, rangeTo]);

  // Palette for the order-type proportion bar. Fixed hues so a type keeps its
  // colour as counts change between ranges.
  const ORDER_TYPE_COLORS: Record<string, string> = {
    dine_in: "#1e40af",
    qr_dine_in: "#0C4FD1",
    takeout: "#3b82f6",
    delivery: "#60a5fa",
    online: "#93c5fd",
    catering: "#bfdbfe",
  };

  const orderTypeItems = useMemo(() => {
    const breakdown = rangeAnalytics?.orderTypeBreakdown;
    if (!breakdown) return [];
    return Object.entries(breakdown)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({
        label: orderTypeLabels[type] || type,
        value: count,
        color: ORDER_TYPE_COLORS[type] || "#94a3b8",
      }));
  }, [rangeAnalytics]);

  // bestSellingItems arrives sorted by revenue desc. "Least selling" is the
  // tail of the same list reversed — only meaningful once there's enough data
  // that the two ends don't overlap.
  const bestSelling = useMemo(
    () => (rangeAnalytics?.bestSellingItems || []).slice(0, 5),
    [rangeAnalytics]
  );

  const leastSelling = useMemo(() => {
    const all = rangeAnalytics?.bestSellingItems || [];
    if (all.length < 10) return [];
    return all.slice(-5).reverse();
  }, [rangeAnalytics]);

  const outOfStockCount = useMemo(
    () => itemsList.filter((i: any) => i.availability === false).length,
    [itemsList]
  );

  // No entrance animation on the root wrapper: `animate-in` applies an
  // animation whose keyframes touch `transform`, which makes the element a
  // containing block for fixed/sticky descendants. That silently breaks the
  // `sticky` range bars in the Overview and Financial reports containers —
  // they'd resolve against this div instead of the page's scroll container and
  // never stick. The fade lives on the greeting hero instead.
  return (
    <div className="dashboard-flat space-y-6">
      {/*
        The dashboard used to stack ~18 bordered, shadowed Cards in one column.
        It now reads as: a greeting hero, then a single "Overview" container
        whose sections are separated by hairlines instead of each being its own
        box. Several of the extracted report cards below don't accept a
        className, so they're de-chromed here via the data-slot the shared Card
        already emits — scoped to this page, leaving the shared Card untouched
        (it's used across dashboard, manage and storefront).
      */}
      <style>{`
        /* --- Report cards as flat sections -------------------------------
           Each card below was built as a standalone box. Inside the shared
           container they must read as sections instead. These rules use
           !important because the card components hardcode Tailwind utilities
           (text-base, border shadow-sm) that otherwise win on specificity —
           and several don't accept a className to override from the parent. */
        .dashboard-flat .overview-shell [data-slot="card"] {
          border: 0 !important;
          box-shadow: none !important;
          background: transparent !important;
          border-radius: 0 !important;
          font-variant-numeric: tabular-nums;
          /* Each report Card IS a direct child of the sections wrapper, so the
             Card's own py-6 lands on the same element as anything the wrapper
             sets — equal specificity, order-dependent. Own the section rhythm
             here instead. An earlier revision zeroed padding here, which is
             what removed the space above the first section. */
          padding-top: 2rem !important;
          padding-bottom: 2rem !important;
        }
        .dashboard-flat .overview-shell [data-slot="card-header"],
        .dashboard-flat .overview-shell [data-slot="card-content"],
        .dashboard-flat .overview-shell [data-slot="card-footer"] {
          padding-left: 0 !important;
          padding-right: 0 !important;
        }

        /* Headings: quiet label, so the figures carry the emphasis. Covers both
           CardTitle and the raw <h3> that TransactionVolumeCard uses. */
        .dashboard-flat .overview-shell [data-slot="card-title"],
        .dashboard-flat .overview-shell [data-slot="card-header"] h3 {
          font-size: 0.9375rem !important;
          font-weight: 600 !important;
          letter-spacing: -0.01em !important;
          color: var(--foreground);
        }
        .dashboard-flat .overview-shell [data-slot="card-description"],
        .dashboard-flat .overview-shell [data-slot="card-header"] p {
          font-size: 0.8125rem !important;
        }

        /* Controls: unify the mixed bag of selects, icon buttons, badges and
           toggles across these cards into one quiet, rounded style. */
        .dashboard-flat .overview-shell button[data-slot="select-trigger"],
        .dashboard-flat .overview-shell [data-slot="card-header"] button {
          border-radius: 9999px;
          font-size: 0.8125rem;
        }
        .dashboard-flat .overview-shell [data-slot="badge"] {
          border-radius: 9999px;
          font-weight: 500;
        }

        /* Callout / note strips (Top channel, Discrepancy, Balanced, Note:):
           keep the coloured icon + text, drop the box around it. */
        .dashboard-flat .overview-shell [class*="bg-blue-50"][class*="border-blue"],
        .dashboard-flat .overview-shell [class*="bg-amber-50"][class*="border-amber"],
        .dashboard-flat .overview-shell [class*="bg-emerald-50"][class*="border-emerald"] {
          background: transparent !important;
          border: 0 !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
        }

        /* Waterfall total rows (Net Collected / Net Revenue): the tinted
           gradient pill with a border reads as yet another box. Keep the row,
           lose the chrome — weight alone marks it as a total. */
        .dashboard-flat .overview-shell [class*="from-primary/5"] {
          background: transparent !important;
          background-image: none !important;
          border: 0 !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        /* Non-total rows align to the same left edge now that the pill is gone. */
        .dashboard-flat .overview-shell [data-slot="collapsible-trigger"] {
          padding-left: 0 !important;
          padding-right: 0 !important;
        }

        /* Breathing room between a section's header and its body — the legend
           row was sitting flush under "Net Revenue by Category". The cards set
           their own pb-* on the header; neutralise it and let the card's flex
           gap (set above) own the spacing so it's consistent everywhere. */
        .dashboard-flat .overview-shell [data-slot="card-header"] {
          padding-bottom: 0 !important;
        }
        .dashboard-flat .overview-shell [data-slot="card"] {
          gap: 1.5rem;
        }
      `}</style>

      {/* Greeting hero. The page's entrance fade lives here rather than on the
          root wrapper — see the note there on sticky containing blocks. */}
      <div className="animate-in fade-in duration-500">
        <DashboardGreeting
          name={userInfo?.name}
          weekRevenue={kpis7Days?.summary?.net_sales || 0}
          isLoading={kpisLoading7Days}
          outOfStockCount={outOfStockCount}
        />
      </div>

      {/* PIN setup banner — shown when user has POS assignments but no PIN yet */}
      {!pinBannerDismissed &&
        pinStatus &&
        pinStatus.locationCount > 0 &&
        !pinStatus.hasPinSet && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <Lock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Set up your POS PIN
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                You have access to {pinStatus.locationCount} location
                {pinStatus.locationCount !== 1 ? "s" : ""} but no POS PIN is
                set. Add one so you can sign in at the terminal.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/staff">Set PIN</Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-amber-600 hover:text-amber-800 dark:text-amber-400"
              onClick={() => setPinBannerDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

      {/* ================= OVERVIEW ================= */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {isAllLocations ? (
              <>
                <Building2 className="h-4 w-4" />
                All {locations.length} location
                {locations.length !== 1 ? "s" : ""}
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4" />
                {selectedLocation?.name || "Unknown Location"}
              </>
            )}
          </p>
        </div>

        {/* No `overflow-hidden` — it would clip the sticky range bar. */}
        <div className="rounded-2xl border bg-card">
          {/* Sticky within this container only: the bar rides down as the
              Overview scrolls, then releases once the section ends. */}
          {/* Translucent + blurred so content dissolves as it scrolls under,
              rather than cutting off at a hard edge. The `after` strip hangs a
              short fade below the bar to soften the transition further. */}
          <div className="sticky -top-4 sm:-top-6 z-20 rounded-t-2xl bg-card/80 backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:from-card/80 after:to-transparent">
            <OverviewRangeTabs value={range} onChange={setRange} />
          </div>

          {/* Net sales + trend */}
          <OverviewSection
            icon={CircleDollarSign}
            label="Net sales"
            value={
              <span className="flex flex-wrap items-baseline gap-x-3">
                {formatCurrency(rangeKpis?.summary?.net_sales || 0)}
                {growth !== 0 && (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      growth > 0 ? "text-emerald-600" : "text-rose-600"
                    )}
                  >
                    {growth > 0 ? "+" : ""}
                    {growth.toFixed(1)}%
                    <span className="ml-1 font-normal text-muted-foreground">
                      vs. previous 7 days
                    </span>
                  </span>
                )}
              </span>
            }
            isLoading={rangeKpisLoading}
            href="/dashboard/reports"
            divider
          >
            {rangeChartData.length > 0 ? (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={rangeChartData}
                    margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="overviewSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis hide domain={[0, "auto"]} />
                    <Tooltip
                      formatter={(v) => formatCurrency(Number(v))}
                      labelStyle={{ fontSize: 12 }}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#overviewSales)"
                      baseValue={0}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No sales in this period
              </p>
            )}

            {orderTypeItems.length > 0 && (
              <div className="mt-6">
                <OverviewSubLabel>By order type</OverviewSubLabel>
                <OverviewBreakdown items={orderTypeItems} />
              </div>
            )}
          </OverviewSection>

          {/* Total orders */}
          <OverviewSection
            icon={ShoppingCart}
            label="Total orders"
            value={
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {rangeAnalytics?.totalOrders ?? 0}
                <span className="text-sm font-normal tracking-normal text-muted-foreground">
                  {formatCurrency(rangeAnalytics?.avgOrderValue || 0)} avg
                </span>
              </span>
            }
            isLoading={rangeAnalyticsLoading}
            href="/dashboard/orders"
          >
            <div>
              <OverviewSubLabel>Recent orders</OverviewSubLabel>
              {ordersLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : ordersList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders yet</p>
              ) : (
                <div>
                  {ordersList.slice(0, 5).map((order) => (
                    <OverviewListRow
                      key={order.id}
                      href="/dashboard/orders"
                      title={
                        <span className="flex items-center gap-2">
                          #{order.display_number || order.order_number}
                          {order.order_type === "qr_dine_in" && (
                            <QrCode className="h-3.5 w-3.5 shrink-0 text-[#0C4FD1]" />
                          )}
                          <span className="text-muted-foreground capitalize">
                            {order.status}
                          </span>
                        </span>
                      }
                      meta={
                        orderTypeLabels[order.order_type] ||
                        order.order_type.replace("_", " ")
                      }
                      trailing={formatCurrency(order.total_amount)}
                    />
                  ))}
                </div>
              )}
            </div>
          </OverviewSection>

          {/* Items */}
          <OverviewSection
            icon={Tag}
            label="Items"
            href="/dashboard/menu"
            linkLabel="View menu"
          >
            <OverviewSplit>
              <div>
                <OverviewSubLabel>Best selling items</OverviewSubLabel>
                {bestSelling.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No sales in this period
                  </p>
                ) : (
                  <div>
                    {bestSelling.map((item) => (
                      <OverviewListRow
                        key={item.item_name}
                        title={item.item_name}
                        meta={`${item.quantity} sold`}
                        trailing={formatCurrency(item.revenue)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <OverviewSubLabel>Least selling items</OverviewSubLabel>
                {leastSelling.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Not enough data
                  </p>
                ) : (
                  <div>
                    {leastSelling.map((item) => (
                      <OverviewListRow
                        key={item.item_name}
                        title={item.item_name}
                        meta={`${item.quantity} sold`}
                        trailing={formatCurrency(item.revenue)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </OverviewSplit>
          </OverviewSection>

          {/* Menus & schedules */}
          <OverviewSection
            icon={Utensils}
            label="Menus & schedules"
            value={activeMenus}
            isLoading={menusLoading}
            href="/dashboard/menu"
            linkLabel="View all"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{menusList.length} total menus</span>
              <span aria-hidden="true">·</span>
              <span>{itemsList.length} items</span>
              <span aria-hidden="true">·</span>
              <span>{schedulesList.length} schedules</span>
            </div>
          </OverviewSection>

          {/* Locations or team */}
          {isAllLocations ? (
            <OverviewSection
              icon={MapPin}
              label="Locations"
              value={locations.length}
              href="/dashboard/locations"
              linkLabel="Manage"
            >
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  {activeLocations} active
                </span>
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-500">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {locations.length - activeLocations} inactive
                </span>
                <span className="text-muted-foreground">
                  {acceptingOrdersCount} accepting orders
                </span>
              </div>
            </OverviewSection>
          ) : (
            <OverviewSection
              icon={Users}
              label="Team members"
              value={staffMembers?.length ?? 0}
              isLoading={staffLoading}
              href="/dashboard/staff"
              linkLabel="Manage"
            >
              <p className="text-sm text-muted-foreground">
                {staffMembers?.length
                  ? "At this location"
                  : "No team members yet"}
              </p>
            </OverviewSection>
          )}
        </div>
      </div>

      {/* ================= FINANCIAL REPORTS ================= */}
      <div>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">
          Financial reports
        </h2>

        {/* One container, sections divided by hairlines — same treatment as
            Overview. Each child card is de-chromed by the .overview-shell
            rules so its own border/shadow doesn't nest inside this one.
            Note: no `overflow-hidden` here — it would clip the sticky range
            bar below. The rounded corners are clipped by the inner wrapper. */}
        <div className="overview-shell rounded-2xl border bg-card">
          {/* Sticks to the top of the viewport while the section scrolls past,
              so the active range stays visible and changeable throughout. */}
          {/* Translucent + blurred so content dissolves as it scrolls under,
              rather than cutting off at a hard edge. The `after` strip hangs a
              short fade below the bar to soften the transition further. */}
          <div className="sticky -top-4 sm:-top-6 z-20 rounded-t-2xl bg-card/80 backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:from-card/80 after:to-transparent">
            <OverviewRangeTabs
              value={financialRange}
              onChange={setFinancialRange}
            />
          </div>

          <div className="[&>*]:border-t [&>*]:border-border/60 [&>*:first-child]:border-t-0 [&>*]:px-6">

      {/* Net Revenue by Category Tree Map */}
      <NetRevenueByCategoryCard
        report={revenueByCategoryReport}
        isLoading={revenueByCategoryLoading}
      />

      {/* Transaction Volume Analysis (Credits vs Debits) */}
      <TransactionVolumeCard
        report={transactionVolumeReport}
        isLoading={transactionVolumeLoading}
      />

      {/* Net Collected by Channel (TICKET-005) */}
      <NetCollectedBySourceCard
        report={netCollectedBySourceReport}
        isLoading={netCollectedBySourceLoading}
      />

      {/* Taxable Revenue by Tender Type (TICKET-002) */}
      <TaxableRevenueByTenderCard
        report={taxableRevenueByTenderReport}
        isLoading={taxableRevenueByTenderLoading}
      />

      {/* Waterfall Report / Net Collect Statement */}
      <DashboardWaterfallCard
        report={waterfallReport}
        isLoading={waterfallLoading}
      />
          </div>
        </div>
      </div>
    </div>
  );
}
