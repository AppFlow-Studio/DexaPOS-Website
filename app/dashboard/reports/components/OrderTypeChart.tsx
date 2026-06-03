"use client";

import { Pie, PieChart, Cell } from "recharts";
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
import { OrderTypeBreakdown } from "@/app/dashboard/actions/order-analytics";

// Explicit colors — CSS variables don't resolve in SVG fill / inline style
const ORDER_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  dine_in:  { label: "Dine In",  color: "#6366f1" }, // indigo
  qr_dine_in: { label: "QR Table", color: "#0C4FD1" }, // brand blue
  takeout:  { label: "Takeout",  color: "#f59e0b" }, // amber
  delivery: { label: "Delivery", color: "#10b981" }, // emerald
  online:   { label: "Online",   color: "#3b82f6" }, // blue
  catering: { label: "Catering", color: "#f43f5e" }, // rose
};

const chartConfig = Object.fromEntries(
  Object.entries(ORDER_TYPE_CONFIG).map(([k, v]) => [
    k,
    { label: v.label, color: v.color },
  ])
);

interface OrderTypeChartProps {
  data: OrderTypeBreakdown;
  isLoading?: boolean;
}

export function OrderTypeChart({ data, isLoading }: OrderTypeChartProps) {
  const chartData = Object.entries(data)
    .map(([key, value]) => ({
      type: key,
      orders: value as number,
      label: ORDER_TYPE_CONFIG[key]?.label ?? key,
      color: ORDER_TYPE_CONFIG[key]?.color ?? "#94a3b8",
    }))
    .filter((item) => item.orders > 0);

  const total = chartData.reduce((sum, d) => sum + d.orders, 0);

  if (isLoading) {
    return (
      <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="h-4 w-28 bg-muted animate-pulse rounded" />
          <div className="h-3 w-36 bg-muted animate-pulse rounded mt-2" />
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex justify-center py-4">
            <div className="h-40 w-40 bg-muted animate-pulse rounded-full" />
          </div>
          <div className="space-y-2 mt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-7 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl">
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="text-sm font-semibold">Order Sources</CardTitle>
          <p className="text-xs text-muted-foreground">Distribution by type</p>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-44">
          <p className="text-sm text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="text-sm font-semibold">Order Sources</CardTitle>
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString()} total orders by type
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {/* Donut chart */}
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-40"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name) => [
                    `${value} (${
                      total > 0
                        ? ((Number(value) / total) * 100).toFixed(1)
                        : 0
                    }%)`,
                    ORDER_TYPE_CONFIG[name as string]?.label ?? name,
                  ]}
                />
              }
            />
            <Pie
              data={chartData}
              dataKey="orders"
              nameKey="type"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={3}
              strokeWidth={0}
            >
              {chartData.map((entry) => (
                <Cell key={entry.type} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        {/* Legend */}
        <div className="mt-4 space-y-2.5">
          {chartData.map((entry) => {
            const pct =
              total > 0
                ? ((entry.orders / total) * 100).toFixed(1)
                : "0.0";
            return (
              <div
                key={entry.type}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs text-muted-foreground truncate">
                    {entry.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <span className="text-xs font-semibold">
                    {entry.orders.toLocaleString()}
                  </span>
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full w-12 text-center"
                    style={{
                      backgroundColor: entry.color + "1a",
                      color: entry.color,
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
