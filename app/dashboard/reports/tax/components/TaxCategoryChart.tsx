"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaxCategoryRow } from "@/app/dashboard/reports/tax/types";

interface TaxCategoryChartProps {
  data: TaxCategoryRow[] | undefined;
  isLoading: boolean;
}

const COLORS = [
  "hsl(var(--primary))",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.fill }}>
          {entry.name}: ${entry.value.toFixed(2)}
        </p>
      ))}
    </div>
  );
}

export function TaxCategoryChart({ data, isLoading }: TaxCategoryChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Tax by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const chartData = (data ?? []).slice(0, 10).map((row) => ({
    category:
      row.categoryName.length > 16
        ? row.categoryName.slice(0, 14) + "…"
        : row.categoryName,
    taxCollected: row.taxCollected,
  }));

  if (!chartData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Tax by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No category data available.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Tax Collected by Category
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 16, left: 8, bottom: 40 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="category"
              tick={{ fontSize: 11 }}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={60}
            />
            <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="taxCollected" name="Tax Collected" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
