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
import { ReportPanel as Card, ReportPanelContent as CardContent, ReportPanelHeader as CardHeader, ReportPanelTitle as CardTitle } from "@/components/dashboard/reports/ReportPanel";
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
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full rounded-2xl" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0 || chartData.length === 0) {
    return (
      <Card>
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
    <Card>
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
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <PolarAngleAxis
              dataKey="metricLabel"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickCount={5}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
              }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
              formatter={(value: number) => [`${value}%`, ""]}
            />
            <Legend
              wrapperStyle={{ paddingTop: 15 }}
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span style={{ color: "var(--foreground)", fontSize: 12 }}>
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
