"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  ShoppingCart,
  Users,
  TrendingUp,
  MapPin,
  Building2,
  Utensils,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertCircle,
  Lock,
  X,
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
  useOrderStats,
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
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useUnifiedStaff, usePinStatus } from "./hooks/useStaff";
import { DashboardWaterfallCard } from "./components/DashboardWaterfallCard";
import {
  NetRevenueByCategoryCard,
  type DateRangeOption,
} from "./components/NetRevenueByCategoryCard";
import { TransactionVolumeCard } from "./components/TransactionVolumeCard";
import { NetCollectedBySourceCard } from "./components/NetCollectedBySourceCard";
import { TaxableRevenueByTenderCard } from "./components/TaxableRevenueByTenderCard";

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
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

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

  // Fetch analytics data
  const { data: analytics7Days, isLoading: analyticsLoading7Days } =
    useOrderAnalytics(last7Days, now);
  const { data: analytics30Days, isLoading: analyticsLoading30Days } =
    useOrderAnalytics(last30Days, now);
  const { data: stats7Days } = useOrderStats(last7Days, now);
  const { data: stats30Days } = useOrderStats(last30Days, now);

  // NEW: Use Financial KPIs RPC for more accurate aggregated data
  const { data: kpis7Days, isLoading: kpisLoading7Days } = useFinancialKPIs(
    last7Days,
    now
  );
  const { data: kpis30Days, isLoading: kpisLoading30Days } = useFinancialKPIs(
    last30Days,
    now
  );

  // Waterfall report for dashboard card
  const { data: waterfallReport, isLoading: waterfallLoading } =
    useWaterfallReport(last30Days, now);

  // Transaction volume report (Credits vs Debits by payment type)
  const { data: transactionVolumeReport, isLoading: transactionVolumeLoading } =
    useTransactionVolumeReport(last30Days, now);

  // Net Collected by Order Source (TICKET-005)
  const { data: netCollectedBySourceReport, isLoading: netCollectedBySourceLoading } =
    useNetCollectedBySourceReport(last30Days, now);

  // Taxable Revenue by Tender Type (TICKET-002)
  const { data: taxableRevenueByTenderReport, isLoading: taxableRevenueByTenderLoading } =
    useTaxableRevenueByTenderReport(last30Days, now);

  // Revenue by Category tree map
  const [categoryDateRange, setCategoryDateRange] =
    useState<DateRangeOption>("7d");

  const categoryDateFrom = useMemo(() => {
    const date = new Date();
    const days = categoryDateRange === "7d" ? 7 : categoryDateRange === "30d" ? 30 : 90;
    date.setDate(date.getDate() - days);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [categoryDateRange]);

  const {
    data: revenueByCategoryReport,
    isLoading: revenueByCategoryLoading,
  } = useRevenueByCategoryReport(categoryDateFrom, now);

  const menusList = Array.isArray(menus) ? menus : [];
  const itemsList = Array.isArray(menuItems) ? menuItems : [];
  const schedulesList = Array.isArray(schedules) ? schedules : [];
  const ordersList = Array.isArray(orders) ? orders : [];

  const activeMenus = menusList.filter((m) => m.is_active).length;
  const activeLocations = locations.filter((l) => l.is_active).length;
  const acceptingOrdersCount = locations.filter(
    (l) => l.is_accepting_orders
  ).length;

  // Calculate today's stats - use KPIs if available for consistency
  const todayStats = useMemo(() => {
    if (kpis7Days?.daily_stats) {
      const todayStr = today.toISOString().split("T")[0];
      const todayMatch = kpis7Days.daily_stats.find((d) =>
        d.date.startsWith(todayStr)
      );

      return {
        revenue: todayMatch?.net_sales || 0,
        orders: todayMatch?.order_count || 0,
        completed: todayMatch?.order_count || 0,
      };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayOrders = ordersList.filter((order) => {
      const orderDate = new Date(order.created_at);
      return orderDate >= todayStart && orderDate <= todayEnd;
    });

    const completedToday = todayOrders.filter((o) => o.status === "completed");
    const revenueToday = completedToday.reduce(
      (sum, o) => sum + Number(o.total_amount || 0),
      0
    );
    const ordersToday = todayOrders.length;

    return {
      revenue: revenueToday,
      orders: ordersToday,
      completed: completedToday.length,
    };
  }, [ordersList, kpis7Days, today]);

  // Calculate growth (comparing last 7 days to previous 7 days)
  const growth = useMemo(() => {
    // Current period revenue
    const currentPeriod = kpis7Days?.summary?.net_sales || 0;

    // We already have 7-day KPIs. For growth, we ideally want the 7 days before those.
    // But since we have 30 days, we can extract the previous period from there.
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
  }, [kpis7Days, kpis30Days]);

  // Prepare chart data for revenue trend
  const revenueChartData = useMemo(() => {
    const data = kpis7Days?.daily_stats || [];
    if (data.length === 0) return [];

    return data.map((item) => ({
      date: new Date(item.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      sales: item.net_sales,
    }));
  }, [kpis7Days]);

  // Chart configuration
  const chartConfig = {
    sales: {
      label: "Revenue",
      color: "#3b82f6",
    },
  } satisfies ChartConfig;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header with Location Context */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground flex items-center gap-2">
            {isAllLocations ? (
              <>
                <Building2 className="h-4 w-4" />
                Viewing all {locations.length} location
                {locations.length !== 1 ? "s" : ""}
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4" />
                Viewing {selectedLocation?.name || "Unknown Location"}
              </>
            )}
          </p>
        </div>
        {selectedLocation && (
          <div className="flex items-center gap-2">
            <Badge
              variant={selectedLocation.is_active ? "default" : "secondary"}
            >
              {selectedLocation.is_active ? "Active" : "Inactive"}
            </Badge>
            <Badge
              variant={
                selectedLocation.is_accepting_orders ? "default" : "outline"
              }
              className={
                selectedLocation.is_accepting_orders ? "bg-green-600" : ""
              }
            >
              {selectedLocation.is_accepting_orders
                ? "Accepting Orders"
                : "Not Accepting"}
            </Badge>
          </div>
        )}
      </div>

      {/* Location Quick Info (when viewing specific location) */}
      {/* {selectedLocation && (
                <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent animate-in fade-in slide-in-from-top-2 duration-300">
                    <CardContent className="py-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <MapPin className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">{selectedLocation.name}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {selectedLocation.city}, {selectedLocation.state}
                                    </p>
                                </div>
                            </div>
                            <Button variant="outline" asChild>
                                <Link href="/dashboard/locations">
                                    Manage Location
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )} */}

      {/* PIN setup banner — shown when user has POS assignments but no PIN yet */}
      {!pinBannerDismissed &&
        pinStatus &&
        pinStatus.locationCount > 0 &&
        !pinStatus.hasPinSet && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
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

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="relative overflow-hidden border-none shadow-lg transition-all hover:shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{ animationDelay: "0ms" }}
        >
          <div className="absolute inset-0  from-blue-600/10 via-transparent to-transparent opacity-50" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Total Revenue
            </CardTitle>
            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            {kpisLoading7Days ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold tracking-tight">
                {formatCurrency(kpis7Days?.summary?.net_sales || 0)}
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-muted-foreground">Last 7 days</p>
              {growth !== 0 && (
                <Badge
                  variant={growth > 0 ? "default" : "destructive"}
                  className={cn(
                    "text-[10px] h-4 px-1 leading-none",
                    growth > 0 && "bg-emerald-500 hover:bg-emerald-600"
                  )}
                >
                  {growth > 0 ? "+" : ""}
                  {growth.toFixed(1)}%
                </Badge>
              )}
            </div>

            {revenueChartData.length > 0 && (
              <div className="mt-4  w-full overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={revenueChartData}
                    margin={{ left: 0, right: 0, top: 5, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorSales"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#3b82f6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3b82f6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <YAxis
                      hide
                      domain={[0, "auto"]}
                      padding={{ top: 10, bottom: 10 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorSales)"
                      baseValue={0}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card
          className="relative overflow-hidden border-none shadow-lg transition-all hover:shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{ animationDelay: "50ms" }}
        >
          <div className="absolute inset-0  from-emerald-600/10 via-transparent to-transparent opacity-50" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Orders Today
            </CardTitle>
            <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <ShoppingCart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            {ordersLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold tracking-tight">
                {todayStats.orders}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {todayStats.completed}
              </span>{" "}
              completed
            </p>
          </CardContent>
        </Card>
        <Card
          className="relative overflow-hidden border-none shadow-lg transition-all hover:shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{ animationDelay: "100ms" }}
        >
          <div className="absolute inset-0  from-purple-600/10 via-transparent to-transparent opacity-50" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {isAllLocations ? "Active Locations" : "Team Members"}
            </CardTitle>
            <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              {isAllLocations ? (
                <MapPin className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              ) : (
                <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              )}
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            {staffLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold tracking-tight">
                {isAllLocations ? activeLocations : staffMembers?.length}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {isAllLocations
                ? `${acceptingOrdersCount} accepting orders`
                : staffMembers?.length
                ? "At this location"
                : "No team members"}
            </p>
          </CardContent>
        </Card>
        <Card
          className="relative overflow-hidden border-none shadow-lg transition-all hover:shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{ animationDelay: "150ms" }}
        >
          <div className="absolute inset-0  from-orange-600/10 via-transparent to-transparent opacity-50" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Growth
            </CardTitle>
            <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            {kpisLoading7Days ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div
                className={cn(
                  "text-3xl font-bold tracking-tight",
                  growth > 0
                    ? "text-emerald-600"
                    : growth < 0
                    ? "text-rose-600"
                    : "text-muted-foreground"
                )}
              >
                {growth > 0 ? "+" : ""}
                {growth.toFixed(1)}%
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Last 7 days vs previous
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions / Summaries */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Menus Summary */}
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Utensils className="h-4 w-4" />
                Menus
              </CardTitle>
              <CardDescription>Your active menus</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/menu">
                View All
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {menusLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ) : menusList.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                <p>No menus created yet</p>
                <Button variant="link" className="p-0 h-auto" asChild>
                  <Link href="/dashboard/menu">Create your first menu</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{activeMenus}</span>
                  <span className="text-sm text-muted-foreground">
                    active menus
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">{menusList.length} total</Badge>
                  <Badge variant="outline">{itemsList.length} items</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Schedules Summary */}
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Schedules
              </CardTitle>
              <CardDescription>Menu availability schedules</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/schedules">
                View All
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {schedulesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ) : schedulesList.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                <p>No schedules created yet</p>
                <Button variant="link" className="p-0 h-auto" asChild>
                  <Link href="/dashboard/schedules">Create a schedule</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">
                    {schedulesList.length}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    schedules
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Controlling menu availability
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Locations Summary (only in all-locations view) */}
        {isAllLocations ? (
          <Card className="transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Locations
                </CardTitle>
                <CardDescription>Your business locations</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/locations">
                  Manage
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {locations.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  <p>No locations added yet</p>
                  <Button variant="link" className="p-0 h-auto" asChild>
                    <Link href="/dashboard/locations/new">
                      Add your first location
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">
                      {locations.length}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      locations
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      <span>{activeLocations} active</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>{locations.length - activeLocations} inactive</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Staff Summary (when viewing specific location) */
          <Card className="transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Team
                </CardTitle>
                <CardDescription>Staff at this location</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/staff">
                  Manage
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {staffLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : staffMembers?.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  <p>No team members</p>
                  <Button variant="link" className="p-0 h-auto" asChild>
                    <Link href="/dashboard/staff">Add a team member</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">
                      {staffMembers?.length}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      team members
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sales Analytics Section */}
      {analytics7Days && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Revenue Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue Trend</CardTitle>
              <CardDescription>Last 7 days sales performance</CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsLoading7Days ? (
                <Skeleton className=" w-full" />
              ) : revenueChartData.length > 0 ? (
                <div className="">
                  <ChartContainer config={chartConfig}>
                    <LineChart
                      accessibilityLayer
                      data={revenueChartData}
                      margin={{
                        left: 12,
                        right: 12,
                        top: 12,
                        bottom: 12,
                      }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                        domain={[0, "auto"]}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent hideLabel />}
                      />
                      <Line
                        dataKey="sales"
                        type="monotone"
                        stroke="var(--color-sales)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ChartContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No sales data available
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Type Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Types</CardTitle>
              <CardDescription>Distribution by order type</CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsLoading7Days ? (
                <Skeleton className=" w-full" />
              ) : analytics7Days.orderTypeBreakdown ? (
                <div className="space-y-3">
                  {Object.entries(analytics7Days.orderTypeBreakdown).map(
                    ([type, count]) => {
                      if (count === 0) return null;
                      const total = Object.values(
                        analytics7Days.orderTypeBreakdown
                      ).reduce((sum, c) => sum + c, 0);
                      const percentage = total > 0 ? (count / total) * 100 : 0;
                      const typeLabels: Record<string, string> = {
                        dine_in: "Dine In",
                        takeout: "Takeout",
                        delivery: "Delivery",
                        online: "Online",
                        catering: "Catering",
                      };
                      return (
                        <div key={type} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">
                              {typeLabels[type] || type}
                            </span>
                            <span className="text-muted-foreground">
                              {count} ({percentage.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    }
                  )}
                  {Object.values(analytics7Days.orderTypeBreakdown).every(
                    (c) => c === 0
                  ) && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No orders in this period
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No order data available
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Net Revenue by Category Tree Map */}
      <NetRevenueByCategoryCard
        report={revenueByCategoryReport}
        isLoading={revenueByCategoryLoading}
        dateRange={categoryDateRange}
        onDateRangeChange={setCategoryDateRange}
      />

      {/* Best Selling Items */}
      {analytics7Days?.bestSellingItems &&
        analytics7Days.bestSellingItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Best Selling Items</CardTitle>
              <CardDescription>
                Top items by revenue (last 7 days)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analytics7Days.bestSellingItems
                  .slice(0, 5)
                  .map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded-lg border"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="w-6 h-6 flex items-center justify-center p-0"
                        >
                          {index + 1}
                        </Badge>
                        <span className="font-medium text-sm">
                          {item.item_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">
                          {item.quantity} sold
                        </span>
                        <span className="font-semibold text-sm">
                          {formatCurrency(item.revenue)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

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

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Orders</CardTitle>
          <CardDescription>
            {isAllLocations
              ? "Latest orders across all locations"
              : `Latest orders at ${selectedLocation?.name}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : ordersList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No orders yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Orders will appear here as you process them
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {ordersList.slice(0, 5).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        Order #{order.display_number || order.order_number}
                      </span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {order.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(order.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {formatCurrency(order.total_amount)}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {order.order_type.replace("_", " ")}
                    </p>
                  </div>
                </div>
              ))}
              {ordersList.length > 5 && (
                <div className="pt-2">
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/dashboard/orders">
                      View All Orders
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Waterfall Report / Net Collect Statement */}
      <DashboardWaterfallCard
        report={waterfallReport}
        isLoading={waterfallLoading}
      />
    </div>
  );
}
// 