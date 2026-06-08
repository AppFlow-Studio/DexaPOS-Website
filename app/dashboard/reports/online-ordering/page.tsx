"use client";

import { useState } from "react";
import { subDays, format } from "date-fns";
import {
  Bar,
  BarChart,
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { useOnlineOrderingAnalytics } from "../../hooks/useOrderAnalytics";
import { useReportingQueryRange } from "@/app/dashboard/hooks/useReportingDateRange";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Truck,
  CheckCircle,
  XCircle,
  Ban,
} from "lucide-react";
import type { PlatformSummary } from "../../actions/online-ordering-analytics";

const PLATFORM_COLORS: Record<string, string> = {
  doordash: "hsl(0, 80%, 55%)",
  ubereats: "hsl(140, 70%, 40%)",
  grubhub: "hsl(25, 90%, 50%)",
  postmates: "hsl(210, 80%, 55%)",
  default: "hsl(var(--primary))",
};

const PLATFORM_LABELS: Record<string, string> = {
  doordash: "DoorDash",
  ubereats: "Uber Eats",
  uber_eats: "Uber Eats",
  grubhub: "Grubhub",
  postmates: "Postmates",
  seamless: "Seamless",
  caviar: "Caviar",
};

function getPlatformLabel(platform: string): string {
  return PLATFORM_LABELS[platform.toLowerCase()] || platform.charAt(0).toUpperCase() + platform.slice(1);
}

function getPlatformColor(platform: string): string {
  return PLATFORM_COLORS[platform.toLowerCase()] || PLATFORM_COLORS.default;
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

// ============================================================================
// Summary Cards
// ============================================================================

function PlatformOverviewCards({
  totalRevenue,
  totalOrders,
  platforms,
  isLoading,
  isError,
}: {
  totalRevenue: number;
  totalOrders: number;
  platforms: PlatformSummary[];
  isLoading: boolean;
  isError?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="flex items-center justify-center h-24">
              <p className="text-sm text-muted-foreground">Failed to load</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const topPlatform = platforms[0];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Online Revenue
          </CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(totalRevenue)}
          </div>
          <p className="text-xs text-muted-foreground">
            Across all platforms
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Online Orders
          </CardTitle>
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalOrders}</div>
          <p className="text-xs text-muted-foreground">
            Total orders received
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Avg Order Value
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(avgOrderValue)}
          </div>
          <p className="text-xs text-muted-foreground">Per online order</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Top Platform</CardTitle>
          <Truck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {topPlatform ? getPlatformLabel(topPlatform.platform) : "N/A"}
          </div>
          <p className="text-xs text-muted-foreground">
            {topPlatform
              ? `${formatCurrency(topPlatform.totalRevenue)} revenue`
              : "No data yet"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Platform Comparison Bar Chart
// ============================================================================

function PlatformComparisonChart({
  platforms,
}: {
  platforms: PlatformSummary[];
}) {
  if (!platforms.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revenue by Platform</CardTitle>
          <CardDescription>No online ordering data available.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const chartData = platforms.map((p) => ({
    platform: getPlatformLabel(p.platform),
    revenue: Number(p.totalRevenue.toFixed(2)),
    orders: p.totalOrders,
    fill: getPlatformColor(p.platform),
  }));

  const chartConfig = Object.fromEntries(
    platforms.map((p) => [
      getPlatformLabel(p.platform),
      { label: getPlatformLabel(p.platform), color: getPlatformColor(p.platform) },
    ])
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue by Platform</CardTitle>
        <CardDescription>
          Compare revenue across delivery channels
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-[16/9] w-full h-[300px]"
        >
          <BarChart data={chartData} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="platform" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
            />
            <Bar dataKey="revenue" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Individual Platform Detail Card
// ============================================================================

function PlatformDetailCard({
  summary,
  dailyTrends,
}: {
  summary: PlatformSummary;
  dailyTrends: { date: string; orders: number; revenue: number }[];
}) {
  const color = getPlatformColor(summary.platform);

  const chartConfig = {
    revenue: { label: "Revenue", color },
    orders: { label: "Orders", color },
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {getPlatformLabel(summary.platform)}
              <Badge variant="outline">{summary.totalOrders} orders</Badge>
            </CardTitle>
            <CardDescription>
              {formatCurrency(summary.totalRevenue)} total revenue
            </CardDescription>
          </div>
          <div className="flex gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              {summary.acceptedOrders}
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5 text-red-500" />
              {summary.rejectedOrders}
            </span>
            <span className="flex items-center gap-1">
              <Ban className="h-3.5 w-3.5 text-yellow-500" />
              {summary.cancelledOrders}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-xs text-muted-foreground">Avg Order Value</p>
            <p className="text-lg font-semibold">
              {formatCurrency(summary.avgOrderValue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Delivery Fees</p>
            <p className="text-lg font-semibold">
              {formatCurrency(summary.totalDeliveryFees)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Service Fees</p>
            <p className="text-lg font-semibold">
              {formatCurrency(summary.totalServiceFees)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tips Received</p>
            <p className="text-lg font-semibold">
              {formatCurrency(summary.totalTips)}
            </p>
          </div>
        </div>

        {dailyTrends.length > 0 && (
          <ChartContainer
            config={chartConfig}
            className="aspect-[16/7] w-full h-[200px]"
          >
            <AreaChart data={dailyTrends} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent />}
              />
              <defs>
                <linearGradient
                  id={`fill-${summary.platform}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <Area
                dataKey="revenue"
                type="monotone"
                fill={`url(#fill-${summary.platform})`}
                fillOpacity={0.4}
                stroke={color}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function OnlineOrderingReportsPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_30_days");
  const queryDateRange = useReportingQueryRange(dateRange);

  const { data, isLoading, isError } = useOnlineOrderingAnalytics(
    queryDateRange.from,
    queryDateRange.to
  );

  const platforms = data?.platforms || [];
  const dailyTrends = data?.dailyTrends || {};

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) {
      setDateRange({ from, to });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Online Ordering Channels
          </h2>
          <p className="text-muted-foreground">
            Revenue and performance across DoorDash, Uber Eats, Grubhub, and
            other delivery platforms
          </p>
        </div>
        <div>
          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={handleDateRangeChange}
            preset={preset}
            onPresetChange={setPreset}
          />
        </div>
      </div>

      <PlatformOverviewCards
        totalRevenue={data?.totalOnlineRevenue || 0}
        totalOrders={data?.totalOnlineOrders || 0}
        platforms={platforms}
        isLoading={isLoading}
        isError={isError}
      />

      {/* Tabs: Overview vs per-platform detail */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {platforms.map((p) => (
            <TabsTrigger key={p.platform} value={p.platform}>
              {getPlatformLabel(p.platform)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <PlatformComparisonChart platforms={platforms} />

          {platforms.length === 0 && !isLoading && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Truck className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">
                  No Online Orders Yet
                </h3>
                <p className="text-sm text-muted-foreground text-center max-w-md mt-1">
                  Once you connect delivery platforms through OrderOut,
                  per-platform revenue and order data will appear here.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {platforms.map((p) => (
          <TabsContent key={p.platform} value={p.platform}>
            <PlatformDetailCard
              summary={p}
              dailyTrends={dailyTrends[p.platform] || []}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
