"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applyReportablePredicate } from "@/lib/reporting/recognized-order";
import {
  canonicalizePlatform,
  sortPlatformSlugs,
  type PlatformSlug,
} from "@/lib/orderout/platform";

// ============================================================================
// Online Ordering Channel Analytics
// ============================================================================
//
// Data source: public.orders (order_source = 'online'), left-joined to
// public.online_orders for the provider/delivery_company that identifies the
// platform. This is the LIVE ingestion path (process_online_order) — the older
// orderout_orders table is written only by the disabled legacy webhook.
//
// Every row is gated by the canonical recognized-order predicate
// (is_order_reportable) so only paid, non-cancelled orders count — the same set
// the headline Online Revenue reconciles to.
//
// Platform identity is normalized via lib/orderout/platform.ts: OrderOut is
// decomposed into the real platform, casing is collapsed, first-party channels
// (website/app) bucket into "first_party", and anything unresolved → "other".

export interface PlatformSummary {
  /** Canonical platform slug (grubhub | doordash | ubereats | first_party | other). */
  platform: PlatformSlug;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  totalServiceCharges: number;
  totalTips: number;
  totalDiscounts: number;
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

interface PlatformAccumulator {
  totalOrders: number;
  totalRevenue: number;
  totalServiceCharges: number;
  totalTips: number;
  totalDiscounts: number;
  cancelledOrders: number;
}

function emptyAccumulator(): PlatformAccumulator {
  return {
    totalOrders: 0,
    totalRevenue: 0,
    totalServiceCharges: 0,
    totalTips: 0,
    totalDiscounts: 0,
    cancelledOrders: 0,
  };
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
 * Get online ordering analytics broken down by delivery platform.
 */
export async function GetOnlineOrderingAnalytics(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<OnlineOrderingAnalytics> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return {
      platforms: [],
      dailyTrends: {},
      totalOnlineRevenue: 0,
      totalOnlineOrders: 0,
    };
  }

  const supabase = createServerSupabaseClient();

  // All recognized online orders for the merchant in range, with the linked
  // online_orders row (may be null for first-party storefront orders that
  // predate the online_orders link — those still bucket as first_party via
  // order_source). The recognized-order predicate applies to the base
  // `orders` table so only paid, non-cancelled orders count.
  let query = applyReportablePredicate(
    supabase
      .from("orders")
      .select(
        `total_amount, tip_amount, discount_amount, service_charge, delivery_platform, order_source, status, created_at,
         online_orders ( provider, delivery_company, provider_status )`
      )
      .eq("merchant_id", merchantId)
      .eq("order_source", "online")
  )
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("[OnlineOrderingAnalytics] Error fetching online orders:", error);
    return {
      platforms: [],
      dailyTrends: {},
      totalOnlineRevenue: 0,
      totalOnlineOrders: 0,
    };
  }

  const platformMap = new Map<PlatformSlug, PlatformAccumulator>();
  const trendsMap = new Map<PlatformSlug, Map<string, { orders: number; revenue: number }>>();

  for (const order of rows ?? []) {
    // The embedded relation comes back as an array (0..1 rows) or an object
    // depending on PostgREST cardinality inference — normalize to one row.
    const linkRaw = (order as { online_orders?: unknown }).online_orders;
    const link = (Array.isArray(linkRaw) ? linkRaw[0] : linkRaw) as
      | { provider?: string | null; delivery_company?: string | null; provider_status?: string | null }
      | null
      | undefined;

    const platform = canonicalizePlatform({
      deliveryPlatform: order.delivery_platform,
      deliveryCompany: link?.delivery_company,
      provider: link?.provider,
      // order_source='online' with no third-party signal → first_party, so
      // legacy/direct storefront orders (no online_orders link, null
      // delivery_platform) don't inflate the Other bucket.
      orderSource: order.order_source,
    });

    const total = Number(order.total_amount || 0);
    const dateStr = String(order.created_at).slice(0, 10);

    if (!platformMap.has(platform)) {
      platformMap.set(platform, emptyAccumulator());
    }
    const acc = platformMap.get(platform)!;
    acc.totalOrders += 1;
    acc.totalRevenue += total;
    acc.totalTips += Number(order.tip_amount || 0);
    acc.totalDiscounts += Number(order.discount_amount || 0);
    acc.totalServiceCharges += Number(order.service_charge || 0);
    if (link?.provider_status === "cancelled") acc.cancelledOrders += 1;

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

  // Order platforms by canonical display order, then build summaries.
  const orderedSlugs = sortPlatformSlugs(platformMap.keys());
  const platforms: PlatformSummary[] = orderedSlugs.map((slug) => {
    const data = platformMap.get(slug)!;
    return {
      platform: slug,
      ...data,
      avgOrderValue: data.totalOrders > 0 ? data.totalRevenue / data.totalOrders : 0,
    };
  });

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
