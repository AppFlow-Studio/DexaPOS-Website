"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// ============================================================================
// Phase 2 — Inventory Reporting & Analytics server actions
//
// Read-only report wrappers around the get_cogs_report() / get_food_cost_analysis()
// RPCs plus a KPI summary and waste analytics. No mutations, so no LogAuditEvent
// (consistent with GetWasteLogs in waste.ts).
// ============================================================================

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface CogsCategoryRow {
  category: string;
  cogs: number;
  purchases: number;
  beginning_value: number;
  ending_value: number;
}

export interface CogsItemRow {
  inventory_item_id: string;
  name: string;
  category: string;
  unit_type: string;
  cogs: number;
  purchases: number;
  beginning_value: number;
  ending_value: number;
}

export interface CogsReport {
  start_date: string;
  end_date: string;
  beginning_value: number;
  purchases: number;
  ending_value: number;
  total_cogs: number;
  revenue: number;
  cogs_percent: number;
  gross_profit: number;
  by_category: CogsCategoryRow[];
  by_item: CogsItemRow[];
}

export interface FoodCostCategoryRow {
  category: string;
  theoretical: number;
  actual: number;
  variance: number;
}

export interface FoodCostWeekRow {
  week_start: string;
  theoretical: number;
  actual: number;
}

export interface FoodCostAnalysis {
  start_date: string;
  end_date: string;
  theoretical_cost: number;
  actual_cost: number;
  waste_cost: number;
  variance: number;
  variance_percent: number;
  by_category: FoodCostCategoryRow[];
  by_week: FoodCostWeekRow[];
}

export interface InventoryKpis {
  inventory_value: number;
  low_stock_count: number;
  today_waste_cost: number;
  open_po_count: number;
  open_po_amount: number;
  cogs_trend: { week_start: string; cogs: number }[];
}

export interface WasteAnalytics {
  total_cost: number;
  by_reason: { reason: string; cost: number; quantity: number }[];
  by_item: { name: string; cost: number; quantity: number }[];
  by_week: { week_start: string; cost: number }[];
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function resolveMerchantId(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clerkOrgId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !data) {
    console.error("[inventory-reports] merchant lookup failed:", error);
    return null;
  }
  return data.id;
}

/** Start of the ISO week (Monday) for a given date, as YYYY-MM-DD. */
function weekStart(d: Date): string {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // 0 = Monday
  copy.setDate(copy.getDate() - day);
  return copy.toISOString().slice(0, 10);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// T2.1 — COGS report
// ============================================================================

export async function GetCogsReport(
  clerkOrgId: string,
  locationId: string | null | undefined,
  dateRange: DateRange,
): Promise<{ data?: CogsReport; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!locationId || locationId === "all") {
    return { error: "Select a specific location to view COGS" };
  }

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const { data, error } = await supabase.rpc("get_cogs_report", {
    p_merchant_id: merchantId,
    p_location_id: locationId,
    p_start_date: dateRange.from,
    p_end_date: dateRange.to,
  });

  if (error) {
    console.error("[inventory-reports] get_cogs_report failed:", error);
    return { error: error.message };
  }
  return { data: data as unknown as CogsReport };
}

// ============================================================================
// T2.2 — Food cost analysis
// ============================================================================

export async function GetFoodCostAnalysis(
  clerkOrgId: string,
  locationId: string | null | undefined,
  dateRange: DateRange,
): Promise<{ data?: FoodCostAnalysis; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!locationId || locationId === "all") {
    return { error: "Select a specific location to view food cost" };
  }

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const { data, error } = await supabase.rpc("get_food_cost_analysis", {
    p_merchant_id: merchantId,
    p_location_id: locationId,
    p_start_date: dateRange.from,
    p_end_date: dateRange.to,
  });

  if (error) {
    console.error("[inventory-reports] get_food_cost_analysis failed:", error);
    return { error: error.message };
  }
  return { data: data as unknown as FoodCostAnalysis };
}

// ============================================================================
// T2.4 — Inventory KPIs (Dashboard tab)
// ============================================================================

export async function GetInventoryKpis(
  clerkOrgId: string,
  locationId: string | null | undefined,
): Promise<{ data?: InventoryKpis; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!locationId || locationId === "all") {
    return { error: "Select a specific location to view the dashboard" };
  }

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const today = isoDate(new Date());

  const [stockRes, overridesRes, wasteRes, poRes] = await Promise.all([
    supabase
      .from("location_inventory_stock")
      .select(
        "stock_quantity, reorder_threshold, inventory_item_id, inventory_items!inner(cost_per_unit, reorder_point, is_active)",
      )
      .eq("location_id", locationId),
    supabase
      .from("location_inventory_overrides")
      .select("inventory_item_id, custom_cost, cost_per_unit")
      .eq("location_id", locationId),
    supabase
      .from("waste_logs")
      .select("estimated_cost")
      .eq("location_id", locationId)
      .eq("waste_date", today),
    supabase
      .from("purchase_orders")
      .select("total_amount")
      .eq("merchant_id", merchantId)
      .eq("location_id", locationId)
      .in("status", ["draft", "pending"]),
  ]);

  if (stockRes.error) {
    console.error("[inventory-reports] KPI stock query failed:", stockRes.error);
    return { error: stockRes.error.message };
  }

  // Cost overrides map
  const costOverride = new Map<string, number>();
  for (const o of overridesRes.data ?? []) {
    const c = o.custom_cost ?? o.cost_per_unit;
    if (c != null) costOverride.set(o.inventory_item_id, Number(c));
  }

  let inventoryValue = 0;
  let lowStockCount = 0;
  for (const row of (stockRes.data ?? []) as any[]) {
    const item = row.inventory_items;
    if (!item?.is_active) continue;
    const qty = Number(row.stock_quantity ?? 0);
    const cost =
      costOverride.get(row.inventory_item_id) ?? Number(item.cost_per_unit ?? 0);
    inventoryValue += qty * cost;

    const threshold = Number(row.reorder_threshold ?? item.reorder_point ?? 0);
    if (threshold > 0 && qty > 0 && qty <= threshold) lowStockCount += 1;
  }

  const todayWasteCost = (wasteRes.data ?? []).reduce(
    (sum, w) => sum + Number(w.estimated_cost ?? 0),
    0,
  );
  const openPoAmount = (poRes.data ?? []).reduce(
    (sum, p) => sum + Number(p.total_amount ?? 0),
    0,
  );

  // COGS trend — last 4 ISO weeks.
  const trendWeeks: { from: string; to: string; week_start: string }[] = [];
  for (let i = 3; i >= 0; i--) {
    const ref = new Date();
    ref.setDate(ref.getDate() - i * 7);
    const ws = weekStart(ref);
    const wsDate = new Date(ws);
    const we = new Date(wsDate);
    we.setDate(we.getDate() + 6);
    trendWeeks.push({ from: ws, to: isoDate(we), week_start: ws });
  }

  const trendResults = await Promise.all(
    trendWeeks.map((w) =>
      supabase.rpc("get_cogs_report", {
        p_merchant_id: merchantId,
        p_location_id: locationId,
        p_start_date: w.from,
        p_end_date: w.to,
      }),
    ),
  );

  const cogsTrend = trendWeeks.map((w, idx) => {
    const r = trendResults[idx];
    const cogs = r.error ? 0 : Number((r.data as any)?.total_cogs ?? 0);
    return { week_start: w.week_start, cogs };
  });

  return {
    data: {
      inventory_value: Math.round(inventoryValue * 100) / 100,
      low_stock_count: lowStockCount,
      today_waste_cost: Math.round(todayWasteCost * 100) / 100,
      open_po_count: (poRes.data ?? []).length,
      open_po_amount: Math.round(openPoAmount * 100) / 100,
      cogs_trend: cogsTrend,
    },
  };
}

// ============================================================================
// T2.6 — Waste analytics
// ============================================================================

export async function GetWasteAnalytics(
  clerkOrgId: string,
  locationId: string | null | undefined,
  dateRange: DateRange,
): Promise<{ data?: WasteAnalytics; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!locationId || locationId === "all") {
    return { error: "Select a specific location to view waste analytics" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("waste_logs")
    .select(
      "estimated_cost, quantity, reason, waste_date, inventory_item:inventory_items!inventory_item_id(name)",
    )
    .eq("location_id", locationId)
    .gte("waste_date", dateRange.from)
    .lte("waste_date", dateRange.to);

  if (error) {
    console.error("[inventory-reports] GetWasteAnalytics failed:", error);
    return { error: error.message };
  }

  const byReason = new Map<string, { cost: number; quantity: number }>();
  const byItem = new Map<string, { cost: number; quantity: number }>();
  const byWeek = new Map<string, number>();
  let totalCost = 0;

  for (const row of (data ?? []) as any[]) {
    const cost = Number(row.estimated_cost ?? 0);
    const qty = Number(row.quantity ?? 0);
    totalCost += cost;

    const reason = row.reason ?? "other";
    const r = byReason.get(reason) ?? { cost: 0, quantity: 0 };
    r.cost += cost;
    r.quantity += qty;
    byReason.set(reason, r);

    const name = row.inventory_item?.name ?? "Unknown";
    const it = byItem.get(name) ?? { cost: 0, quantity: 0 };
    it.cost += cost;
    it.quantity += qty;
    byItem.set(name, it);

    const ws = weekStart(new Date(row.waste_date));
    byWeek.set(ws, (byWeek.get(ws) ?? 0) + cost);
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    data: {
      total_cost: round(totalCost),
      by_reason: [...byReason.entries()]
        .map(([reason, v]) => ({ reason, cost: round(v.cost), quantity: v.quantity }))
        .sort((a, b) => b.cost - a.cost),
      by_item: [...byItem.entries()]
        .map(([name, v]) => ({ name, cost: round(v.cost), quantity: v.quantity }))
        .sort((a, b) => b.cost - a.cost),
      by_week: [...byWeek.entries()]
        .map(([week_start, cost]) => ({ week_start, cost: round(cost) }))
        .sort((a, b) => a.week_start.localeCompare(b.week_start)),
    },
  };
}
