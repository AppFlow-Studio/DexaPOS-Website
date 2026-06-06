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
      <div className="h-full p-6 flex flex-col justify-between">
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-3">
            <Skeleton className="h-10 w-48 rounded-lg" />
            <Skeleton className="h-5 w-32 rounded" />
          </div>
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
        <Skeleton className="flex-1 w-full rounded-xl" />
        <div className="flex justify-center gap-2 mt-4">
          {timeRanges.map((_, i) => (
            <Skeleton key={i} className="h-8 w-12 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  // No data state
  if (!data || data.length === 0) {
    return (
      <div className="h-full flex flex-col justify-center items-center p-12">
        <div className="bg-muted p-4 rounded-full mb-4">
          <Minus className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No Data Available</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          There is no financial data to display for the selected time range.
          Try adjusting the filters.
        </p>
      </div>
    );
  }

  const isPositiveTrend = trendPercentage > 0;
  const isNegativeTrend = trendPercentage < 0;
  const isNeutralTrend = trendPercentage === 0;

  return (
    <div className="h-full flex flex-col p-6">
        {/* Header with Hero Value and Metric Switcher */}
        <div className="flex flex-col sm:flex-row items-start sm:justify-between mb-4 gap-3 shrink-0">
          <div>
            {/* Hero Value */}
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2 tabular-nums leading-none">
              {formatValue(totalValue, config.format)}
            </h2>

            {/* Trend Indicator */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                  isPositiveTrend && "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
                  isNegativeTrend && "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400",
                  isNeutralTrend && "bg-muted text-muted-foreground"
                )}
              >
                {isPositiveTrend && (
                  <TrendingUp className="h-3 w-3" />
                )}
                {isNegativeTrend && (
                  <TrendingDown className="h-3 w-3" />
                )}
                {isNeutralTrend && <Minus className="h-3 w-3" />}
                <span>
                  {isPositiveTrend ? "+" : ""}
                  {trendPercentage.toFixed(1)}%
                </span>
              </div>
              <span className="text-xs text-muted-foreground/60">
                vs. previous period
              </span>
            </div>
          </div>

          {/* Metric Switcher */}
          <Select
            value={activeMetric}
            onValueChange={(v) => setActiveMetric(v as MetricType)}
          >
            <SelectTrigger className="w-full sm:w-[150px] h-9 bg-muted/50 border-border/60 rounded-lg text-sm font-medium">
              <SelectValue placeholder="Select metric" />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              <SelectItem value="net_sales">Net Sales</SelectItem>
              <SelectItem value="gross_sales">Gross Revenue</SelectItem>
              <SelectItem value="order_count">Total Orders</SelectItem>
              <SelectItem value="payments_collected">Payments</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Chart */}
        <div className="flex-1 w-full min-h-0 relative">

          <ChartContainer config={chartConfig} className="h-full w-full">
            <AreaChart
              data={data}
              margin={{ left: 0, right: 0, top: 10, bottom: 50 }}
              style={{ overflow: "visible" }}
            >
              <defs>
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
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="80%"
                    stopColor={config.color}
                    stopOpacity={0.02}
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
                strokeDasharray="4 4"
                strokeOpacity={0.08}
                stroke="currentColor"
                className="text-border"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={16}
                minTickGap={60}
                tickFormatter={(value) => {
                  const date = parseISO(value);
                  return format(date, "MMM d");
                }}
                className="text-[11px] fill-muted-foreground/60"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={70}
                domain={[0, "auto"]}
                padding={{ top: 20, bottom: 10 }}
                tickFormatter={(value) =>
                  formatCompactValue(value, config.format)
                }
                className="text-[11px] fill-muted-foreground/60"
              />
              <ChartTooltip
                cursor={{
                  stroke: config.color,
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                  strokeOpacity: 0.3,
                }}
                content={
                  <ChartTooltipContent
                    className="shadow-md rounded-lg min-w-[180px]"
                    labelFormatter={(value) =>
                      format(parseISO(value), "MMM d, yyyy")
                    }
                    formatter={(value, name) => (
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: config.color }}
                        />
                        <span className="text-sm text-muted-foreground">
                          {config.label}
                        </span>
                        <span className="text-sm font-medium ml-auto tabular-nums">
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
                baseValue={0}
                fill={`url(#${config.gradientId})`}
                stroke={config.color}
                strokeWidth={2}
                animationDuration={800}
                animationEasing="ease-out"
                activeDot={{
                  r: 4,
                  fill: "white",
                  stroke: config.color,
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ChartContainer>
        </div>

        {/* Time Range Selector */}
        <div className="flex justify-center mt-3 shrink-0">
          <div className="flex bg-muted/50 p-1 rounded-lg gap-0.5">
            {timeRanges.map((range) => (
              <button
                key={range.value}
                onClick={() => handleTimeRangeChange(range.value)}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-medium transition-colors",
                  activeTimeRange === range.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
    </div>
  );
}
