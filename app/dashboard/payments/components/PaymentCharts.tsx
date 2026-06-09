"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PaymentSummary } from "@/types/payment";

const METHOD_COLORS: Record<string, string> = {
  cash: "hsl(142, 71%, 45%)",
  card: "hsl(221, 83%, 53%)",
  card_spinapi: "hsl(221, 83%, 53%)",
  card_dvpaylite: "hsl(262, 83%, 58%)",
  card_manual: "hsl(24, 95%, 53%)",
  gift_card: "hsl(330, 81%, 60%)",
  house_account: "hsl(173, 58%, 39%)",
  external: "hsl(48, 96%, 53%)",
};

const CARD_COLORS: Record<string, string> = {
  visa: "hsl(221, 83%, 53%)",
  mastercard: "hsl(24, 95%, 53%)",
  amex: "hsl(262, 83%, 58%)",
  discover: "hsl(142, 71%, 45%)",
};

// Fallback palette for unrecognized card types (cycled by index)
const FALLBACK_COLORS = [
  "hsl(173, 58%, 39%)",
  "hsl(330, 81%, 60%)",
  "hsl(48, 96%, 53%)",
  "hsl(199, 89%, 48%)",
];

function formatMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Cash",
    card: "Card",
    card_spinapi: "Card (SpinAPI)",
    card_dvpaylite: "Card (DvPayLite)",
    card_manual: "Card (Manual)",
    gift_card: "Gift Card",
    house_account: "House Account",
    external: "External",
  };
  return labels[method] || method;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface PaymentChartsProps {
  summary?: PaymentSummary;
  isLoading: boolean;
}

export function PaymentCharts({ summary, isLoading }: PaymentChartsProps) {
  // Payment Method Donut data
  const methodData = (summary?.byMethod || []).map((m) => ({
    name: formatMethodLabel(m.method),
    value: m.amount,
    fill: METHOD_COLORS[m.method] || "hsl(215, 16%, 47%)",
  }));

  const methodChartConfig: ChartConfig = {
    value: { label: "Amount" },
    ...Object.fromEntries(
      methodData.map((d) => [
        d.name,
        { label: d.name, color: d.fill },
      ])
    ),
  };

  // Card Type Bar data
  const cardTypeData = (summary?.byCardType || [])
    .sort((a, b) => b.count - a.count)
    .map((c, index) => ({
      name: c.cardType,
      count: c.count,
      fill:
        CARD_COLORS[c.cardType?.toLowerCase()] ||
        FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    }));

  const cardChartConfig: ChartConfig = {
    count: { label: "Transactions" },
    ...Object.fromEntries(
      cardTypeData.map((d) => [
        d.name,
        { label: d.name, color: d.fill },
      ])
    ),
  };

  // Daily Volume data
  const dailyData = (summary?.dailyVolume || []).map((d) => ({
    date: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    count: d.count,
    amount: d.amount,
  }));

  const dailyChartConfig: ChartConfig = {
    count: { label: "Transactions", color: "hsl(221, 83%, 53%)" },
    amount: { label: "Volume ($)", color: "hsl(142, 71%, 45%)" },
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="min-w-0">
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Payment Method Donut */}
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Payment Methods
          </CardTitle>
        </CardHeader>
        <CardContent>
          {methodData.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No payment data
            </div>
          ) : (
            <ChartContainer config={methodChartConfig} className="aspect-auto h-[200px] w-full">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        formatCurrency(value as number)
                      }
                    />
                  }
                />
                <Pie
                  data={methodData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {methodData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Card Type Bar Chart */}
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Card Types
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cardTypeData.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No card payment data
            </div>
          ) : (
            <ChartContainer config={cardChartConfig} className="aspect-auto h-[200px] w-full">
              <BarChart
                data={cardTypeData}
                layout="vertical"
                margin={{ left: 10, right: 10 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {cardTypeData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Daily Volume Area Chart */}
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Daily Volume
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyData.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No daily data
            </div>
          ) : (
            <ChartContainer config={dailyChartConfig} className="aspect-auto h-[200px] w-full">
              <AreaChart
                data={dailyData}
                margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent />} />
                <defs>
                  <linearGradient
                    id="fillAmount"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(221, 83%, 53%)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(221, 83%, 53%)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(221, 83%, 53%)"
                  fill="url(#fillAmount)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
