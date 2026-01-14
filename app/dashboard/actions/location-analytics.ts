"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// ============================================================================
// LOCATION COMPARISON ANALYTICS ACTIONS
// These actions work with the analytics schema for multi-location comparisons
// ============================================================================

export interface LocationComparisonData {
  location_id: string;
  location_name: string;
  business_date: string;
  gross_sales: number;
  net_sales: number;
  order_count: number;
  avg_ticket: number;
  tips_total: number;
  discounts_total: number;
  labor_cost_percentage: number;
  items_sold: number;
}

export interface HourlyComparisonData {
  location_id: string;
  location_name: string;
  business_date: string;
  hour_of_day: number;
  gross_sales: number;
  order_count: number;
  avg_ticket: number;
}

export interface LocationRanking {
  rank: number;
  location_id: string;
  location_name: string;
  metric_value: number;
  metric_vs_avg_pct: number;
  trend_pct: number;
}

export interface DaypartData {
  location_id: string;
  location_name: string;
  daypart: string;
  total_sales: number;
  order_count: number;
  pct_of_daily_sales: number;
}

export interface LocationSummary {
  location_id: string;
  location_name: string;
  total_gross_sales: number;
  total_net_sales: number;
  total_orders: number;
  avg_daily_sales: number;
  avg_ticket: number;
  total_tips: number;
  labor_cost_pct: number;
  best_day: string;
  best_day_sales: number;
  worst_day: string;
  worst_day_sales: number;
}

export interface BackfillResult {
  location_id: string;
  days_processed: number;
}

// ============================================================================
// BACKFILL & INITIALIZATION
// ============================================================================

/**
 * Check if analytics data exists for a merchant
 * Returns true if there's already data, false if backfill is needed
 */
export async function checkAnalyticsDataExists(
  merchantId: string
): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  try {
    const { count, error } = await supabase
      .schema("analytics")
      .from("location_daily_stats")
      .select("*", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .limit(1);

    if (error) {
      console.error("Error checking analytics data:", error);
      // If table doesn't exist yet, return true to skip backfill
      if (error.code === "42P01") {
        console.log("Analytics tables not yet created");
        return true;
      }
      return true; // Assume data exists on error
    }

    return (count ?? 0) > 0;
  } catch (err) {
    console.error("Error in checkAnalyticsDataExists:", err);
    return true; // Assume data exists on error
  }
}

/**
 * Trigger backfill for a merchant
 * This populates the analytics tables with historical data
 */
export async function triggerAnalyticsBackfill(
  merchantId: string,
  startDate?: string,
  endDate?: string
): Promise<{ success: boolean; results?: BackfillResult[]; error?: string }> {
  const supabase = createServerSupabaseClient();

  // Default: backfill last 90 days
  const end = endDate || new Date().toISOString().split("T")[0];
  const start =
    startDate ||
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  try {
    const { data, error } = await supabase
      .schema("analytics")
      .rpc("backfill_stats", {
        p_merchant_id: merchantId,
        p_start_date: start,
        p_end_date: end,
      });

    if (error) {
      console.error("Backfill error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, results: data as BackfillResult[] };
  } catch (err) {
    console.error("Error in triggerAnalyticsBackfill:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Initialize analytics for a merchant if needed
 * Call this when loading the analytics page
 */
export async function ensureAnalyticsInitialized(
  merchantId: string
): Promise<{ initialized: boolean; wasBackfilled: boolean; error?: string }> {
  const dataExists = await checkAnalyticsDataExists(merchantId);

  if (dataExists) {
    return { initialized: true, wasBackfilled: false };
  }

  // Need to backfill
  console.log(`Initializing analytics backfill for merchant: ${merchantId}`);
  const result = await triggerAnalyticsBackfill(merchantId);

  if (result.success) {
    return { initialized: true, wasBackfilled: true };
  }

  return { initialized: false, wasBackfilled: false, error: result.error };
}

// ============================================================================
// COMPARISON QUERIES
// ============================================================================

/**
 * Get location comparison data for a date range
 */
export async function getLocationComparison(
  merchantId: string,
  locationIds: string[],
  startDate: string,
  endDate: string
): Promise<LocationComparisonData[]> {
  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .schema("analytics")
      .rpc("get_location_comparison", {
        p_merchant_id: merchantId,
        p_location_ids: locationIds,
        p_start_date: startDate,
        p_end_date: endDate,
      });

    if (error) {
      console.error("Error getting location comparison:", error);
      return [];
    }

    return data as LocationComparisonData[];
  } catch (err) {
    console.error("Error in getLocationComparison:", err);
    return [];
  }
}

/**
 * Get hourly comparison data for specific dates
 */
export async function getHourlyComparison(
  merchantId: string,
  locationIds: string[],
  startDate: string,
  endDate?: string
): Promise<HourlyComparisonData[]> {
  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .schema("analytics")
      .rpc("get_hourly_comparison", {
        p_merchant_id: merchantId,
        p_location_ids: locationIds,
        p_start_date: startDate,
        p_end_date: endDate || startDate,
      });

    if (error) {
      console.error("Error getting hourly comparison:", error);
      return [];
    }

    return data as HourlyComparisonData[];
  } catch (err) {
    console.error("Error in getHourlyComparison:", err);
    return [];
  }
}

/**
 * Get location rankings for a metric
 */
export async function getLocationRankings(
  merchantId: string,
  startDate: string,
  endDate: string,
  metric: string = "gross_sales",
  limit: number = 10
): Promise<LocationRanking[]> {
  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .schema("analytics")
      .rpc("get_location_rankings", {
        p_merchant_id: merchantId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_metric: metric,
        p_limit: limit,
      });

    if (error) {
      console.error("Error getting location rankings:", error);
      return [];
    }

    return data as LocationRanking[];
  } catch (err) {
    console.error("Error in getLocationRankings:", err);
    return [];
  }
}

/**
 * Get daypart analysis for locations
 */
export async function getDaypartComparison(
  merchantId: string,
  locationIds: string[],
  startDate: string,
  endDate: string
): Promise<DaypartData[]> {
  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .schema("analytics")
      .rpc("get_daypart_comparison", {
        p_merchant_id: merchantId,
        p_location_ids: locationIds,
        p_start_date: startDate,
        p_end_date: endDate,
      });

    if (error) {
      console.error("Error getting daypart comparison:", error);
      return [];
    }

    return data as DaypartData[];
  } catch (err) {
    console.error("Error in getDaypartComparison:", err);
    return [];
  }
}

/**
 * Get summary stats for locations
 */
export async function getComparisonSummary(
  merchantId: string,
  locationIds: string[],
  startDate: string,
  endDate: string
): Promise<LocationSummary[]> {
  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .schema("analytics")
      .rpc("get_comparison_summary", {
        p_merchant_id: merchantId,
        p_location_ids: locationIds,
        p_start_date: startDate,
        p_end_date: endDate,
      });

    if (error) {
      console.error("Error getting comparison summary:", error);
      return [];
    }

    return data as LocationSummary[];
  } catch (err) {
    console.error("Error in getComparisonSummary:", err);
    return [];
  }
}

// ============================================================================
// SAVED VIEWS
// ============================================================================

export interface SavedComparisonView {
  id: string;
  name: string;
  description?: string;
  location_ids: string[];
  metrics: string[];
  default_time_range: string;
  chart_type: string;
  show_comparison_period: boolean;
  comparison_period: string;
  color_assignments: Record<string, string>;
  is_default: boolean;
  is_shared: boolean;
  created_at: string;
}

/**
 * Get saved comparison views for a merchant
 */
export async function getSavedViews(
  merchantId: string
): Promise<SavedComparisonView[]> {
  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .schema("analytics")
      .from("saved_comparison_views")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error getting saved views:", error);
      return [];
    }

    return data as SavedComparisonView[];
  } catch (err) {
    console.error("Error in getSavedViews:", err);
    return [];
  }
}

/**
 * Create a new saved view
 */
export async function createSavedView(
  merchantId: string,
  userId: string,
  view: Omit<SavedComparisonView, "id" | "created_at">
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .schema("analytics")
      .from("saved_comparison_views")
      .insert({
        merchant_id: merchantId,
        created_by_user_id: userId,
        ...view,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error creating saved view:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (err) {
    console.error("Error in createSavedView:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Delete a saved view
 */
export async function deleteSavedView(
  viewId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();

  try {
    const { error } = await supabase
      .schema("analytics")
      .from("saved_comparison_views")
      .delete()
      .eq("id", viewId);

    if (error) {
      console.error("Error deleting saved view:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Error in deleteSavedView:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================================
// MANUAL AGGREGATION TRIGGERS
// ============================================================================

/**
 * Manually trigger hourly aggregation for a location
 * Useful for refreshing data after a busy period
 */
export async function refreshHourlyStats(
  locationId: string,
  hourStart: string // ISO timestamp
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();

  try {
    const { error } = await supabase
      .schema("analytics")
      .rpc("aggregate_hourly_stats", {
        p_location_id: locationId,
        p_hour_start: hourStart,
      });

    if (error) {
      console.error("Error refreshing hourly stats:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Error in refreshHourlyStats:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Manually trigger daily aggregation for a location
 */
export async function refreshDailyStats(
  locationId: string,
  businessDate: string // YYYY-MM-DD
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();

  try {
    const { error } = await supabase
      .schema("analytics")
      .rpc("aggregate_daily_stats", {
        p_location_id: locationId,
        p_business_date: businessDate,
      });

    if (error) {
      console.error("Error refreshing daily stats:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Error in refreshDailyStats:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
