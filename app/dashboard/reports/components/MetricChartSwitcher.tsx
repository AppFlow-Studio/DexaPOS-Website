"use client";

import React, { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

interface MetricChartSwitcherProps {
  data: Array<{
    date: string;
    net_sales: number;
    order_count: number;
    guest_count: number;
  }>;
}

const chartConfig = {
  net_sales: {
    label: "Net Sales",
    color: "hsl(var(--primary))",
  },
  order_count: {
    label: "Orders",
    color: "hsl(var(--secondary))",
  },
  guest_count: {
    label: "Guests",
    color: "hsl(var(--secondary))",
  },
};

type MetricType = "net_sales" | "order_count" | "guest_count";

export function MetricChartSwitcher({ data }: MetricChartSwitcherProps) {
  const [activeMetric, setActiveMetric] = useState<MetricType>("net_sales");

  if (!data || data.length === 0) {
    return (
      <Card className="col-span-4 h-[450px] flex items-center justify-center">
        <p className="text-muted-foreground">
          No data available for the selected period.
        </p>
      </Card>
    );
  }

  return (
    <Card className="col-span-full border-none shadow-sm bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold">
            Business Performance
          </CardTitle>
          <CardDescription>
            Daily breakdown of {chartConfig[activeMetric].label}
          </CardDescription>
        </div>
        <Select
          value={activeMetric}
          onValueChange={(v) => setActiveMetric(v as MetricType)}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Select metric" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="net_sales">Net Sales</SelectItem>
            <SelectItem value="order_count">Order Count</SelectItem>
            <SelectItem value="guest_count">Guest Count</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[320px] w-full"
        >
          <AreaChart data={data} margin={{ left: 12, right: 12, top: 12 }}>
            <defs>
              <linearGradient id="fillMetric" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartConfig[activeMetric].color}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={chartConfig[activeMetric].color}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              strokeOpacity={0.1}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={12}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
              className="text-[10px] fill-muted-foreground uppercase tracking-wider"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) =>
                activeMetric === "net_sales" ? `$${value}` : value.toString()
              }
              className="text-[10px] fill-muted-foreground"
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
                />
              }
            />
            <Area
              dataKey={activeMetric}
              type="monotone"
              fill="url(#fillMetric)"
              fillOpacity={0.4}
              stroke={chartConfig[activeMetric].color}
              strokeWidth={2}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
