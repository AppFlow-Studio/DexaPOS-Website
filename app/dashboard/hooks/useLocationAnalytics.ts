"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ensureAnalyticsInitialized,
  getLocationComparison,
  getHourlyComparison,
  getLocationRankings,
  getDaypartComparison,
  getComparisonSummary,
  getSavedViews,
  LocationComparisonData,
  HourlyComparisonData,
  LocationRanking,
  DaypartData,
  LocationSummary,
  SavedComparisonView,
} from "@/app/dashboard/actions/location-analytics";

interface UseLocationAnalyticsOptions {
  merchantId: string;
  locationIds: string[];
  startDate: string;
  endDate: string;
  autoInitialize?: boolean; // Default true - auto backfill if needed
}

interface UseLocationAnalyticsReturn {
  // State
  isInitializing: boolean;
  isLoading: boolean;
  wasBackfilled: boolean;
  error: string | null;

  // Data
  comparisonData: LocationComparisonData[];
  summaryData: LocationSummary[];
  rankingsData: LocationRanking[];
  daypartData: DaypartData[];
  hourlyData: HourlyComparisonData[];
  savedViews: SavedComparisonView[];

  // Actions
  refresh: () => Promise<void>;
  loadHourlyData: (date: string) => Promise<void>;
  loadRankings: (metric?: string) => Promise<void>;
}

export function useLocationAnalytics({
  merchantId,
  locationIds,
  startDate,
  endDate,
  autoInitialize = true,
}: UseLocationAnalyticsOptions): UseLocationAnalyticsReturn {
  // Initialization state
  const [isInitializing, setIsInitializing] = useState(autoInitialize);
  const [wasBackfilled, setWasBackfilled] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [comparisonData, setComparisonData] = useState<
    LocationComparisonData[]
  >([]);
  const [summaryData, setSummaryData] = useState<LocationSummary[]>([]);
  const [rankingsData, setRankingsData] = useState<LocationRanking[]>([]);
  const [daypartData, setDaypartData] = useState<DaypartData[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyComparisonData[]>([]);
  const [savedViews, setSavedViews] = useState<SavedComparisonView[]>([]);

  // Initialize analytics (auto-backfill if needed)
  useEffect(() => {
    if (!autoInitialize || !merchantId) return;

    const initialize = async () => {
      setIsInitializing(true);
      setInitError(null);

      try {
        const result = await ensureAnalyticsInitialized(merchantId);

        if (!result.initialized) {
          setInitError(result.error || "Failed to initialize analytics");
          return;
        }

        setWasBackfilled(result.wasBackfilled);

        if (result.wasBackfilled) {
          console.log("Analytics data was backfilled for this merchant");
        }
      } catch (err) {
        console.error("Error initializing analytics:", err);
        setInitError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, [merchantId, autoInitialize]);

  // Load main comparison data
  const loadData = useCallback(async () => {
    if (!merchantId || locationIds.length === 0 || isInitializing) return;

    setIsLoading(true);
    setError(null);

    try {
      // Load all data in parallel
      const [comparison, summary, rankings, daypart, views] = await Promise.all(
        [
          getLocationComparison(merchantId, locationIds, startDate, endDate),
          getComparisonSummary(merchantId, locationIds, startDate, endDate),
          getLocationRankings(
            merchantId,
            startDate,
            endDate,
            "gross_sales",
            10
          ),
          getDaypartComparison(merchantId, locationIds, startDate, endDate),
          getSavedViews(merchantId),
        ]
      );

      setComparisonData(comparison);
      setSummaryData(summary);
      setRankingsData(rankings);
      setDaypartData(daypart);
      setSavedViews(views);
    } catch (err) {
      console.error("Error loading analytics data:", err);
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setIsLoading(false);
    }
  }, [merchantId, locationIds, startDate, endDate, isInitializing]);

  // Load data after initialization
  useEffect(() => {
    if (!isInitializing && merchantId && locationIds.length > 0) {
      loadData();
    }
  }, [isInitializing, loadData, merchantId, locationIds.length]);

  // Load hourly data for a specific date
  const loadHourlyData = useCallback(
    async (date: string) => {
      if (!merchantId || locationIds.length === 0) return;

      try {
        const data = await getHourlyComparison(merchantId, locationIds, date);
        setHourlyData(data);
      } catch (err) {
        console.error("Error loading hourly data:", err);
      }
    },
    [merchantId, locationIds]
  );

  // Load rankings for a specific metric
  const loadRankings = useCallback(
    async (metric: string = "gross_sales") => {
      if (!merchantId) return;

      try {
        const data = await getLocationRankings(
          merchantId,
          startDate,
          endDate,
          metric,
          10
        );
        setRankingsData(data);
      } catch (err) {
        console.error("Error loading rankings:", err);
      }
    },
    [merchantId, startDate, endDate]
  );

  // Refresh all data
  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  return {
    // State
    isInitializing,
    isLoading,
    wasBackfilled,
    error: initError || error,

    // Data
    comparisonData,
    summaryData,
    rankingsData,
    daypartData,
    hourlyData,
    savedViews,

    // Actions
    refresh,
    loadHourlyData,
    loadRankings,
  };
}

// ============================================================================
// SIMPLE HOOK FOR JUST INITIALIZATION CHECK
// Use this if you only need to ensure data exists
// ============================================================================

export function useAnalyticsInit(merchantId: string) {
  const [isReady, setIsReady] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!merchantId) return;

    const init = async () => {
      setIsBackfilling(true);

      try {
        const result = await ensureAnalyticsInitialized(merchantId);

        if (result.initialized) {
          setIsReady(true);
          if (result.wasBackfilled) {
            console.log(
              "✅ Analytics backfill completed for merchant:",
              merchantId
            );
          }
        } else {
          setError(result.error || "Failed to initialize");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsBackfilling(false);
      }
    };

    init();
  }, [merchantId]);

  return { isReady, isBackfilling, error };
}
