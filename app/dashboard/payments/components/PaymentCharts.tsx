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
import { buildMethodBreakdown } from "@/lib/payments/method-breakdown";
import { normalizeCardBrand } from "@/lib/payments/method-display";

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Cent-exact currency for the legend, so its rows reconcile with the payments table. */
function formatCurrencyExact(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

interface PaymentChartsProps {
  summary?: PaymentSummary;
  isLoading: boolean;
}

export function PaymentCharts({ summary, isLoading }: PaymentChartsProps) {
  // Payment Method Donut + legend — one source, so both always agree.
  // Zero-amount methods are already dropped by buildMethodBreakdown.
  const methodBreakdown = buildMethodBreakdown(summary?.byMethod);

  const methodData = methodBreakdown.map((m) => ({
    name: m.label,
    value: m.amount,
    percent: m.percent,
    fill: m.color,
  }));

  const methodChartConfig: ChartConfig = {
    value: { label: "Amount" },
    ...Object.fromEntries(
      methodBreakdown.map((m) => [m.label, { label: m.label, color: m.color }])
    ),
  };

  // Card Type Bar data
  const cardTypeData = (summary?.byCardType || [])
    .sort((a, b) => b.count - a.count)
    .map((c, index) => ({
      name: c.cardType,
      count: c.count,
      fill:
        CARD_COLORS[normalizeCardBrand(c.cardType ?? "")] ||
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
              No payments in this date range
            </div>
          ) : (
            <>
              <ChartContainer config={methodChartConfig} className="aspect-auto h-[200px] w-full">
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        // Recharts gives a Pie no axis label, so the default row
                        // renders the dataKey's config label ("Amount"). Format the
                        // whole row instead so the method name always travels with
                        // the value.
                        formatter={(value, _name, item) => (
                          <span className="text-foreground">
                            {item?.payload?.name} —{" "}
                            <span className="font-mono font-medium tabular-nums">
                              {formatCurrencyExact(value as number)}
                            </span>{" "}
                            · {item?.payload?.percent}%
                          </span>
                        )}
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
                    {methodData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>

              {/* Legend as real text, not canvas — readable by screen readers and
                  never relying on color alone to identify a method. */}
              <ul className="mt-3 space-y-1.5">
                {methodBreakdown.map((m) => (
                  <li
                    key={m.method}
                    className="flex min-w-0 items-center gap-2 text-sm"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-[2px]"
                      style={{ backgroundColor: m.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{m.label}</span>
                    <span className="flex-shrink-0 font-mono tabular-nums">
                      {formatCurrencyExact(m.amount)}
                    </span>
                    <span className="w-12 flex-shrink-0 text-right tabular-nums text-muted-foreground">
                      {m.percent}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
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
