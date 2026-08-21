"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { subDays, format } from "date-fns";
import {
  LocationComparisonData,
  DaypartData,
  LocationSummary,
  HourlyComparisonData,
  LocationRanking,
} from "@/app/dashboard/actions/location-analytics";
import {
  getLocationComparisonFromOrders,
  getDaypartComparisonFromOrders,
  getComparisonSummaryFromOrders,
  getHourlyComparisonFromOrders,
  getLocationRankingsFromOrders,
} from "@/app/dashboard/actions/location-analytics-fallback";

type RangePreset = "today" | "yesterday" | "7d" | "30d";

// Color palette for locations (max 6)
export const LOCATION_COLORS = [
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#10b981", // Emerald
  "#ec4899", // Pink
];

export function getLocationColor(index: number): string {
  return LOCATION_COLORS[index % LOCATION_COLORS.length];
}

// Calculate date range from preset
export function getDateRangeFromPreset(preset: RangePreset): {
  startDate: string;
  endDate: string;
} {
  const today = new Date();
  let startDate: Date;
  let endDate: Date = today;

  switch (preset) {
    case "today":
      startDate = today;
      break;
    case "yesterday":
      startDate = subDays(today, 1);
      endDate = subDays(today, 1);
      break;
    case "7d":
      startDate = subDays(today, 6);
      break;
    case "30d":
    default:
      startDate = subDays(today, 29);
      break;
  }

  return {
    startDate: format(startDate, "yyyy-MM-dd"),
    endDate: format(endDate, "yyyy-MM-dd"),
  };
}

// Transform comparison data for line chart
export interface LineChartDataPoint {
  date: string;
  [locationName: string]: string | number;
}

export function transformToLineChartData(
  data: LocationComparisonData[],
  metric:
    | "gross_sales"
    | "net_sales"
    | "order_count"
    | "avg_ticket" = "net_sales"
): LineChartDataPoint[] {
  const dateMap = new Map<string, LineChartDataPoint>();

  // Every location that appears anywhere in the range. A location with no row
  // for a given date must still be plotted as 0 on that date — leaving the key
  // undefined makes Recharts drop the point, so a sparse location renders as a
  // broken line (or nothing), which reads as "no sales" when it may just be
  // "no row". Zero-fill keeps absence and zero visually distinguishable.
  const locationNames = new Set(data.map((item) => item.location_name));

  data.forEach((item) => {
    const dateKey = item.business_date;
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, { date: dateKey });
    }
    const point = dateMap.get(dateKey)!;
    point[item.location_name] = Number(item[metric]) || 0;
  });

  dateMap.forEach((point) => {
    locationNames.forEach((name) => {
      if (point[name] === undefined) point[name] = 0;
    });
  });

  return Array.from(dateMap.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

// Transform daypart data for bar chart
export interface DaypartChartDataPoint {
  daypart: string;
  daypartLabel: string;
  [locationName: string]: string | number;
}

const DAYPART_ORDER = [
  "breakfast",
  "lunch",
  "afternoon",
  "dinner",
  "late_night",
];
const DAYPART_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  late_night: "Late Night",
};

export function transformToDaypartChartData(
  data: DaypartData[]
): DaypartChartDataPoint[] {
  const daypartMap = new Map<string, DaypartChartDataPoint>();

  // Initialize all dayparts
  DAYPART_ORDER.forEach((dp) => {
    daypartMap.set(dp, {
      daypart: dp,
      daypartLabel: DAYPART_LABELS[dp] || dp,
    });
  });

  data.forEach((item) => {
    const point = daypartMap.get(item.daypart);
    if (point) {
      point[item.location_name] = Number(item.total_sales) || 0;
    }
  });

  return DAYPART_ORDER.map((dp) => daypartMap.get(dp)!);
}

// Transform summary data for radar chart
export interface RadarChartDataPoint {
  metric: string;
  metricLabel: string;
  fullMark: number;
  [locationName: string]: string | number;
}

export function transformToRadarChartData(
  data: LocationSummary[]
): RadarChartDataPoint[] {
  if (data.length === 0) return [];

  // Find max values for normalization
  const maxRevenue = Math.max(
    ...data.map((d) => Number(d.total_gross_sales) || 0)
  );
  const maxOrders = Math.max(...data.map((d) => Number(d.total_orders) || 0));
  const maxAvgTicket = Math.max(...data.map((d) => Number(d.avg_ticket) || 0));
  // Labor efficiency: lower labor_cost_pct is better, so we invert
  const minLabor = Math.min(
    ...data.map((d) => Number(d.labor_cost_pct) || 100)
  );

  const metrics: RadarChartDataPoint[] = [
    { metric: "revenue", metricLabel: "Revenue", fullMark: 100 },
    { metric: "orders", metricLabel: "Customer Count", fullMark: 100 },
    { metric: "avg_ticket", metricLabel: "Avg Ticket", fullMark: 100 },
    {
      metric: "labor_efficiency",
      metricLabel: "Labor Efficiency",
      fullMark: 100,
    },
  ];

  data.forEach((location) => {
    // Normalize to 0-100 scale
    const revenueScore =
      maxRevenue > 0
        ? (Number(location.total_gross_sales) / maxRevenue) * 100
        : 0;
    const ordersScore =
      maxOrders > 0 ? (Number(location.total_orders) / maxOrders) * 100 : 0;
    const avgTicketScore =
      maxAvgTicket > 0 ? (Number(location.avg_ticket) / maxAvgTicket) * 100 : 0;
    // Invert labor cost (lower is better) - default to 50 if no data
    const laborEfficiency =
      minLabor > 0 && Number(location.labor_cost_pct) > 0
        ? (minLabor / Number(location.labor_cost_pct)) * 100
        : 50;

    metrics[0][location.location_name] = Math.round(revenueScore);
    metrics[1][location.location_name] = Math.round(ordersScore);
    metrics[2][location.location_name] = Math.round(avgTicketScore);
    metrics[3][location.location_name] = Math.round(laborEfficiency);
  });

  return metrics;
}

// Transform hourly data for heatmap
export interface HeatmapCell {
  dayOfWeek: number;
  dayLabel: string;
  hour: number;
  hourLabel: string;
  value: number;
  intensity: number; // 0-1 normalized
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function transformToHeatmapData(
  data: HourlyComparisonData[],
  locationId: string
): HeatmapCell[] {
  // Filter for selected location
  const locationData = data.filter((d) => d.location_id === locationId);

  // Aggregate by day of week and hour
  const aggregated = new Map<string, number>();

  locationData.forEach((item) => {
    const date = new Date(item.business_date);
    const dayOfWeek = date.getDay();
    const hour = item.hour_of_day;
    const key = `${dayOfWeek}-${hour}`;

    aggregated.set(key, (aggregated.get(key) || 0) + Number(item.gross_sales));
  });

  // Find max for normalization
  const maxValue = Math.max(...Array.from(aggregated.values()), 1);

  // Generate all cells
  const cells: HeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 6; hour <= 23; hour++) {
      const key = `${day}-${hour}`;
      const value = aggregated.get(key) || 0;
      cells.push({
        dayOfWeek: day,
        dayLabel: DAY_LABELS[day],
        hour,
        hourLabel: hour <= 12 ? `${hour}AM` : `${hour - 12}PM`,
        value,
        intensity: value / maxValue,
      });
    }
  }

  return cells;
}

// Main hook for comparison data
export function useComparisonData(
  clerkOrgId: string | undefined,
  locationIds: string[],
  rangePreset: RangePreset,
  enabled: boolean = true
) {
  const { startDate, endDate } = useMemo(
    () => getDateRangeFromPreset(rangePreset),
    [rangePreset]
  );

  const shouldFetch = enabled && !!clerkOrgId && locationIds.length > 0;

  // Line chart data - using fallback (orders table directly)
  const lineChartQuery = useQuery({
    queryKey: [
      "location-comparison-fallback",
      clerkOrgId,
      locationIds,
      startDate,
      endDate,
    ],
    queryFn: () =>
      getLocationComparisonFromOrders(
        clerkOrgId!,
        locationIds,
        startDate,
        endDate
      ),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000,
  });

  // Daypart data - using fallback
  const daypartQuery = useQuery({
    queryKey: [
      "daypart-comparison-fallback",
      clerkOrgId,
      locationIds,
      startDate,
      endDate,
    ],
    queryFn: () =>
      getDaypartComparisonFromOrders(
        clerkOrgId!,
        locationIds,
        startDate,
        endDate
      ),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000,
  });

  // Summary data for radar - using fallback
  const summaryQuery = useQuery({
    queryKey: [
      "comparison-summary-fallback",
      clerkOrgId,
      locationIds,
      startDate,
      endDate,
    ],
    queryFn: () =>
      getComparisonSummaryFromOrders(
        clerkOrgId!,
        locationIds,
        startDate,
        endDate
      ),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000,
  });

  // Hourly data for heatmap - using fallback
  const hourlyQuery = useQuery({
    queryKey: [
      "hourly-comparison-fallback",
      clerkOrgId,
      locationIds,
      startDate,
      endDate,
    ],
    queryFn: () =>
      getHourlyComparisonFromOrders(
        clerkOrgId!,
        locationIds,
        startDate,
        endDate
      ),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000,
  });

  // Rankings data - using fallback
  const rankingsQuery = useQuery({
    queryKey: ["rankings-fallback", clerkOrgId, startDate, endDate],
    queryFn: () =>
      getLocationRankingsFromOrders(clerkOrgId!, startDate, endDate),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000,
  });

  return {
    // Raw data
    comparisonData: lineChartQuery.data || [],
    daypartData: daypartQuery.data || [],
    summaryData: summaryQuery.data || [],
    hourlyData: hourlyQuery.data || [],
    rankingsData: rankingsQuery.data || [],

    // Loading states
    isLoading:
      lineChartQuery.isLoading ||
      daypartQuery.isLoading ||
      summaryQuery.isLoading ||
      hourlyQuery.isLoading ||
      rankingsQuery.isLoading,

    // Errors for debugging
    errors: {
      lineChart: lineChartQuery.error,
      daypart: daypartQuery.error,
      summary: summaryQuery.error,
      hourly: hourlyQuery.error,
      rankings: rankingsQuery.error,
    },

    // Refetch
    refetchAll: () => {
      lineChartQuery.refetch();
      daypartQuery.refetch();
      summaryQuery.refetch();
      hourlyQuery.refetch();
      rankingsQuery.refetch();
    },
  };
}
