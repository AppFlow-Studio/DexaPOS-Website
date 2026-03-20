"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// ============================================================================
// Online Ordering Channel Analytics
// ============================================================================

export interface PlatformSummary {
  platform: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  totalDeliveryFees: number;
  totalServiceFees: number;
  totalTips: number;
  totalDiscounts: number;
  acceptedOrders: number;
  rejectedOrders: number;
  cancelledOrders: number;
}

export interface PlatformDailyTrend {
  date: string;
  orders: number;
  revenue: number;
}

export interface OnlineOrderingAnalytics {
  platforms: PlatformSummary[];
  dailyTrends: Record<string, PlatformDailyTrend[]>;
  totalOnlineRevenue: number;
  totalOnlineOrders: number;
}

async function getMerchantId(clerkOrgId: string) {
  const supabase = createServerSupabaseClient();
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !merchant) return null;
  return merchant.id;
}

/**
 * Get online ordering analytics broken down by delivery platform
 */
export async function GetOnlineOrderingAnalytics(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<OnlineOrderingAnalytics> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return { platforms: [], dailyTrends: {}, totalOnlineRevenue: 0, totalOnlineOrders: 0 };
  }

  const supabase = createServerSupabaseClient();

  // Get orderout_restaurants for this merchant (to filter by location if needed)
  let restaurantQuery = supabase
    .from("orderout_restaurants")
    .select("id, location_id")
    .eq("merchant_id", merchantId);

  if (locationId && locationId !== "all") {
    restaurantQuery = restaurantQuery.eq("location_id", locationId);
  }

  const { data: restaurants, error: restError } = await restaurantQuery;
  if (restError || !restaurants || restaurants.length === 0) {
    return { platforms: [], dailyTrends: {}, totalOnlineRevenue: 0, totalOnlineOrders: 0 };
  }

  const restaurantIds = restaurants.map((r) => r.id);

  // Get all orderout orders for these restaurants in the date range
  const { data: orders, error: ordersError } = await supabase
    .from("orderout_orders")
    .select(
      "id, delivery_platform, order_type, accept_status, platform_subtotal, platform_tax, platform_delivery_fee, platform_service_fee, platform_discount, platform_tip, platform_total, placed_on, created_at, cancel_source, cancelled_at"
    )
    .in("orderout_restaurant_id", restaurantIds)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (ordersError || !orders) {
    console.error("[OnlineOrderingAnalytics] Error fetching orders:", ordersError);
    return { platforms: [], dailyTrends: {}, totalOnlineRevenue: 0, totalOnlineOrders: 0 };
  }

  // Aggregate by platform
  const platformMap = new Map<string, {
    totalOrders: number;
    totalRevenue: number;
    totalDeliveryFees: number;
    totalServiceFees: number;
    totalTips: number;
    totalDiscounts: number;
    acceptedOrders: number;
    rejectedOrders: number;
    cancelledOrders: number;
  }>();

  // Daily trends by platform
  const trendsMap = new Map<string, Map<string, { orders: number; revenue: number }>>();

  for (const order of orders) {
    const platform = (order.delivery_platform || "unknown").toLowerCase();
    const total = Number(order.platform_total || 0);
    const dateStr = (order.placed_on || order.created_at).slice(0, 10);

    // Platform aggregation
    if (!platformMap.has(platform)) {
      platformMap.set(platform, {
        totalOrders: 0,
        totalRevenue: 0,
        totalDeliveryFees: 0,
        totalServiceFees: 0,
        totalTips: 0,
        totalDiscounts: 0,
        acceptedOrders: 0,
        rejectedOrders: 0,
        cancelledOrders: 0,
      });
    }

    const p = platformMap.get(platform)!;
    p.totalOrders += 1;
    p.totalRevenue += total;
    p.totalDeliveryFees += Number(order.platform_delivery_fee || 0);
    p.totalServiceFees += Number(order.platform_service_fee || 0);
    p.totalTips += Number(order.platform_tip || 0);
    p.totalDiscounts += Number(order.platform_discount || 0);

    if (order.accept_status === "accepted") p.acceptedOrders += 1;
    else if (order.accept_status === "rejected") p.rejectedOrders += 1;

    if (order.cancelled_at) p.cancelledOrders += 1;

    // Daily trends
    if (!trendsMap.has(platform)) {
      trendsMap.set(platform, new Map());
    }
    const dailyMap = trendsMap.get(platform)!;
    if (!dailyMap.has(dateStr)) {
      dailyMap.set(dateStr, { orders: 0, revenue: 0 });
    }
    const day = dailyMap.get(dateStr)!;
    day.orders += 1;
    day.revenue += total;
  }

  // Build platform summaries
  const platforms: PlatformSummary[] = Array.from(platformMap.entries())
    .map(([platform, data]) => ({
      platform,
      ...data,
      avgOrderValue: data.totalOrders > 0 ? data.totalRevenue / data.totalOrders : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Build daily trends
  const dailyTrends: Record<string, PlatformDailyTrend[]> = {};
  for (const [platform, dayMap] of trendsMap.entries()) {
    dailyTrends[platform] = Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  const totalOnlineRevenue = platforms.reduce((sum, p) => sum + p.totalRevenue, 0);
  const totalOnlineOrders = platforms.reduce((sum, p) => sum + p.totalOrders, 0);

  return { platforms, dailyTrends, totalOnlineRevenue, totalOnlineOrders };
}
