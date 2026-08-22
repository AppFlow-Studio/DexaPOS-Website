"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { Panel, PanelSection } from "@/components/dashboard/shell";
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
  sales: { label: "Revenue", color: "var(--primary)" },
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
      <Panel>
        <PanelSection
          icon={TrendingUp}
          label="Performance over time"
          caption="Daily revenue and order volume for the selected period."
          isLoading
          action={<div className="h-8 w-40 animate-pulse rounded-full bg-muted" />}
        >
          <div className="h-70 bg-muted animate-pulse rounded-xl" />
        </PanelSection>
      </Panel>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Panel>
        <PanelSection
          icon={TrendingUp}
          label="Performance over time"
          caption="No activity was found for the selected period."
        >
          <div className="flex h-70 items-center justify-center">
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        </PanelSection>
      </Panel>
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
    <Panel>
      <PanelSection
        icon={TrendingUp}
        label="Performance over time"
        value={headerValue}
        caption={`Daily ${currentConfig.label.toLowerCase()} for the selected period.`}
        action={
          <div
            className="flex items-center gap-1 rounded-full border bg-card p-1"
            aria-label="Chart metric"
          >
            {METRICS.map((m) => (
              <button
                type="button"
                key={m.key}
                onClick={() => setActiveMetric(m.key)}
                aria-pressed={activeMetric === m.key}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  activeMetric === m.key
                    ? "text-[#0C4FD1] dark:text-[#6CA0FF]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="-mx-2 sm:-mx-4">
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
                stroke: "var(--muted-foreground)",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    new Date(String(value)).toLocaleDateString("en-US", {
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
        </div>
      </PanelSection>
    </Panel>
  );
}
