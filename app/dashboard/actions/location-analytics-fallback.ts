"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  LocationComparisonData,
  DaypartData,
  LocationSummary,
  HourlyComparisonData,
  LocationRanking,
} from "./location-analytics";

// ============================================================================
// FALLBACK ANALYTICS - Query orders directly when analytics tables are empty
// ============================================================================

/**
 * Get merchant ID from clerk org ID
 */
async function getMerchantId(clerkOrgId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !merchant) {
    console.error("[FallbackAnalytics] Error getting merchant:", error);
    return null;
  }

  return merchant.id;
}

/**
 * Get location comparison data by querying orders directly
 */
export async function getLocationComparisonFromOrders(
  clerkOrgId: string,
  locationIds: string[],
  startDate: string,
  endDate: string
): Promise<LocationComparisonData[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  try {
    // Query orders grouped by location and date
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        location_id,
        locations!inner(name),
        created_at,
        subtotal,
        discount_amount,
        tax_amount,
        tip_amount,
        total_amount
      `
      )
      .eq("merchant_id", merchantId)
      .in("location_id", locationIds)
      .not("status", "in", '("draft","cancelled","void")')
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`);

    if (error) {
      console.error("Error getting orders for comparison:", error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Aggregate by location and date
    const aggregated = new Map<string, LocationComparisonData>();

    data.forEach((order: any) => {
      const date = order.created_at.split("T")[0];
      const key = `${order.location_id}-${date}`;
      const locationName = order.locations?.name || "Unknown";

      if (!aggregated.has(key)) {
        aggregated.set(key, {
          location_id: order.location_id,
          location_name: locationName,
          business_date: date,
          gross_sales: 0,
          net_sales: 0,
          order_count: 0,
          avg_ticket: 0,
          tips_total: 0,
          discounts_total: 0,
          labor_cost_percentage: 0,
          items_sold: 0,
        });
      }

      const agg = aggregated.get(key)!;
      agg.gross_sales += Number(order.subtotal) || 0;
      agg.net_sales +=
        (Number(order.subtotal) || 0) - (Number(order.discount_amount) || 0);
      agg.order_count += 1;
      agg.tips_total += Number(order.tip_amount) || 0;
      agg.discounts_total += Number(order.discount_amount) || 0;
    });

    // Calculate avg ticket
    aggregated.forEach((agg) => {
      agg.avg_ticket =
        agg.order_count > 0 ? agg.gross_sales / agg.order_count : 0;
    });

    return Array.from(aggregated.values()).sort((a, b) =>
      a.business_date.localeCompare(b.business_date)
    );
  } catch (err) {
    console.error("Error in getLocationComparisonFromOrders:", err);
    return [];
  }
}

/**
 * Get daypart comparison data by querying orders directly
 */
export async function getDaypartComparisonFromOrders(
  clerkOrgId: string,
  locationIds: string[],
  startDate: string,
  endDate: string
): Promise<DaypartData[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        location_id,
        locations!inner(name),
        created_at,
        subtotal
      `
      )
      .eq("merchant_id", merchantId)
      .in("location_id", locationIds)
      .not("status", "in", '("draft","cancelled","void")')
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`);

    if (error) {
      console.error("Error getting orders for daypart:", error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Helper to get daypart from hour
    const getDaypart = (hour: number): string => {
      if (hour >= 5 && hour <= 10) return "breakfast";
      if (hour >= 11 && hour <= 14) return "lunch";
      if (hour >= 15 && hour <= 17) return "afternoon";
      if (hour >= 18 && hour <= 21) return "dinner";
      return "late_night";
    };

    // Aggregate by location and daypart
    const aggregated = new Map<string, DaypartData>();
    const locationTotals = new Map<string, number>();

    data.forEach((order: any) => {
      const hour = new Date(order.created_at).getHours();
      const daypart = getDaypart(hour);
      const key = `${order.location_id}-${daypart}`;
      const locationName = order.locations?.name || "Unknown";
      const sales = Number(order.subtotal) || 0;

      // Track location totals for percentage
      locationTotals.set(
        order.location_id,
        (locationTotals.get(order.location_id) || 0) + sales
      );

      if (!aggregated.has(key)) {
        aggregated.set(key, {
          location_id: order.location_id,
          location_name: locationName,
          daypart,
          total_sales: 0,
          order_count: 0,
          pct_of_daily_sales: 0,
        });
      }

      const agg = aggregated.get(key)!;
      agg.total_sales += sales;
      agg.order_count += 1;
    });

    // Calculate percentages
    aggregated.forEach((agg) => {
      const total = locationTotals.get(agg.location_id) || 1;
      agg.pct_of_daily_sales = (agg.total_sales / total) * 100;
    });

    return Array.from(aggregated.values());
  } catch (err) {
    console.error("Error in getDaypartComparisonFromOrders:", err);
    return [];
  }
}

/**
 * Get comparison summary by querying orders directly
 */
export async function getComparisonSummaryFromOrders(
  clerkOrgId: string,
  locationIds: string[],
  startDate: string,
  endDate: string
): Promise<LocationSummary[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        location_id,
        locations!inner(name),
        created_at,
        subtotal,
        discount_amount,
        tip_amount,
        total_amount
      `
      )
      .eq("merchant_id", merchantId)
      .in("location_id", locationIds)
      .not("status", "in", '("draft","cancelled","void")')
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`);

    if (error) {
      console.error("Error getting orders for summary:", error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Aggregate by location
    const aggregated = new Map<
      string,
      {
        location_id: string;
        location_name: string;
        total_gross_sales: number;
        total_net_sales: number;
        total_orders: number;
        total_tips: number;
        daily_sales: Map<string, number>;
      }
    >();

    data.forEach((order: any) => {
      const date = order.created_at.split("T")[0];
      const locationName = order.locations?.name || "Unknown";
      const gross = Number(order.subtotal) || 0;
      const net = gross - (Number(order.discount_amount) || 0);

      if (!aggregated.has(order.location_id)) {
        aggregated.set(order.location_id, {
          location_id: order.location_id,
          location_name: locationName,
          total_gross_sales: 0,
          total_net_sales: 0,
          total_orders: 0,
          total_tips: 0,
          daily_sales: new Map(),
        });
      }

      const agg = aggregated.get(order.location_id)!;
      agg.total_gross_sales += gross;
      agg.total_net_sales += net;
      agg.total_orders += 1;
      agg.total_tips += Number(order.tip_amount) || 0;
      agg.daily_sales.set(date, (agg.daily_sales.get(date) || 0) + gross);
    });

    // Calculate summary metrics
    const results: LocationSummary[] = [];

    aggregated.forEach((agg) => {
      const dailySalesArray = Array.from(agg.daily_sales.entries());
      const sortedByValue = [...dailySalesArray].sort((a, b) => b[1] - a[1]);
      const totalDays = dailySalesArray.length || 1;

      results.push({
        location_id: agg.location_id,
        location_name: agg.location_name,
        total_gross_sales: agg.total_gross_sales,
        total_net_sales: agg.total_net_sales,
        total_orders: agg.total_orders,
        avg_daily_sales: agg.total_gross_sales / totalDays,
        avg_ticket:
          agg.total_orders > 0 ? agg.total_gross_sales / agg.total_orders : 0,
        total_tips: agg.total_tips,
        labor_cost_pct: 0, // Not available without labor data
        best_day: sortedByValue[0]?.[0] || "",
        best_day_sales: sortedByValue[0]?.[1] || 0,
        worst_day: sortedByValue[sortedByValue.length - 1]?.[0] || "",
        worst_day_sales: sortedByValue[sortedByValue.length - 1]?.[1] || 0,
      });
    });

    return results.sort((a, b) => b.total_gross_sales - a.total_gross_sales);
  } catch (err) {
    console.error("Error in getComparisonSummaryFromOrders:", err);
    return [];
  }
}

/**
 * Get hourly comparison by querying orders directly
 */
export async function getHourlyComparisonFromOrders(
  clerkOrgId: string,
  locationIds: string[],
  startDate: string,
  endDate: string
): Promise<HourlyComparisonData[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        location_id,
        locations!inner(name),
        created_at,
        subtotal,
        total_amount
      `
      )
      .eq("merchant_id", merchantId)
      .in("location_id", locationIds)
      .not("status", "in", '("draft","cancelled","void")')
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`);

    if (error) {
      console.error("Error getting orders for hourly:", error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Aggregate by location, date, and hour
    const aggregated = new Map<string, HourlyComparisonData>();

    data.forEach((order: any) => {
      const date = order.created_at.split("T")[0];
      const hour = new Date(order.created_at).getHours();
      const key = `${order.location_id}-${date}-${hour}`;
      const locationName = order.locations?.name || "Unknown";
      const sales = Number(order.subtotal) || 0;

      if (!aggregated.has(key)) {
        aggregated.set(key, {
          location_id: order.location_id,
          location_name: locationName,
          business_date: date,
          hour_of_day: hour,
          gross_sales: 0,
          order_count: 0,
          avg_ticket: 0,
        });
      }

      const agg = aggregated.get(key)!;
      agg.gross_sales += sales;
      agg.order_count += 1;
    });

    // Calculate avg ticket
    aggregated.forEach((agg) => {
      agg.avg_ticket =
        agg.order_count > 0 ? agg.gross_sales / agg.order_count : 0;
    });

    return Array.from(aggregated.values());
  } catch (err) {
    console.error("Error in getHourlyComparisonFromOrders:", err);
    return [];
  }
}

/**
 * Get location rankings by querying orders directly
 * Calculates current metrics, trend vs previous period, and comparison vs average
 */
export async function getLocationRankingsFromOrders(
  clerkOrgId: string,
  startDate: string,
  endDate: string,
  metric: string = "gross_sales",
  limit: number = 10
): Promise<LocationRanking[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  // 1. Calculate previous period
  const start = new Date(startDate);
  const end = new Date(endDate);
  const durationMs = end.getTime() - start.getTime();

  // Previous period ends the day before current start
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  const prevStartDate = prevStart.toISOString().split("T")[0];
  const prevEndDate = prevEnd.toISOString().split("T")[0];

  try {
    // 2. Fetch Current Period Data
    const { data: currentData, error: currentError } = await supabase
      .from("orders")
      .select(
        `
        location_id,
        locations!inner(name),
        subtotal,
        total_amount,
        discount_amount
      `
      )
      .eq("merchant_id", merchantId)
      .not("status", "in", '("draft","cancelled","void")')
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`);

    if (currentError) {
      console.error(
        "Error getting orders for rankings (current):",
        currentError
      );
      return [];
    }

    // 3. Fetch Previous Period Data
    const { data: prevData, error: prevError } = await supabase
      .from("orders")
      .select("location_id, subtotal, total_amount, discount_amount")
      .eq("merchant_id", merchantId)
      .not("status", "in", '("draft","cancelled","void")')
      .gte("created_at", `${prevStartDate}T00:00:00`)
      .lte("created_at", `${prevEndDate}T23:59:59`);

    if (prevError) {
      console.error("Error getting orders for rankings (previous):", prevError);
      return [];
    }

    if (!currentData || currentData.length === 0) {
      return [];
    }

    // 4. Aggregate Current Period
    const currentAgg = new Map<string, { value: number; name: string }>();
    let totalValue = 0;

    currentData.forEach((order: any) => {
      let value = 0;
      if (metric === "gross_sales") value = Number(order.subtotal) || 0;
      else if (metric === "net_sales")
        value =
          (Number(order.subtotal) || 0) - (Number(order.discount_amount) || 0);
      else if (metric === "order_count") value = 1;

      const locId = order.location_id;
      const name = order.locations?.name || "Unknown";

      const current = currentAgg.get(locId) || { value: 0, name };
      current.value += value;
      currentAgg.set(locId, current);

      totalValue += value;
    });

    // 5. Aggregate Previous Period
    const prevAgg = new Map<string, number>();

    prevData?.forEach((order: any) => {
      let value = 0;
      if (metric === "gross_sales") value = Number(order.subtotal) || 0;
      else if (metric === "net_sales")
        value =
          (Number(order.subtotal) || 0) - (Number(order.discount_amount) || 0);
      else if (metric === "order_count") value = 1;

      const locId = order.location_id;
      prevAgg.set(locId, (prevAgg.get(locId) || 0) + value);
    });

    // 6. Calculate Metrics
    const locationCount = currentAgg.size;
    const averageValue = locationCount > 0 ? totalValue / locationCount : 0;
    const rankings: LocationRanking[] = [];

    currentAgg.forEach((data, locationId) => {
      const prevValue = prevAgg.get(locationId) || 0;

      // Comparison vs Avg
      let vsAvgPct = 0;
      if (averageValue > 0) {
        vsAvgPct = ((data.value - averageValue) / averageValue) * 100;
      }

      // Trend vs Previous
      let trendPct = 0;
      if (prevValue > 0) {
        trendPct = ((data.value - prevValue) / prevValue) * 100;
      } else if (data.value > 0) {
        trendPct = 100; // New growth
      }

      rankings.push({
        rank: 0, // Will assign after sort
        location_id: locationId,
        location_name: data.name,
        metric_value: data.value,
        metric_vs_avg_pct: vsAvgPct,
        trend_pct: trendPct,
      });
    });

    // 7. Sort and Assign Rank
    rankings.sort((a, b) => b.metric_value - a.metric_value);

    return rankings
      .map((r, i) => ({
        ...r,
        rank: i + 1,
      }))
      .slice(0, limit);
  } catch (err) {
    console.error("Error in getLocationRankingsFromOrders:", err);
    return [];
  }
}
