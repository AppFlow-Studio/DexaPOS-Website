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
import { useOrderAnalytics, useOrderStats } from "./hooks/useOrderAnalytics";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { useUnifiedStaff } from "./hooks/useStaff";

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

  const menusList = Array.isArray(menus) ? menus : [];
  const itemsList = Array.isArray(menuItems) ? menuItems : [];
  const schedulesList = Array.isArray(schedules) ? schedules : [];
  const ordersList = Array.isArray(orders) ? orders : [];

  const activeMenus = menusList.filter((m) => m.is_active).length;
  const activeLocations = locations.filter((l) => l.is_active).length;
  const acceptingOrdersCount = locations.filter(
    (l) => l.is_accepting_orders
  ).length;

  // Calculate today's stats
  const todayStats = useMemo(() => {
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
  }, [ordersList]);

  // Calculate growth (comparing last 7 days to previous 7 days)
  const growth = useMemo(() => {
    if (!analytics7Days || !analytics30Days) return 0;

    const currentPeriod = analytics7Days.salesByDate.reduce(
      (sum, item) => sum + item.sales,
      0
    );
    const previousPeriodStart = new Date(last7Days);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - 7);
    const previousPeriodEnd = last7Days;

    // For simplicity, we'll calculate growth from 30-day data
    const last14Days = analytics30Days.salesByDate.slice(-14);
    const last7DaysSales = last14Days
      .slice(-7)
      .reduce((sum, item) => sum + item.sales, 0);
    const previous7DaysSales = last14Days
      .slice(0, 7)
      .reduce((sum, item) => sum + item.sales, 0);

    if (previous7DaysSales === 0) return currentPeriod > 0 ? 100 : 0;
    return ((last7DaysSales - previous7DaysSales) / previous7DaysSales) * 100;
  }, [analytics7Days, analytics30Days, last7Days]);

  // Prepare chart data for revenue trend
  const revenueChartData = useMemo(() => {
    if (!analytics7Days?.salesByDate) return [];
    return analytics7Days.salesByDate.map((item) => ({
      date: new Date(item.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      sales: item.sales,
    }));
  }, [analytics7Days]);

  // Chart configuration
  const chartConfig = {
    sales: {
      label: "Sales",
      color: "var(--chart-1)",
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

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{ animationDelay: "0ms" }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading7Days ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(
                  analytics7Days?.salesByDate?.reduce(
                    (sum, item) => sum + item.sales,
                    0
                  ) || 0
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Last 7 days</p>
            {analytics7Days?.salesByDate && revenueChartData.length > 0 && (
              <div className="mt-3 ">
                <ChartContainer config={chartConfig}>
                  <LineChart
                    accessibilityLayer
                    data={revenueChartData}
                    margin={{
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={4}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={4}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => `$${value.toFixed(0)}`}
                      width={35}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent hideLabel />}
                    />
                    <Line
                      dataKey="sales"
                      type="natural"
                      stroke="var(--color-sales)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card
          className="transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{ animationDelay: "50ms" }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orders Today</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{todayStats.orders}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {todayStats.completed} completed
            </p>
          </CardContent>
        </Card>
        <Card
          className="transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{ animationDelay: "100ms" }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isAllLocations ? "Active Locations" : "Team Members"}
            </CardTitle>
            {isAllLocations ? (
              <MapPin className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Users className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            {staffLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {isAllLocations ? activeLocations : staffMembers?.length}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {isAllLocations
                ? `${acceptingOrdersCount} accepting orders`
                : staffMembers?.length
                ? "At this location"
                : "No team members"}
            </p>
          </CardContent>
        </Card>
        <Card
          className="transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{ animationDelay: "150ms" }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Growth</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading7Days ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div
                className={cn(
                  "text-2xl font-bold",
                  growth > 0
                    ? "text-green-600"
                    : growth < 0
                    ? "text-red-600"
                    : "text-muted-foreground"
                )}
              >
                {growth > 0 ? "+" : ""}
                {growth.toFixed(1)}%
              </div>
            )}
            <p className="text-xs text-muted-foreground">
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
                <Skeleton className="h-[200px] w-full" />
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
                      />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent hideLabel />}
                      />
                      <Line
                        dataKey="sales"
                        type="natural"
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
                <Skeleton className="h-[200px] w-full" />
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

      {/* Recent Activity */}
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
    </div>
  );
}
