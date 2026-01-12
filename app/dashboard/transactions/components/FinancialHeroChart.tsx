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
      <Card className="border-none shadow-none bg-transparent h-full">
        <CardContent className="p-0 h-full flex flex-col justify-between">
          <div className="flex items-start justify-between mb-6">
            <div className="space-y-4">
              <Skeleton className="h-14 w-64 rounded-xl" />
              <Skeleton className="h-6 w-32 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
          <Skeleton className="h-[400px] w-full rounded-2xl" />
          <div className="flex justify-center gap-2 mt-6">
            {timeRanges.map((_, i) => (
              <Skeleton key={i} className="h-8 w-12 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!data || data.length === 0) {
    return (
      <Card className="border-none shadow-none bg-transparent h-full">
        <CardContent className="h-full flex flex-col justify-center items-center p-12 lg:p-24 border border-dashed border-gray-200 rounded-3xl bg-gray-50/50">
          <div className="bg-gray-100 p-4 rounded-full mb-4">
            <Minus className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            No Data Available
          </h3>
          <p className="text-muted-foreground text-center max-w-sm">
            There is no financial data to display for the selected time range.
            Try adjusting the filters.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isPositiveTrend = trendPercentage > 0;
  const isNegativeTrend = trendPercentage < 0;
  const isNeutralTrend = trendPercentage === 0;

  return (
    <Card className="border-none shadow-sm bg-white rounded-[32px] overflow-hidden h-full ring-1 ring-gray-100/80">
      <CardContent className="p-8 h-full flex flex-col">
        {/* Header with Hero Value and Metric Switcher */}
        <div className="flex items-start justify-between mb-8 shrink-0">
          <div>
            {/* Hero Value */}
            <h2 className="text-5xl md:text-[64px] font-bold tracking-tight text-[#111827] mb-4 font-mono leading-none">
              {formatValue(totalValue, config.format)}
            </h2>

            {/* Trend Indicator */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold shadow-sm ring-1 ring-black/5",
                  isPositiveTrend &&
                    "bg-emerald-50 text-emerald-600 ring-emerald-100",
                  isNegativeTrend && "bg-rose-50 text-rose-600 ring-rose-100",
                  isNeutralTrend && "bg-gray-50 text-gray-600 ring-gray-200"
                )}
              >
                {isPositiveTrend && (
                  <TrendingUp className="h-4 w-4 stroke-[3px]" />
                )}
                {isNegativeTrend && (
                  <TrendingDown className="h-4 w-4 stroke-[3px]" />
                )}
                {isNeutralTrend && <Minus className="h-4 w-4 stroke-[3px]" />}
                <span>
                  {isPositiveTrend ? "+" : ""}
                  {formatCompactValue(Math.abs(trendValue), config.format)}
                </span>
                <span className="opacity-80">
                  ({isPositiveTrend ? "+" : ""}
                  {trendPercentage.toFixed(1)}%)
                </span>
              </div>
              <span className="text-sm text-gray-400 font-medium tracking-wide">
                vs. previous period
              </span>
            </div>
          </div>

          {/* Metric Switcher (Pill Style) */}
          <Select
            value={activeMetric}
            onValueChange={(v) => setActiveMetric(v as MetricType)}
          >
            <SelectTrigger className="w-[160px] h-[40px] bg-gray-50/80 border-none rounded-full text-sm font-semibold hover:bg-gray-100 transition-all focus:ring-2 focus:ring-offset-2 focus:ring-indigo-100 text-gray-700">
              <SelectValue placeholder="Select metric" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-xl p-2 min-w-[180px]">
              <SelectItem value="net_sales" className="rounded-lg font-medium">
                Net Sales
              </SelectItem>
              <SelectItem
                value="gross_sales"
                className="rounded-lg font-medium"
              >
                Gross Revenue
              </SelectItem>
              <SelectItem
                value="order_count"
                className="rounded-lg font-medium"
              >
                Total Orders
              </SelectItem>
              <SelectItem
                value="payments_collected"
                className="rounded-lg font-medium"
              >
                Payments
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Chart */}
        <div className="flex-1 w-full min-h-[400px] relative pb-4">
          {/* Fade Overlay for Left Side */}
          <div className="absolute left-0 top-0 bottom-8 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />

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
                strokeDasharray="0 0"
                strokeOpacity={0.06}
                stroke="#000000"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={24}
                minTickGap={60}
                tickFormatter={(value) => {
                  const date = parseISO(value);
                  return format(date, "MMM d");
                }}
                className="text-[11px] font-bold fill-gray-400 uppercase tracking-widest"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                width={80}
                domain={[0, "auto"]}
                padding={{ top: 20, bottom: 20 }}
                tickFormatter={(value) =>
                  formatCompactValue(value, config.format)
                }
                className="text-[11px] font-bold fill-gray-400"
              />
              <ChartTooltip
                cursor={{
                  stroke: config.color,
                  strokeWidth: 2,
                  strokeDasharray: "4 4",
                  strokeOpacity: 0.5,
                }}
                content={
                  <ChartTooltipContent
                    className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.12)] bg-white/95 backdrop-blur-xl rounded-2xl p-4 px-5 min-w-[200px]"
                    labelFormatter={(value) =>
                      format(parseISO(value), "MMMM d, yyyy")
                    }
                    formatter={(value, name) => (
                      <div className="flex items-center gap-3 mt-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full ring-4 ring-opacity-20"
                          style={{
                            backgroundColor: config.color,
                            boxShadow: `0 0 0 2px ${config.color}20`,
                          }}
                        />
                        <span className="text-gray-500 font-semibold">
                          {config.label}
                        </span>
                        <span className="text-gray-900 font-bold ml-auto text-lg font-mono">
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
                strokeWidth={3}
                animationDuration={1500}
                animationEasing="ease-in-out"
                activeDot={{
                  r: 6,
                  fill: "white",
                  stroke: config.color,
                  strokeWidth: 3,
                  className: "shadow-lg",
                }}
              />
            </AreaChart>
          </ChartContainer>
        </div>

        {/* Time Range Selector */}
        <div className="flex justify-center mt-6 shrink-0">
          <div className="flex bg-gray-50/80 p-1.5 rounded-full shadow-inner ring-1 ring-black/5 gap-1">
            {timeRanges.map((range) => (
              <button
                key={range.value}
                onClick={() => handleTimeRangeChange(range.value)}
                className={cn(
                  "px-6 py-2 rounded-full text-xs font-bold transition-all duration-300 ease-out",
                  activeTimeRange === range.value
                    ? "bg-white text-indigo-600 shadow-sm ring-1 ring-black/5 scale-[1.02]"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
