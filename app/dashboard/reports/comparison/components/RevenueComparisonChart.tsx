"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ReportPanel as Card, ReportPanelContent as CardContent, ReportPanelHeader as CardHeader, ReportPanelTitle as CardTitle } from "@/components/dashboard/reports/ReportPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import {
  transformToLineChartData,
  getLocationColor,
  LineChartDataPoint,
} from "../hooks/useComparisonData";
import { LocationComparisonData } from "@/app/dashboard/actions/location-analytics";
import { format, parseISO } from "date-fns";

interface RevenueComparisonChartProps {
  data: LocationComparisonData[];
  locationNames: string[];
  metric?: "gross_sales" | "net_sales" | "order_count" | "avg_ticket";
  isLoading?: boolean;
}

const METRIC_LABELS: Record<string, string> = {
  gross_sales: "Gross Sales",
  net_sales: "Net Sales",
  order_count: "Orders",
  avg_ticket: "Avg Ticket",
};

export function RevenueComparisonChart({
  data,
  locationNames,
  metric = "net_sales",
  isLoading = false,
}: RevenueComparisonChartProps) {
  const chartData = useMemo(
    () => transformToLineChartData(data, metric),
    [data, metric]
  );

  const formatYAxis = (value: number) => {
    if (metric === "order_count") return value.toLocaleString();
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  };

  const formatTooltip = (value: number) => {
    if (metric === "order_count") return value.toLocaleString();
    return `$${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full rounded-2xl" />
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            {METRIC_LABELS[metric]} Comparison
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[350px]">
          <p className="text-muted-foreground text-sm">
            No data available for selected period
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          {METRIC_LABELS[metric]} Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-hidden">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
          >
            <defs>
              {locationNames.map((name, index) => (
                <linearGradient
                  key={name}
                  id={`gradient-${index}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={getLocationColor(index)}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={getLocationColor(index)}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickMargin={8}
              tickFormatter={(value) => {
                try {
                  return format(parseISO(value), "MMM d");
                } catch {
                  return value;
                }
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={formatYAxis}
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
              }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
              formatter={(value: number) => [formatTooltip(value), ""]}
              labelFormatter={(label) => {
                try {
                  return format(parseISO(label), "EEEE, MMM d, yyyy");
                } catch {
                  return label;
                }
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 15 }}
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span style={{ color: "var(--foreground)", fontSize: 12 }}>
                  {value}
                </span>
              )}
            />
            {locationNames.map((name, index) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={getLocationColor(index)}
                strokeWidth={2.5}
                dot={false}
                activeDot={{
                  r: 6,
                  strokeWidth: 2,
                  fill: "var(--background)",
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
