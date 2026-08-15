"use client";

import { useMemo, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { subDays } from "date-fns";
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
  ReportPanel as Card,
  ReportPanelContent as CardContent,
  ReportPanelDescription as CardDescription,
  ReportPanelHeader as CardHeader,
  ReportPanelTitle as CardTitle,
} from "@/components/dashboard/reports/ReportPanel";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollableTabsBar } from "@/components/dashboard/ScrollableTabsBar";
import { Badge } from "@/components/ui/badge";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { useOnlineOrderingAnalytics } from "../../hooks/useOrderAnalytics";
import { useReportingQueryRange } from "@/app/dashboard/hooks/useReportingDateRange";
import { DollarSign, ShoppingCart, TrendingUp, Truck, Ban } from "lucide-react";
import { PageHeader, PageShell, Panel, StatRow, StatTile } from "@/components/dashboard/shell";
import type { PlatformSummary } from "../../actions/online-ordering-analytics";
import {
  getPlatformLabel,
  getPlatformColor,
  PLATFORM_DISPLAY_ORDER,
  type PlatformSlug,
} from "@/lib/orderout/platform";
import { formatCurrency } from "@/lib/utils";

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Inverse of parseDateParam: serialize a Date to a local "YYYY-MM-DD" string
// (local components, not UTC, so the day never shifts across timezones).
function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Synthetic tab value for the "All platforms" view (real slugs never collide).
const ALL_PLATFORMS = "__all__";

// Zero-filled summary so a fixed tab can render even with no orders in range.
function emptyPlatformSummary(platform: PlatformSlug): PlatformSummary {
  return {
    platform,
    totalOrders: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
    totalServiceCharges: 0,
    totalTips: 0,
    totalDiscounts: 0,
    cancelledOrders: 0,
  };
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
      <Panel padded>
        <StatRow columns={4}>
          {[1, 2, 3, 4].map((i) => <StatTile key={i} label="Loading" value="" isLoading />)}
        </StatRow>
      </Panel>
    );
  }

  if (isError) {
    return (
      <Panel padded>
        <StatRow columns={4}>
          {[1, 2, 3, 4].map((i) => <StatTile key={i} label="Unavailable" value="—" meta="Failed to load" />)}
        </StatRow>
      </Panel>
    );
  }

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const topPlatform = platforms
    .slice()
    .sort((a, b) => b.totalRevenue - a.totalRevenue)[0];

  return (
    <Panel padded>
      <StatRow columns={4}>
        <StatTile label="Online Revenue" value={formatCurrency(totalRevenue)} meta="Across selected platforms" icon={<DollarSign />} />
        <StatTile label="Online Orders" value={totalOrders.toLocaleString()} meta="Total orders received" icon={<ShoppingCart />} />
        <StatTile label="Avg Order Value" value={formatCurrency(avgOrderValue)} meta="Per online order" icon={<TrendingUp />} />
        <StatTile
          label="Top Platform"
          value={topPlatform ? getPlatformLabel(topPlatform.platform) : "N/A"}
          meta={topPlatform ? `${formatCurrency(topPlatform.totalRevenue)} revenue` : "No data yet"}
          icon={<Truck />}
        />
      </StatRow>
    </Panel>
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
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
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
          {summary.cancelledOrders > 0 && (
            <div className="flex gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                {summary.cancelledOrders} cancelled
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 grid min-w-0 grid-cols-2 gap-4 md:grid-cols-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Avg Order Value</p>
            <p className="truncate text-lg font-semibold tabular-nums">
              {formatCurrency(summary.avgOrderValue)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Service Charges</p>
            <p className="truncate text-lg font-semibold tabular-nums">
              {formatCurrency(summary.totalServiceCharges)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Tips Received</p>
            <p className="truncate text-lg font-semibold tabular-nums">
              {formatCurrency(summary.totalTips)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Discounts</p>
            <p className="truncate text-lg font-semibold tabular-nums">
              {formatCurrency(summary.totalDiscounts)}
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
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
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

function OnlineOrderingReportsContent() {
  // The platform tab, date range, and preset all persist across the report via
  // the URL (?platform=grubhub&from=2026-03-01&to=2026-07-01&preset=custom) so
  // they survive reloads and are shareable/bookmarkable. Absent params fall
  // back to the defaults (last 30 days / All).
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ---- Platform tab (absence of param === "All") ----
  const platformParam = searchParams.get("platform");
  const selectedPlatform: string =
    platformParam && (PLATFORM_DISPLAY_ORDER as string[]).includes(platformParam)
      ? platformParam
      : ALL_PLATFORMS;

  // ---- Date range + preset ----
  const dateRange = useMemo(() => {
    const from = parseDateParam(searchParams.get("from"));
    const to = parseDateParam(searchParams.get("to"));
    if (from && to) return { from, to };
    return { from: subDays(new Date(), 30), to: new Date() };
  }, [searchParams]);

  const preset = (searchParams.get("preset") as DatePreset) || "last_30_days";

  // Single helper so platform and date writes share one param set and don't
  // clobber each other. Multiple mutations in the same tick — e.g. the picker's
  // Apply calls onDateRangeChange AND onPresetChange synchronously — are
  // buffered onto one URLSearchParams and flushed once on a microtask, so they
  // compose into a single router.replace instead of overwriting each other.
  const pendingParamsRef = useRef<URLSearchParams | null>(null);
  const updateParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      if (!pendingParamsRef.current) {
        pendingParamsRef.current = new URLSearchParams(searchParams.toString());
        queueMicrotask(() => {
          const params = pendingParamsRef.current!;
          pendingParamsRef.current = null;
          const query = params.toString();
          router.replace(query ? `${pathname}?${query}` : pathname, {
            scroll: false,
          });
        });
      }
      mutate(pendingParamsRef.current);
    },
    [router, pathname, searchParams]
  );

  const setSelectedPlatform = useCallback(
    (next: string) => {
      updateParams((p) => {
        if (next === ALL_PLATFORMS) p.delete("platform");
        else p.set("platform", next);
      });
    },
    [updateParams]
  );

  const setPreset = useCallback(
    (next: DatePreset) => {
      updateParams((p) => p.set("preset", next));
    },
    [updateParams]
  );

  const queryDateRange = useReportingQueryRange(dateRange);

  const { data, isLoading, isError } = useOnlineOrderingAnalytics(
    queryDateRange.from,
    queryDateRange.to
  );

  const allPlatforms = useMemo(() => data?.platforms ?? [], [data]);
  const dailyTrends = data?.dailyTrends || {};

  // Lookup of the platforms that actually have data this range.
  const platformsBySlug = useMemo(
    () => new Map(allPlatforms.map((p) => [p.platform, p])),
    [allPlatforms]
  );
  const hasAnyData = allPlatforms.length > 0;

  // A platform filter selection re-scopes EVERY figure on the report. Because
  // all platforms are fetched in one query, filtering is a client-side slice —
  // instant, and the "All" view still reconciles to the headline total.
  //
  // For a specific platform we render even when it has no orders in range
  // (zero-filled), so the fixed tab set stays consistent and never dead-ends.
  const scopedPlatforms = useMemo(() => {
    if (selectedPlatform === ALL_PLATFORMS) return allPlatforms;
    const slug = selectedPlatform as PlatformSlug;
    return [platformsBySlug.get(slug) ?? emptyPlatformSummary(slug)];
  }, [allPlatforms, platformsBySlug, selectedPlatform]);

  const scopedRevenue = useMemo(
    () => scopedPlatforms.reduce((sum, p) => sum + p.totalRevenue, 0),
    [scopedPlatforms]
  );
  const scopedOrders = useMemo(
    () => scopedPlatforms.reduce((sum, p) => sum + p.totalOrders, 0),
    [scopedPlatforms]
  );

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) {
      updateParams((p) => {
        p.set("from", formatDateParam(from));
        p.set("to", formatDateParam(to));
      });
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Online Ordering Channels"
        subtitle="Revenue and performance across DoorDash, Uber Eats, Grubhub, and other delivery platforms"
        backHref="/dashboard/reports"
        backLabel="Back to Reports"
        actions={
          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={handleDateRangeChange}
            preset={preset}
            onPresetChange={setPreset}
          />
        }
      />

      {/* Platform filter — fixed canonical tab set, re-scopes all figures
          below. Always rendered (once past the initial load) even with zero
          orders this range, so the control is stable and a platform-scoped
          view — e.g. arrived via ?platform=grubhub — always has a way back to
          "All". Matches the AC's fixed All / DoorDash / Uber Eats / Grubhub /
          First-party / Other set. */}
      {!isLoading && (
        <Tabs
          value={selectedPlatform}
          onValueChange={setSelectedPlatform}
          className="w-full"
        >
          <ScrollableTabsBar activeValue={selectedPlatform}>
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            <TabsTrigger className="shrink-0 whitespace-nowrap rounded-full px-4 py-2" value={ALL_PLATFORMS}>All</TabsTrigger>
            {PLATFORM_DISPLAY_ORDER.map((slug) => (
              <TabsTrigger className="shrink-0 whitespace-nowrap rounded-full px-4 py-2" key={slug} value={slug}>
                {getPlatformLabel(slug)}
              </TabsTrigger>
            ))}
          </TabsList>
          </ScrollableTabsBar>
        </Tabs>
      )}

      <PlatformOverviewCards
        totalRevenue={scopedRevenue}
        totalOrders={scopedOrders}
        platforms={scopedPlatforms}
        isLoading={isLoading}
        isError={isError}
      />

      {/* Overview comparison + per-platform detail for the scoped set. */}
      <div className="space-y-4">
        {selectedPlatform === ALL_PLATFORMS && (
          <PlatformComparisonChart platforms={scopedPlatforms} />
        )}

        {scopedPlatforms.map((p) => (
          <PlatformDetailCard
            key={p.platform}
            summary={p}
            dailyTrends={dailyTrends[p.platform] || []}
          />
        ))}

        {!hasAnyData && !isLoading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Truck className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No Online Orders Yet</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mt-1">
                Once you receive online orders — through your storefront or a
                connected delivery platform — per-platform revenue and order
                data will appear here.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}

// useSearchParams() requires a Suspense boundary so the route isn't de-opted to
// fully client-side rendering at build time.
export default function OnlineOrderingReportsPage() {
  return (
    <Suspense fallback={null}>
      <OnlineOrderingReportsContent />
    </Suspense>
  );
}
