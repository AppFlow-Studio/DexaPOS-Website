"use client";

import React, { useState, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ============================================================================
// Types
// ============================================================================

type MetricType =
  | "net_sales"
  | "gross_sales"
  | "order_count"
  | "payments_collected";
type TimeRangeType = "1d" | "7d" | "30d" | "90d" | "180d" | "365d" | "all";

interface DailyDataPoint {
  date: string;
  net_sales: number;
  gross_sales: number;
  order_count: number;
  payments_collected: number;
}

interface FinancialHeroChartProps {
  data: DailyDataPoint[];
  isLoading?: boolean;
  onTimeRangeChange?: (range: TimeRangeType) => void;
  defaultTimeRange?: TimeRangeType;
}

// ============================================================================
// Configuration
// ============================================================================

const metricConfig: Record<
  MetricType,
  {
    label: string;
    shortLabel: string;
    format: "currency" | "number";
    color: string;
    gradientId: string;
  }
> = {
  net_sales: {
    label: "Net Sales",
    shortLabel: "Net",
    format: "currency",
    color: "#3B82F6", // Blue
    gradientId: "netSalesGradient",
  },
  gross_sales: {
    label: "Gross Revenue",
    shortLabel: "Gross",
    format: "currency",
    color: "#8B5CF6", // Violet
    gradientId: "grossSalesGradient",
  },
  order_count: {
    label: "Total Orders",
    shortLabel: "Orders",
    format: "number",
    color: "#10B981", // Emerald
    gradientId: "ordersGradient",
  },
  payments_collected: {
    label: "Payments Collected",
    shortLabel: "Payments",
    format: "currency",
    color: "#F59E0B", // Amber
    gradientId: "paymentsGradient",
  },
};

const timeRanges: { value: TimeRangeType; label: string }[] = [
  { value: "7d", label: "1w" },
  { value: "30d", label: "1m" },
  { value: "90d", label: "3m" },
  { value: "180d", label: "6m" },
  { value: "365d", label: "1y" },
  { value: "all", label: "All" },
];

const chartConfig = {
  net_sales: {
    label: "Net Sales",
    color: "#3B82F6",
  },
  gross_sales: {
    label: "Gross Revenue",
    color: "#8B5CF6",
  },
  order_count: {
    label: "Total Orders",
    color: "#10B981",
  },
  payments_collected: {
    label: "Payments Collected",
    color: "#F59E0B",
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function formatValue(value: number, format: "currency" | "number"): string {
  if (format === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatCompactValue(
  value: number,
  format: "currency" | "number"
): string {
  if (format === "currency") {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

// ============================================================================
// Component
// ============================================================================

export function FinancialHeroChart({
  data,
  isLoading,
  onTimeRangeChange,
  defaultTimeRange = "7d",
}: FinancialHeroChartProps) {
  const [activeMetric, setActiveMetric] = useState<MetricType>("net_sales");
  // Use prop directly - parent controls the time range
  const activeTimeRange = defaultTimeRange;

  const config = metricConfig[activeMetric];

  // Calculate totals and trend
  const { totalValue, trendPercentage, trendValue, previousTotal } =
    useMemo(() => {
      if (!data || data.length === 0) {
        return {
          totalValue: 0,
          trendPercentage: 0,
          trendValue: 0,
          previousTotal: 0,
        };
      }

      const total = data.reduce((sum, d) => sum + (d[activeMetric] || 0), 0);

      // Calculate previous period for comparison
      const halfPoint = Math.floor(data.length / 2);
      const currentPeriod = data.slice(halfPoint);
      const previousPeriod = data.slice(0, halfPoint);

      const currentTotal = currentPeriod.reduce(
        (sum, d) => sum + (d[activeMetric] || 0),
        0
      );
      const prevTotal = previousPeriod.reduce(
        (sum, d) => sum + (d[activeMetric] || 0),
        0
      );

      const trend =
        prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : 0;
      const trendVal = currentTotal - prevTotal;

      return {
        totalValue: total,
        trendPercentage: trend,
        trendValue: trendVal,
        previousTotal: prevTotal,
      };
    }, [data, activeMetric]);

  const handleTimeRangeChange = (range: TimeRangeType) => {
    onTimeRangeChange?.(range);
  };

  // Loading state
  if (isLoading) {
    return (
      <Card className="border-none shadow-lg bg-gradient-to-br from-card via-card to-muted/20 backdrop-blur overflow-hidden">
        <CardContent className="pt-6 pb-4">
          <div className="flex items-start justify-between mb-6">
            <div className="space-y-2">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-9 w-36" />
          </div>
          <Skeleton className="h-[300px] w-full rounded-xl" />
          <div className="flex justify-center gap-2 mt-4">
            {timeRanges.map((_, i) => (
              <Skeleton key={i} className="h-8 w-10 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!data || data.length === 0) {
    return (
      <Card className="border-none shadow-lg bg-gradient-to-br from-card via-card to-muted/20 backdrop-blur">
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">
            No data available for the selected period.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isPositiveTrend = trendPercentage > 0;
  const isNegativeTrend = trendPercentage < 0;
  const isNeutralTrend = trendPercentage === 0;

  return (
    <Card className="border-none shadow-lg bg-gradient-to-br from-card via-card to-muted/20 backdrop-blur overflow-hidden">
      <CardContent className="pt-6 pb-4">
        {/* Header with Hero Value and Metric Switcher */}
        <div className="flex items-start justify-between mb-2">
          <div>
            {/* Hero Value */}
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight font-mono tabular-nums">
              {formatValue(totalValue, config.format)}
            </h2>

            {/* Trend Indicator */}
            <div className="flex items-center gap-2 mt-2">
              <div
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-medium",
                  isPositiveTrend && "bg-emerald-500/10 text-emerald-600",
                  isNegativeTrend && "bg-red-500/10 text-red-600",
                  isNeutralTrend && "bg-muted text-muted-foreground"
                )}
              >
                {isPositiveTrend && <TrendingUp className="h-3.5 w-3.5" />}
                {isNegativeTrend && <TrendingDown className="h-3.5 w-3.5" />}
                {isNeutralTrend && <Minus className="h-3.5 w-3.5" />}
                <span>
                  {isPositiveTrend ? "+" : ""}
                  {formatCompactValue(Math.abs(trendValue), config.format)}
                </span>
                <span className="text-xs opacity-75">
                  ({isPositiveTrend ? "+" : ""}
                  {trendPercentage.toFixed(1)}%)
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                vs. previous period
              </span>
            </div>
          </div>

          {/* Metric Switcher */}
          <Select
            value={activeMetric}
            onValueChange={(v) => setActiveMetric(v as MetricType)}
          >
            <SelectTrigger className="w-[180px] h-9 bg-muted/50 border-none">
              <SelectValue placeholder="Select metric" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="net_sales">Net Sales</SelectItem>
              <SelectItem value="gross_sales">Gross Revenue</SelectItem>
              <SelectItem value="order_count">Total Orders</SelectItem>
              <SelectItem value="payments_collected">
                Payments Collected
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Chart */}
        <div className="mt-6">
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <AreaChart
              data={data}
              margin={{ left: 0, right: 0, top: 20, bottom: 0 }}
            >
              <defs>
                {/* Dynamic gradient based on active metric */}
                <linearGradient
                  id={config.gradientId}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={config.color}
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="50%"
                    stopColor={config.color}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="100%"
                    stopColor={config.color}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                strokeOpacity={0.1}
                stroke="currentColor"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                minTickGap={40}
                tickFormatter={(value) => {
                  const date = parseISO(value);
                  return format(date, "MMM d");
                }}
                className="text-[10px] fill-muted-foreground uppercase tracking-wider"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={60}
                tickFormatter={(value) =>
                  formatCompactValue(value, config.format)
                }
                className="text-[10px] fill-muted-foreground"
              />
              <ChartTooltip
                cursor={{
                  stroke: config.color,
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                  strokeOpacity: 0.5,
                }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      format(parseISO(value), "EEEE, MMM d, yyyy")
                    }
                    formatter={(value, name) => (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {config.label}
                        </span>
                        <span className="font-mono font-bold">
                          {formatValue(Number(value), config.format)}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Area
                dataKey={activeMetric}
                type="monotone"
                fill={`url(#${config.gradientId})`}
                stroke={config.color}
                strokeWidth={2.5}
                activeDot={{
                  r: 6,
                  fill: config.color,
                  stroke: "var(--background)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ChartContainer>
        </div>

        {/* Time Range Pills */}
        <div className="flex justify-center gap-1 mt-4">
          {timeRanges.map((range) => (
            <button
              key={range.value}
              onClick={() => handleTimeRangeChange(range.value)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                activeTimeRange === range.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {range.label}
            </button>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-center text-muted-foreground/50 mt-4">
          Data displayed is based on completed orders. Past performance may
          vary.
        </p>
      </CardContent>
    </Card>
  );
}
