"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildReportingQueryRange,
  DEFAULT_REPORTING_TIMEZONE,
  parseReportDateKey,
} from "@/lib/reporting/date-range";
import {
  LocationComparisonData,
  DaypartData,
  LocationSummary,
  HourlyComparisonData,
  LocationRanking,
} from "./location-analytics";

// ============================================================================
// LOCATION COMPARISON — built on the shared report calculation
//
// Every figure comes from the `get_sales_report` RPC (supabase/migrations/
// 20260930150000_report_number_consistency.sql), the same calculation behind
// Sales Overview, Financials and Sales by Items. So only paid orders count,
// money is on the lane the order was charged on, refunds are subtracted on the
// day they happened, and days/hours are in each location's own timezone.
// (Previously these functions summed raw `orders.subtotal` with no payment
// gate, counting unpaid open checks as sales, with UTC day boundaries.)
// ============================================================================

type SalesReportGroupBy =
  | "total"
  | "location"
  | "location_day"
  | "location_hour"
  | "location_dow_hour";

/** One row of `get_sales_report`. Grouping keys are present only when grouped by. */
interface SalesReportRow {
  day?: string;
  hour?: number;
  /** ISO day of week: 1 = Monday … 7 = Sunday */
  dow?: number;
  location_id?: string;
  gross_sales: number;
  discounts: number;
  refunds: number;
  net_sales: number;
  tips: number;
  order_count: number;
  avg_order_value: number;
}

interface ReportContext {
  merchantId: string;
  locationNames: Map<string, string>;
  timezones: Map<string, string>;
}

async function getReportContext(clerkOrgId: string): Promise<ReportContext | null> {
  const supabase = createServerSupabaseClient();
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !merchant) {
    console.error("[LocationComparison] Error getting merchant:", error);
    return null;
  }

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name, timezone")
    .eq("merchant_id", merchant.id);

  return {
    merchantId: merchant.id,
    locationNames: new Map((locations ?? []).map((l) => [l.id, l.name ?? "Unknown"])),
    timezones: new Map(
      (locations ?? []).map((l) => [l.id, l.timezone ?? DEFAULT_REPORTING_TIMEZONE])
    ),
  };
}

/**
 * Run `get_sales_report` for calendar days `startDate`..`endDate` (inclusive,
 * "yyyy-MM-dd"), anchored to the selected locations' timezones.
 */
async function fetchSalesReport(
  ctx: ReportContext,
  locationIds: string[] | null,
  startDate: string,
  endDate: string,
  groupBy: SalesReportGroupBy
): Promise<SalesReportRow[]> {
  const ids = locationIds && locationIds.length > 0 ? locationIds : null;
  const range = buildReportingQueryRange(
    { from: parseReportDateKey(startDate), to: parseReportDateKey(endDate) },
    (ids ?? Array.from(ctx.timezones.keys())).map((id) => ctx.timezones.get(id))
  );

  const supabase = createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc("get_sales_report", {
    p_merchant_id: ctx.merchantId,
    p_location_ids: ids,
    p_start: range.from.toISOString(),
    p_end: range.to.toISOString(),
    p_group_by: groupBy,
  });

  if (error) {
    console.error(`[LocationComparison] get_sales_report(${groupBy}) failed:`, error);
    return [];
  }

  return ((data as SalesReportRow[] | null) ?? []).map((r) => ({
    ...r,
    gross_sales: Number(r.gross_sales) || 0,
    discounts: Number(r.discounts) || 0,
    refunds: Number(r.refunds) || 0,
    net_sales: Number(r.net_sales) || 0,
    tips: Number(r.tips) || 0,
    order_count: Number(r.order_count) || 0,
    avg_order_value: Number(r.avg_order_value) || 0,
  }));
}

/**
 * Daily sales per location (line chart).
 */
export async function getLocationComparisonFromOrders(
  clerkOrgId: string,
  locationIds: string[],
  startDate: string,
  endDate: string
): Promise<LocationComparisonData[]> {
  const ctx = await getReportContext(clerkOrgId);
  if (!ctx) return [];

  const rows = await fetchSalesReport(ctx, locationIds, startDate, endDate, "location_day");

  return rows
    .filter((r) => r.location_id && r.day)
    .map((r) => ({
      location_id: r.location_id!,
      location_name: ctx.locationNames.get(r.location_id!) ?? "Unknown",
      business_date: r.day!,
      gross_sales: r.gross_sales,
      net_sales: r.net_sales,
      order_count: r.order_count,
      avg_ticket: r.avg_order_value,
      tips_total: r.tips,
      discounts_total: r.discounts,
      labor_cost_percentage: 0,
      items_sold: 0,
    }))
    .sort((a, b) => a.business_date.localeCompare(b.business_date));
}

/** Location-local hour → daypart. */
function getDaypart(hour: number): string {
  if (hour >= 5 && hour <= 10) return "breakfast";
  if (hour >= 11 && hour <= 14) return "lunch";
  if (hour >= 15 && hour <= 17) return "afternoon";
  if (hour >= 18 && hour <= 21) return "dinner";
  return "late_night";
}

/**
 * Net sales per location per daypart (bar chart).
 */
export async function getDaypartComparisonFromOrders(
  clerkOrgId: string,
  locationIds: string[],
  startDate: string,
  endDate: string
): Promise<DaypartData[]> {
  const ctx = await getReportContext(clerkOrgId);
  if (!ctx) return [];

  const rows = await fetchSalesReport(ctx, locationIds, startDate, endDate, "location_hour");

  const aggregated = new Map<string, DaypartData>();
  const locationTotals = new Map<string, number>();

  rows.forEach((r) => {
    if (!r.location_id || r.hour === undefined) return;
    const daypart = getDaypart(r.hour);
    const key = `${r.location_id}-${daypart}`;

    locationTotals.set(r.location_id, (locationTotals.get(r.location_id) || 0) + r.net_sales);

    const agg = aggregated.get(key) ?? {
      location_id: r.location_id,
      location_name: ctx.locationNames.get(r.location_id) ?? "Unknown",
      daypart,
      total_sales: 0,
      order_count: 0,
      pct_of_daily_sales: 0,
    };
    agg.total_sales += r.net_sales;
    agg.order_count += r.order_count;
    aggregated.set(key, agg);
  });

  aggregated.forEach((agg) => {
    const total = locationTotals.get(agg.location_id) || 0;
    agg.pct_of_daily_sales = total > 0 ? (agg.total_sales / total) * 100 : 0;
  });

  return Array.from(aggregated.values());
}

/**
 * Per-location totals, best and worst day (radar chart / summary).
 */
export async function getComparisonSummaryFromOrders(
  clerkOrgId: string,
  locationIds: string[],
  startDate: string,
  endDate: string
): Promise<LocationSummary[]> {
  const ctx = await getReportContext(clerkOrgId);
  if (!ctx) return [];

  const [totals, daily] = await Promise.all([
    fetchSalesReport(ctx, locationIds, startDate, endDate, "location"),
    fetchSalesReport(ctx, locationIds, startDate, endDate, "location_day"),
  ]);

  return totals
    .filter((t) => t.location_id)
    .map((t) => {
      const days = daily
        .filter((d) => d.location_id === t.location_id && d.day)
        .sort((a, b) => b.net_sales - a.net_sales);
      const dayCount = days.length || 1;

      return {
        location_id: t.location_id!,
        location_name: ctx.locationNames.get(t.location_id!) ?? "Unknown",
        total_gross_sales: t.gross_sales,
        total_net_sales: t.net_sales,
        total_orders: t.order_count,
        avg_daily_sales: t.net_sales / dayCount,
        avg_ticket: t.avg_order_value,
        total_tips: t.tips,
        labor_cost_pct: 0, // Not available without labor data
        best_day: days[0]?.day ?? "",
        best_day_sales: days[0]?.net_sales ?? 0,
        worst_day: days[days.length - 1]?.day ?? "",
        worst_day_sales: days[days.length - 1]?.net_sales ?? 0,
      };
    })
    .sort((a, b) => b.total_net_sales - a.total_net_sales);
}

/**
 * Sales by location, weekday and hour (heatmap). Weekday and hour are the
 * location's local time; `day_of_week` is 0 = Sunday … 6 = Saturday.
 */
export async function getHourlyComparisonFromOrders(
  clerkOrgId: string,
  locationIds: string[],
  startDate: string,
  endDate: string
): Promise<HourlyComparisonData[]> {
  const ctx = await getReportContext(clerkOrgId);
  if (!ctx) return [];

  const rows = await fetchSalesReport(
    ctx,
    locationIds,
    startDate,
    endDate,
    "location_dow_hour"
  );

  return rows
    .filter((r) => r.location_id && r.hour !== undefined && r.dow !== undefined)
    .map((r) => ({
      location_id: r.location_id!,
      location_name: ctx.locationNames.get(r.location_id!) ?? "Unknown",
      business_date: "",
      day_of_week: r.dow! % 7,
      hour_of_day: r.hour!,
      gross_sales: r.gross_sales,
      order_count: r.order_count,
      avg_ticket: r.avg_order_value,
    }));
}

/**
 * Rank the selected locations for the period, with the change against the
 * equal-length period just before and the gap to the average location.
 */
export async function getLocationRankingsFromOrders(
  clerkOrgId: string,
  startDate: string,
  endDate: string,
  metric: string = "gross_sales",
  limit: number = 10,
  locationIds: string[] | null = null
): Promise<LocationRanking[]> {
  const ctx = await getReportContext(clerkOrgId);
  if (!ctx) return [];

  // Previous period: same number of calendar days, ending the day before.
  const start = parseReportDateKey(startDate);
  const end = parseReportDateKey(endDate);
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
  const prevEnd = new Date(start.getTime() - dayMs);
  const prevStart = new Date(prevEnd.getTime() - (spanDays - 1) * dayMs);
  const toKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const [current, previous] = await Promise.all([
    fetchSalesReport(ctx, locationIds, startDate, endDate, "location"),
    fetchSalesReport(ctx, locationIds, toKey(prevStart), toKey(prevEnd), "location"),
  ]);

  const valueOf = (r: SalesReportRow) =>
    metric === "net_sales"
      ? r.net_sales
      : metric === "order_count"
        ? r.order_count
        : r.gross_sales;

  const currentRows = current.filter((r) => r.location_id && r.order_count > 0);
  if (currentRows.length === 0) return [];

  const prevByLocation = new Map(
    previous.filter((r) => r.location_id).map((r) => [r.location_id!, valueOf(r)])
  );
  const total = currentRows.reduce((s, r) => s + valueOf(r), 0);
  const average = total / currentRows.length;

  return currentRows
    .map((r) => {
      const value = valueOf(r);
      const prevValue = prevByLocation.get(r.location_id!) || 0;
      return {
        rank: 0,
        location_id: r.location_id!,
        location_name: ctx.locationNames.get(r.location_id!) ?? "Unknown",
        metric_value: value,
        metric_vs_avg_pct: average > 0 ? ((value - average) / average) * 100 : 0,
        trend_pct:
          prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : value > 0 ? 100 : 0,
      };
    })
    .sort((a, b) => b.metric_value - a.metric_value)
    .map((r, i) => ({ ...r, rank: i + 1 }))
    .slice(0, limit);
}
