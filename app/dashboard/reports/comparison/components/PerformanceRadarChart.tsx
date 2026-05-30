"use client";

import { useMemo } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Target } from "lucide-react";
import {
  transformToRadarChartData,
  getLocationColor,
} from "../hooks/useComparisonData";
import { LocationSummary } from "@/app/dashboard/actions/location-analytics";

interface PerformanceRadarChartProps {
  data: LocationSummary[];
  locationNames: string[];
  isLoading?: boolean;
}

export function PerformanceRadarChart({
  data,
  locationNames,
  isLoading = false,
}: PerformanceRadarChartProps) {
  const chartData = useMemo(() => transformToRadarChartData(data), [data]);

  if (isLoading) {
    return (
      <Card className="border-none shadow-sm bg-card/30 backdrop-blur-md ring-1 ring-white/5">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0 || chartData.length === 0) {
    return (
      <Card className="border-none shadow-sm bg-card/30 backdrop-blur-md ring-1 ring-white/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Performance Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground text-sm">
            No performance data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-sm bg-card/30 backdrop-blur-md ring-1 ring-white/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Performance Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-hidden">
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
            <PolarGrid
              stroke="hsl(var(--muted-foreground) / 0.2)"
              strokeDasharray="3 3"
            />
            <PolarAngleAxis
              dataKey="metricLabel"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickCount={5}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "12px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
              }}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
              formatter={(value: number) => [`${value}%`, ""]}
            />
            <Legend
              wrapperStyle={{ paddingTop: 15 }}
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span style={{ color: "hsl(var(--foreground))", fontSize: 12 }}>
                  {value}
                </span>
              )}
            />
            {locationNames.map((name, index) => (
              <Radar
                key={name}
                name={name}
                dataKey={name}
                stroke={getLocationColor(index)}
                fill={getLocationColor(index)}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
