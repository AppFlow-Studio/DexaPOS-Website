"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { SalesByDateRange } from "@/app/dashboard/actions/order-analytics";
import { cn } from "@/lib/utils";

type Metric = "sales" | "orders";

const METRICS: { key: Metric; label: string; formatter: (v: number) => string }[] = [
  { key: "sales", label: "Revenue", formatter: (v) => `$${v.toLocaleString()}` },
  { key: "orders", label: "Orders", formatter: (v) => v.toLocaleString() },
];

const chartConfig = {
  sales: { label: "Revenue", color: "hsl(var(--primary))" },
  orders: { label: "Orders", color: "hsl(239 84% 67%)" },
};

interface SalesChartProps {
  data: SalesByDateRange[];
  isLoading?: boolean;
}

export function SalesChart({ data, isLoading }: SalesChartProps) {
  const [activeMetric, setActiveMetric] = useState<Metric>("sales");
  const currentConfig = METRICS.find((m) => m.key === activeMetric)!;

  if (isLoading) {
    return (
      <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl">
        <CardHeader className="px-6 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
              <div className="h-3 w-40 bg-muted animate-pulse rounded mt-2" />
            </div>
            <div className="h-8 w-40 bg-muted animate-pulse rounded-lg" />
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="h-70 bg-muted animate-pulse rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm font-semibold">Performance Over Time</CardTitle>
          <p className="text-xs text-muted-foreground">No data for selected period</p>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-70">
          <p className="text-sm text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  // Compute totals for display in header
  const totalRevenue = data.reduce((s, d) => s + d.sales, 0);
  const totalOrders = data.reduce((s, d) => s + d.orders, 0);
  const headerValue =
    activeMetric === "sales"
      ? `$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : totalOrders.toLocaleString();

  return (
    <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl">
      <CardHeader className="px-6 pt-5 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">
              Performance Over Time
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daily {currentConfig.label.toLowerCase()} for selected period
            </p>
            <p className="text-2xl font-bold mt-2">{headerValue}</p>
          </div>

          {/* Metric toggle */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg self-start">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setActiveMetric(m.key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                  activeMetric === m.key
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-70 w-full"
        >
          <AreaChart data={data} margin={{ left: 16, right: 16, top: 8 }}>
            <defs>
              <linearGradient id="fillMetric" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={`var(--color-${activeMetric})`}
                  stopOpacity={0.25}
                />
                <stop
                  offset="95%"
                  stopColor={`var(--color-${activeMetric})`}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              strokeOpacity={0.08}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={12}
              minTickGap={32}
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
              className="text-[10px] fill-muted-foreground"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={currentConfig.formatter}
              className="text-[10px] fill-muted-foreground"
              width={activeMetric === "sales" ? 70 : 48}
            />
            <ChartTooltip
              cursor={{
                stroke: "hsl(var(--muted-foreground))",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                      dateStyle: "medium",
                    })
                  }
                  formatter={(value, name) => [
                    name === "sales"
                      ? `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : value,
                    name === "sales" ? "Revenue" : "Orders",
                  ]}
                />
              }
            />
            <Area
              key={activeMetric}
              dataKey={activeMetric}
              type="monotone"
              fill="url(#fillMetric)"
              stroke={`var(--color-${activeMetric})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
