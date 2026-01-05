"use client";

import { Pie, PieChart } from "recharts";
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
import { OrderTypeBreakdown } from "@/app/dashboard/actions/order-analytics";

const chartConfig = {
  dine_in: { label: "Dine In", color: "hsl(var(--chart-1))" },
  takeout: { label: "Takeout", color: "hsl(var(--chart-2))" },
  delivery: { label: "Delivery", color: "hsl(var(--chart-3))" },
  online: { label: "Online", color: "hsl(var(--chart-4))" },
  catering: { label: "Catering", color: "hsl(var(--chart-5))" },
};

export function OrderTypeChart({ data }: { data: OrderTypeBreakdown }) {
  // Convert object to array for Recharts
  const chartData = Object.entries(data)
    .map(([key, value]) => ({
      type: key,
      orders: value,
      fill: `var(--color-${key})`,
    }))
    .filter((item) => item.orders > 0);

  if (chartData.length === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="items-center pb-0">
          <CardTitle>Order Sources</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Order Sources</CardTitle>
        <CardDescription>Distribution by order type</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[300px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="orders"
              nameKey="type"
              innerRadius={60}
              strokeWidth={5}
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
