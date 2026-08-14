"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ReportPanel as Card, ReportPanelContent as CardContent, ReportPanelHeader as CardHeader, ReportPanelTitle as CardTitle } from "@/components/dashboard/reports/ReportPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";
import {
  transformToDaypartChartData,
  getLocationColor,
} from "../hooks/useComparisonData";
import { DaypartData } from "@/app/dashboard/actions/location-analytics";

interface DaypartComparisonChartProps {
  data: DaypartData[];
  locationNames: string[];
  isLoading?: boolean;
}

export function DaypartComparisonChart({
  data,
  locationNames,
  isLoading = false,
}: DaypartComparisonChartProps) {
  const chartData = useMemo(() => transformToDaypartChartData(data), [data]);

  const formatYAxis = (value: number) => {
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  };

  const formatTooltip = (value: number) => {
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
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Sales by Daypart
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground text-sm">
            No daypart data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Sales by Daypart
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-hidden">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="daypartLabel"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickMargin={8}
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
              formatter={(value: number, name: string) => [
                formatTooltip(value),
                name,
              ]}
              cursor={{ fill: "transparent" }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 15 }}
              iconType="rect"
              iconSize={10}
              formatter={(value) => (
                <span style={{ color: "var(--foreground)", fontSize: 12 }}>
                  {value}
                </span>
              )}
            />
            {locationNames.map((name, index) => (
              <Bar
                key={name}
                dataKey={name}
                fill={getLocationColor(index)}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
