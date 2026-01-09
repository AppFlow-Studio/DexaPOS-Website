// ============================================================================
// DEXA POS: Multi-Location Analytics Store & Hooks
// ============================================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  format,
  differenceInDays,
  subMonths,
  subYears,
} from "date-fns";
import {
  AnalyticsFilters,
  LocationComparisonRow,
  HourlyComparisonRow,
  LocationRankingRow,
  DaypartComparisonRow,
  LocationSummary,
  SavedComparisonView,
  TimeRange,
  ComparisonPeriod,
  MetricType,
  ChartType,
  DateRange,
  ComparisonDateRange,
  TimeSeriesDataPoint,
  LocationInfo,
  getLocationColor,
} from "@/types/analytics";

// ============================================================================
// Zustand Store for Filter State
// ============================================================================

interface AnalyticsState {
  filters: AnalyticsFilters;
  setMerchantId: (id: string) => void;
  setLocationIds: (ids: string[]) => void;
  toggleLocation: (id: string) => void;
  setTimeRange: (range: TimeRange) => void;
  setCustomDateRange: (range: DateRange | null) => void;
  setComparisonPeriod: (period: ComparisonPeriod) => void;
  setSelectedMetrics: (metrics: MetricType[]) => void;
  toggleMetric: (metric: MetricType) => void;
  setChartType: (type: ChartType) => void;
  resetFilters: () => void;
  loadFromSavedView: (view: SavedComparisonView) => void;
}

const defaultFilters: AnalyticsFilters = {
  merchantId: "",
  locationIds: [],
  timeRange: "7d",
  customDateRange: null,
  comparisonPeriod: "previous_period",
  selectedMetrics: ["gross_sales", "order_count", "avg_ticket"],
  chartType: "line",
};

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set) => ({
      filters: defaultFilters,

      setMerchantId: (id) =>
        set((state) => ({
          filters: { ...state.filters, merchantId: id, locationIds: [] },
        })),

      setLocationIds: (ids) =>
        set((state) => ({
          filters: { ...state.filters, locationIds: ids.slice(0, 6) }, // Max 6 locations
        })),

      toggleLocation: (id) =>
        set((state) => {
          const current = state.filters.locationIds;
          const newIds = current.includes(id)
            ? current.filter((lid) => lid !== id)
            : current.length < 6
            ? [...current, id]
            : current;
          return { filters: { ...state.filters, locationIds: newIds } };
        }),

      setTimeRange: (range) =>
        set((state) => ({
          filters: {
            ...state.filters,
            timeRange: range,
            customDateRange:
              range === "custom" ? state.filters.customDateRange : null,
          },
        })),

      setCustomDateRange: (range) =>
        set((state) => ({
          filters: {
            ...state.filters,
            customDateRange: range,
            timeRange: "custom",
          },
        })),

      setComparisonPeriod: (period) =>
        set((state) => ({
          filters: { ...state.filters, comparisonPeriod: period },
        })),

      setSelectedMetrics: (metrics) =>
        set((state) => ({
          filters: { ...state.filters, selectedMetrics: metrics },
        })),

      toggleMetric: (metric) =>
        set((state) => {
          const current = state.filters.selectedMetrics;
          const newMetrics = current.includes(metric)
            ? current.filter((m) => m !== metric)
            : [...current, metric];
          return { filters: { ...state.filters, selectedMetrics: newMetrics } };
        }),

      setChartType: (type) =>
        set((state) => ({ filters: { ...state.filters, chartType: type } })),

      resetFilters: () =>
        set((state) => ({
          filters: { ...defaultFilters, merchantId: state.filters.merchantId },
        })),

      loadFromSavedView: (view) =>
        set((state) => ({
          filters: {
            ...state.filters,
            locationIds: view.location_ids,
            selectedMetrics: view.metrics,
            timeRange: view.default_time_range,
            chartType: view.chart_type,
            comparisonPeriod: view.comparison_period,
          },
        })),
    }),
    {
      name: "dexa-analytics-filters",
      partialize: (state) => ({ filters: state.filters }),
    }
  )
);

// ============================================================================
// Date Range Utilities
// ============================================================================

export function getDateRangeFromTimeRange(
  timeRange: TimeRange,
  customRange: DateRange | null
): DateRange {
  const now = new Date();

  switch (timeRange) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday":
      return {
        start: startOfDay(subDays(now, 1)),
        end: endOfDay(subDays(now, 1)),
      };
    case "7d":
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case "30d":
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    case "mtd":
      return { start: startOfMonth(now), end: endOfDay(now) };
    case "qtd":
      return { start: startOfQuarter(now), end: endOfDay(now) };
    case "ytd":
      return { start: startOfYear(now), end: endOfDay(now) };
    case "custom":
      return (
        customRange ?? {
          start: startOfDay(subDays(now, 6)),
          end: endOfDay(now),
        }
      );
    default:
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
  }
}

export function getComparisonDateRange(
  currentRange: DateRange,
  comparisonPeriod: ComparisonPeriod
): ComparisonDateRange {
  if (comparisonPeriod === "none") {
    return { current: currentRange, previous: null };
  }

  const daysDiff = differenceInDays(currentRange.end, currentRange.start) + 1;

  let previousStart: Date;
  let previousEnd: Date;

  switch (comparisonPeriod) {
    case "previous_period":
      previousEnd = subDays(currentRange.start, 1);
      previousStart = subDays(previousEnd, daysDiff - 1);
      break;
    case "same_period_last_year":
      previousStart = subYears(currentRange.start, 1);
      previousEnd = subYears(currentRange.end, 1);
      break;
    case "same_period_last_month":
      previousStart = subMonths(currentRange.start, 1);
      previousEnd = subMonths(currentRange.end, 1);
      break;
    default:
      return { current: currentRange, previous: null };
  }

  return {
    current: currentRange,
    previous: { start: previousStart, end: previousEnd },
  };
}

// ============================================================================
// Query Key Factory
// ============================================================================

export const analyticsKeys = {
  all: ["analytics"] as const,
  comparison: (
    merchantId: string,
    locationIds: string[],
    start: string,
    end: string
  ) =>
    [
      ...analyticsKeys.all,
      "comparison",
      merchantId,
      locationIds.sort().join(","),
      start,
      end,
    ] as const,
  hourly: (
    merchantId: string,
    locationIds: string[],
    start: string,
    end: string
  ) =>
    [
      ...analyticsKeys.all,
      "hourly",
      merchantId,
      locationIds.sort().join(","),
      start,
      end,
    ] as const,
  rankings: (merchantId: string, start: string, end: string, metric: string) =>
    [...analyticsKeys.all, "rankings", merchantId, start, end, metric] as const,
  daypart: (
    merchantId: string,
    locationIds: string[],
    start: string,
    end: string
  ) =>
    [
      ...analyticsKeys.all,
      "daypart",
      merchantId,
      locationIds.sort().join(","),
      start,
      end,
    ] as const,
  summary: (
    merchantId: string,
    locationIds: string[],
    start: string,
    end: string
  ) =>
    [
      ...analyticsKeys.all,
      "summary",
      merchantId,
      locationIds.sort().join(","),
      start,
      end,
    ] as const,
  savedViews: (merchantId: string) =>
    [...analyticsKeys.all, "savedViews", merchantId] as const,
  locations: (merchantId: string) =>
    [...analyticsKeys.all, "locations", merchantId] as const,
};

// ============================================================================
// Data Fetching Hooks
// ============================================================================

/**
 * Fetch locations for selection
 */
export function useLocations(merchantId: string) {
  const supabase = useSupabaseClient();

  return useQuery({
    queryKey: analyticsKeys.locations(merchantId),
    queryFn: async (): Promise<LocationInfo[]> => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name")
        .eq("merchant_id", merchantId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      return (data ?? []).map((loc, index) => ({
        id: loc.id,
        name: loc.name ?? `Location ${index + 1}`,
        color: getLocationColor(index),
      }));
    },
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Multi-location comparison data (daily)
 */
export function useLocationComparison(
  merchantId: string,
  locationIds: string[],
  dateRange: DateRange
) {
  const supabase = useSupabaseClient();
  const startStr = format(dateRange.start, "yyyy-MM-dd");
  const endStr = format(dateRange.end, "yyyy-MM-dd");

  return useQuery({
    queryKey: analyticsKeys.comparison(
      merchantId,
      locationIds,
      startStr,
      endStr
    ),
    queryFn: async (): Promise<LocationComparisonRow[]> => {
      const { data, error } = await supabase
        .schema("analytics")
        .rpc("get_location_comparison", {
          p_merchant_id: merchantId,
          p_location_ids: locationIds,
          p_start_date: startStr,
          p_end_date: endStr,
        });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!merchantId && locationIds.length >= 2,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hourly breakdown data
 */
export function useHourlyComparison(
  merchantId: string,
  locationIds: string[],
  dateRange: DateRange
) {
  const supabase = useSupabaseClient();
  const startStr = format(dateRange.start, "yyyy-MM-dd");
  const endStr = format(dateRange.end, "yyyy-MM-dd");

  return useQuery({
    queryKey: analyticsKeys.hourly(merchantId, locationIds, startStr, endStr),
    queryFn: async (): Promise<HourlyComparisonRow[]> => {
      const { data, error } = await supabase
        .schema("analytics")
        .rpc("get_hourly_comparison", {
          p_merchant_id: merchantId,
          p_location_ids: locationIds,
          p_start_date: startStr,
          p_end_date: endStr,
        });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!merchantId && locationIds.length >= 1,
    staleTime: 60 * 1000,
  });
}

/**
 * Location rankings
 */
export function useLocationRankings(
  merchantId: string,
  dateRange: DateRange,
  metric: MetricType = "gross_sales"
) {
  const supabase = useSupabaseClient();
  const startStr = format(dateRange.start, "yyyy-MM-dd");
  const endStr = format(dateRange.end, "yyyy-MM-dd");

  return useQuery({
    queryKey: analyticsKeys.rankings(merchantId, startStr, endStr, metric),
    queryFn: async (): Promise<LocationRankingRow[]> => {
      const { data, error } = await supabase
        .schema("analytics")
        .rpc("get_location_rankings", {
          p_merchant_id: merchantId,
          p_start_date: startStr,
          p_end_date: endStr,
          p_metric: metric,
          p_limit: 10,
        });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!merchantId,
    staleTime: 60 * 1000,
  });
}

/**
 * Daypart analysis
 */
export function useDaypartComparison(
  merchantId: string,
  locationIds: string[],
  dateRange: DateRange
) {
  const supabase = useSupabaseClient();
  const startStr = format(dateRange.start, "yyyy-MM-dd");
  const endStr = format(dateRange.end, "yyyy-MM-dd");

  return useQuery({
    queryKey: analyticsKeys.daypart(merchantId, locationIds, startStr, endStr),
    queryFn: async (): Promise<DaypartComparisonRow[]> => {
      const { data, error } = await supabase
        .schema("analytics")
        .rpc("get_daypart_comparison", {
          p_merchant_id: merchantId,
          p_location_ids: locationIds,
          p_start_date: startStr,
          p_end_date: endStr,
        });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!merchantId && locationIds.length >= 1,
    staleTime: 60 * 1000,
  });
}

/**
 * Summary stats for dashboard cards
 */
export function useComparisonSummary(
  merchantId: string,
  locationIds: string[],
  dateRange: DateRange
) {
  const supabase = useSupabaseClient();
  const startStr = format(dateRange.start, "yyyy-MM-dd");
  const endStr = format(dateRange.end, "yyyy-MM-dd");

  return useQuery({
    queryKey: analyticsKeys.summary(merchantId, locationIds, startStr, endStr),
    queryFn: async (): Promise<LocationSummary[]> => {
      const { data, error } = await supabase
        .schema("analytics")
        .rpc("get_comparison_summary", {
          p_merchant_id: merchantId,
          p_location_ids: locationIds,
          p_start_date: startStr,
          p_end_date: endStr,
        });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!merchantId && locationIds.length >= 1,
    staleTime: 60 * 1000,
  });
}

// ============================================================================
// Saved Views Hooks
// ============================================================================

export function useSavedViews(merchantId: string) {
  const supabase = useSupabaseClient();

  return useQuery({
    queryKey: analyticsKeys.savedViews(merchantId),
    queryFn: async (): Promise<SavedComparisonView[]> => {
      const { data, error } = await supabase
        .schema("analytics")
        .from("saved_comparison_views")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveView() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      view: Omit<SavedComparisonView, "id" | "created_at" | "updated_at">
    ) => {
      const { data, error } = await supabase
        .schema("analytics")
        .from("saved_comparison_views")
        .insert(view)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: analyticsKeys.savedViews(data.merchant_id),
      });
    },
  });
}

export function useDeleteView() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      merchantId,
    }: {
      id: string;
      merchantId: string;
    }) => {
      const { error } = await supabase
        .schema("analytics")
        .from("saved_comparison_views")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return merchantId;
    },
    onSuccess: (merchantId) => {
      queryClient.invalidateQueries({
        queryKey: analyticsKeys.savedViews(merchantId),
      });
    },
  });
}

// ============================================================================
// Data Transformation Utilities
// ============================================================================

/**
 * Transform comparison data to time series format for Recharts
 */
export function transformToTimeSeries(
  data: LocationComparisonRow[],
  metric: MetricType,
  _locations: LocationInfo[]
): TimeSeriesDataPoint[] {
  const dateMap = new Map<string, TimeSeriesDataPoint>();

  data.forEach((row) => {
    const existing = dateMap.get(row.business_date) ?? {
      date: row.business_date,
    };
    existing[row.location_id] = row[
      metric as keyof LocationComparisonRow
    ] as number;
    dateMap.set(row.business_date, existing);
  });

  return Array.from(dateMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/**
 * Transform hourly data for heat map or hourly chart
 */
export function transformToHourlyChart(
  data: HourlyComparisonRow[],
  metric: "gross_sales" | "order_count" | "avg_ticket" = "gross_sales"
) {
  const hourLabels = [
    "12AM",
    "1AM",
    "2AM",
    "3AM",
    "4AM",
    "5AM",
    "6AM",
    "7AM",
    "8AM",
    "9AM",
    "10AM",
    "11AM",
    "12PM",
    "1PM",
    "2PM",
    "3PM",
    "4PM",
    "5PM",
    "6PM",
    "7PM",
    "8PM",
    "9PM",
    "10PM",
    "11PM",
  ];

  // Group by hour and aggregate across all dates
  const hourMap = new Map<number, Record<string, number>>();

  data.forEach((row) => {
    const existing = hourMap.get(row.hour_of_day) ?? {};
    existing[row.location_id] = (existing[row.location_id] ?? 0) + row[metric];
    hourMap.set(row.hour_of_day, existing);
  });

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    hourLabel: hourLabels[hour],
    ...(hourMap.get(hour) ?? {}),
  }));
}

// ============================================================================
// Formatting Utilities
// ============================================================================

export function formatMetricValue(
  value: number,
  formatType: "currency" | "number" | "percentage" | "duration"
): string {
  switch (formatType) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case "percentage":
      return `${value.toFixed(1)}%`;
    case "duration":
      const minutes = Math.floor(value / 60);
      const seconds = Math.round(value % 60);
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    case "number":
    default:
      return new Intl.NumberFormat("en-US").format(Math.round(value));
  }
}

export function formatTrendValue(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

export function getTrendColor(value: number, higherIsBetter: boolean): string {
  if (value === 0) return "text-muted-foreground";
  const isPositive = value > 0;
  const isGood = higherIsBetter ? isPositive : !isPositive;
  return isGood ? "text-emerald-500" : "text-red-500";
}

// ============================================================================
// Composite Hook for Full Analytics Data
// ============================================================================

export function useAnalyticsData() {
  const { filters } = useAnalyticsStore();
  const dateRange = getDateRangeFromTimeRange(
    filters.timeRange,
    filters.customDateRange
  );

  const locations = useLocations(filters.merchantId);
  const comparison = useLocationComparison(
    filters.merchantId,
    filters.locationIds,
    dateRange
  );
  const summary = useComparisonSummary(
    filters.merchantId,
    filters.locationIds,
    dateRange
  );
  const rankings = useLocationRankings(
    filters.merchantId,
    dateRange,
    filters.selectedMetrics[0]
  );
  const hourly = useHourlyComparison(
    filters.merchantId,
    filters.locationIds,
    dateRange
  );
  const daypart = useDaypartComparison(
    filters.merchantId,
    filters.locationIds,
    dateRange
  );

  const isLoading =
    comparison.isLoading || summary.isLoading || rankings.isLoading;

  const selectedLocations = (locations.data ?? []).filter((loc) =>
    filters.locationIds.includes(loc.id)
  );

  const timeSeriesData = comparison.data
    ? transformToTimeSeries(
        comparison.data,
        filters.selectedMetrics[0],
        selectedLocations
      )
    : [];

  return {
    filters,
    dateRange,
    locations: locations.data ?? [],
    selectedLocations,
    comparison: comparison.data ?? [],
    summary: summary.data ?? [],
    rankings: rankings.data ?? [],
    hourly: hourly.data ?? [],
    daypart: daypart.data ?? [],
    timeSeriesData,
    isLoading,
    error: comparison.error ?? summary.error ?? rankings.error,
  };
}
