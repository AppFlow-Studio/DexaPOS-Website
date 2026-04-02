"use server";

import { assertHQPermission } from "@/lib/admin/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { format, subDays } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HQCashDrawerFilters {
  merchantIds?: string[];
  locationIds?: string[];
}

export interface HQCashDrawerSession {
  id: string;
  business_date: string;
  cash_drawer_id: string;
  drawer_name: string;
  merchant_id: string;
  merchant_name: string;
  location_id: string;
  location_name: string;
  opened_by: string;
  opened_by_name: string;
  opened_at: string;
  opening_amount: number;
  closed_by: string | null;
  closed_by_name: string | null;
  closed_at: string | null;
  closing_amount: number | null;
  expected_cash: number | null;
  variance: number | null;
  status: string | null;
  variance_notes: string | null;
}

export interface HQCashDrawerOperation {
  id: string;
  session_id: string;
  cash_drawer_id: string;
  drawer_name?: string;
  merchant_id?: string;
  merchant_name?: string;
  operation_type: string;
  amount: number;
  performed_by: string;
  performed_by_name: string;
  approved_by: string | null;
  approved_by_name: string | null;
  performed_at: string;
  reason: string | null;
  balance_after: number | null;
}

export interface HQCashDrawerSummaryStats {
  totalCashSales: number;
  totalVariance: number;
  noSaleCount: number;
  sessionsCount: number;
  prevPeriodTotalCashSales: number;
  prevPeriodTotalVariance: number;
  prevPeriodNoSaleCount: number;
  prevPeriodSessionsCount: number;
}

export interface HQVarianceTrendPoint {
  business_date: string;
  cash_drawer_id: string;
  drawer_name: string;
  merchant_id: string;
  merchant_name: string;
  opening_amount: number;
  closing_amount: number | null;
  expected_cash: number | null;
  variance: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function staffName(
  profile: { display_name?: string | null; first_name: string; last_name: string } | null
): string {
  if (!profile) return "Unknown";
  return (profile.display_name || `${profile.first_name} ${profile.last_name}`).trim();
}

async function getMerchantScope(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  roleCode?: string | null
): Promise<string[] | null> {
  if (roleCode === "hq.super_admin") return null;

  const { data, error } = await supabase
    .from("admin_merchant_access")
    .select("merchant_id")
    .eq("admin_user_id", userId)
    .eq("is_active", true);

  if (error) {
    console.error("[HQCashDrawerAnalytics] getMerchantScope error:", error);
    return [];
  }

  return Array.from(
    new Set(
      (data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => row.merchant_id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    )
  );
}

function applyScope(
  requested: string[] | undefined,
  scoped: string[] | null
): string[] | undefined {
  if (scoped === null) return requested;
  if (!requested || requested.length === 0) return scoped;
  const allowed = new Set(scoped);
  return requested.filter((id) => allowed.has(id));
}

async function resolveEffectiveMerchantIds(
  filters: HQCashDrawerFilters
): Promise<{ supabase: ReturnType<typeof createServerSupabaseClient>; effectiveMerchantIds: string[] | undefined }> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: role } = await supabase.rpc("get_my_hq_role" as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roleCode = (role as any)?.[0]?.role_code ?? (role as any)?.role_code ?? null;

  const scope = await getMerchantScope(supabase, user?.id ?? "", roleCode);
  const effectiveMerchantIds = applyScope(filters.merchantIds, scope);

  return { supabase, effectiveMerchantIds };
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function GetHQCashDrawerSessions(
  filters: HQCashDrawerFilters,
  dateFrom: Date,
  dateTo: Date
): Promise<HQCashDrawerSession[]> {
  await assertHQPermission("hq.merchant.view");
  const { supabase, effectiveMerchantIds } = await resolveEffectiveMerchantIds(filters);

  let query = supabase
    .from("cash_drawer_sessions")
    .select(
      `
      id, business_date, cash_drawer_id, merchant_id, location_id,
      opened_by, opened_at, opening_amount,
      closed_by, closed_at, closing_amount,
      expected_cash, variance, status, variance_notes,
      cash_drawers!cash_drawer_sessions_cash_drawer_id_fkey(name),
      merchants!cash_drawer_sessions_merchant_id_fkey(name),
      locations!cash_drawer_sessions_location_id_fkey(name),
      opened_by_profile:staff_profiles!cash_drawer_sessions_opened_by_fkey(first_name, last_name, display_name),
      closed_by_profile:staff_profiles!cash_drawer_sessions_closed_by_fkey(first_name, last_name, display_name)
    `
    )
    .gte("business_date", format(dateFrom, "yyyy-MM-dd"))
    .lte("business_date", format(dateTo, "yyyy-MM-dd"))
    .order("business_date", { ascending: false })
    .order("opened_at", { ascending: false });

  if (effectiveMerchantIds && effectiveMerchantIds.length > 0) {
    query = query.in("merchant_id", effectiveMerchantIds);
  }
  if (filters.locationIds && filters.locationIds.length > 0) {
    query = query.in("location_id", filters.locationIds);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("[HQCashDrawerAnalytics] GetHQCashDrawerSessions error:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((s) => ({
    id: s.id,
    business_date: s.business_date,
    cash_drawer_id: s.cash_drawer_id,
    drawer_name: s.cash_drawers?.name ?? "Unknown Drawer",
    merchant_id: s.merchant_id,
    merchant_name: s.merchants?.name ?? "Unknown Merchant",
    location_id: s.location_id,
    location_name: s.locations?.name ?? "Unknown Location",
    opened_by: s.opened_by,
    opened_by_name: staffName(s.opened_by_profile),
    opened_at: s.opened_at,
    opening_amount: s.opening_amount,
    closed_by: s.closed_by,
    closed_by_name: s.closed_by_profile ? staffName(s.closed_by_profile) : null,
    closed_at: s.closed_at,
    closing_amount: s.closing_amount,
    expected_cash: s.expected_cash,
    variance: s.variance,
    status: s.status,
    variance_notes: s.variance_notes,
  }));
}

export async function GetHQCashDrawerOperations(
  sessionId: string
): Promise<HQCashDrawerOperation[]> {
  await assertHQPermission("hq.merchant.view");
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("cash_drawer_operations")
    .select(
      `
      id, session_id, cash_drawer_id, operation_type,
      amount, performed_by, performed_at, reason, balance_after, approved_by,
      performed_by_profile:staff_profiles!cash_drawer_operations_performed_by_fkey(first_name, last_name, display_name),
      approved_by_profile:staff_profiles!cash_drawer_operations_approved_by_fkey(first_name, last_name, display_name)
    `
    )
    .eq("session_id", sessionId)
    .order("performed_at", { ascending: true });

  if (error || !data) {
    console.error("[HQCashDrawerAnalytics] GetHQCashDrawerOperations error:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((op) => ({
    id: op.id,
    session_id: op.session_id,
    cash_drawer_id: op.cash_drawer_id,
    operation_type: op.operation_type,
    amount: op.amount,
    performed_by: op.performed_by,
    performed_by_name: staffName(op.performed_by_profile),
    approved_by: op.approved_by,
    approved_by_name: op.approved_by_profile ? staffName(op.approved_by_profile) : null,
    performed_at: op.performed_at,
    reason: op.reason,
    balance_after: op.balance_after,
  }));
}

export async function GetHQNoSaleOperations(
  filters: HQCashDrawerFilters,
  dateFrom: Date,
  dateTo: Date
): Promise<HQCashDrawerOperation[]> {
  await assertHQPermission("hq.merchant.view");
  const { supabase, effectiveMerchantIds } = await resolveEffectiveMerchantIds(filters);

  // Single JOIN query to avoid a large IN clause from session IDs at platform scale
  let query = supabase
    .from("cash_drawer_operations")
    .select(
      `
      id, session_id, cash_drawer_id, operation_type,
      amount, performed_by, performed_at, reason, balance_after, approved_by,
      drawer:cash_drawers!cash_drawer_operations_cash_drawer_id_fkey(name),
      session:cash_drawer_sessions!cash_drawer_operations_session_id_fkey(
        merchant_id, location_id, business_date,
        merchant:merchants!cash_drawer_sessions_merchant_id_fkey(name)
      ),
      performed_by_profile:staff_profiles!cash_drawer_operations_performed_by_fkey(first_name, last_name, display_name),
      approved_by_profile:staff_profiles!cash_drawer_operations_approved_by_fkey(first_name, last_name, display_name)
    `
    )
    .eq("operation_type", "no_sale")
    .order("performed_at", { ascending: false });

  const { data, error } = await query;
  if (error || !data) {
    console.error("[HQCashDrawerAnalytics] GetHQNoSaleOperations error:", error);
    return [];
  }

  // Filter by merchant/location/date in JS since Supabase doesn't support nested column filters in select
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = data as any[];

  const fromStr = format(dateFrom, "yyyy-MM-dd");
  const toStr = format(dateTo, "yyyy-MM-dd");

  rows = rows.filter((op) => {
    const s = op.session;
    if (!s) return false;
    if (s.business_date < fromStr || s.business_date > toStr) return false;
    if (effectiveMerchantIds && effectiveMerchantIds.length > 0) {
      if (!effectiveMerchantIds.includes(s.merchant_id)) return false;
    }
    if (filters.locationIds && filters.locationIds.length > 0) {
      if (!filters.locationIds.includes(s.location_id)) return false;
    }
    return true;
  });

  return rows.map((op) => ({
    id: op.id,
    session_id: op.session_id,
    cash_drawer_id: op.cash_drawer_id,
    drawer_name: op.drawer?.name ?? "Unknown Drawer",
    merchant_id: op.session?.merchant_id ?? "",
    merchant_name: op.session?.merchant?.name ?? "Unknown Merchant",
    operation_type: op.operation_type,
    amount: op.amount,
    performed_by: op.performed_by,
    performed_by_name: staffName(op.performed_by_profile),
    approved_by: op.approved_by,
    approved_by_name: op.approved_by_profile ? staffName(op.approved_by_profile) : null,
    performed_at: op.performed_at,
    reason: op.reason,
    balance_after: op.balance_after,
  }));
}

export async function GetHQCashDrawerSummaryStats(
  filters: HQCashDrawerFilters,
  dateFrom: Date,
  dateTo: Date
): Promise<HQCashDrawerSummaryStats> {
  await assertHQPermission("hq.merchant.view");
  const { supabase, effectiveMerchantIds } = await resolveEffectiveMerchantIds(filters);

  const empty: HQCashDrawerSummaryStats = {
    totalCashSales: 0,
    totalVariance: 0,
    noSaleCount: 0,
    sessionsCount: 0,
    prevPeriodTotalCashSales: 0,
    prevPeriodTotalVariance: 0,
    prevPeriodNoSaleCount: 0,
    prevPeriodSessionsCount: 0,
  };

  const rangeDays =
    Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const prevFrom = subDays(dateFrom, rangeDays);
  const prevTo = subDays(dateTo, rangeDays);

  async function queryPeriod(from: Date, to: Date) {
    let q = supabase
      .from("cash_drawer_sessions")
      .select("id, variance, closing_amount")
      .gte("business_date", format(from, "yyyy-MM-dd"))
      .lte("business_date", format(to, "yyyy-MM-dd"));

    if (effectiveMerchantIds && effectiveMerchantIds.length > 0) {
      q = q.in("merchant_id", effectiveMerchantIds);
    }
    if (filters.locationIds && filters.locationIds.length > 0) {
      q = q.in("location_id", filters.locationIds);
    }

    const { data: sessions } = await q;
    if (!sessions) return { totalCashSales: 0, totalVariance: 0, noSaleCount: 0, sessionsCount: 0 };

    const sessionIds = sessions.map((s) => s.id);
    let noSaleCount = 0;

    if (sessionIds.length > 0) {
      const { count } = await supabase
        .from("cash_drawer_operations")
        .select("id", { count: "exact", head: true })
        .eq("operation_type", "no_sale")
        .in("session_id", sessionIds);
      noSaleCount = count ?? 0;
    }

    const totalCashSales = sessions.reduce((sum, s) => sum + (s.closing_amount ?? 0), 0);
    const totalVariance = sessions.reduce((sum, s) => sum + (s.variance ?? 0), 0);

    return { totalCashSales, totalVariance, noSaleCount, sessionsCount: sessions.length };
  }

  const [current, prev] = await Promise.all([
    queryPeriod(dateFrom, dateTo),
    queryPeriod(prevFrom, prevTo),
  ]);

  return {
    totalCashSales: current.totalCashSales,
    totalVariance: current.totalVariance,
    noSaleCount: current.noSaleCount,
    sessionsCount: current.sessionsCount,
    prevPeriodTotalCashSales: prev.totalCashSales,
    prevPeriodTotalVariance: prev.totalVariance,
    prevPeriodNoSaleCount: prev.noSaleCount,
    prevPeriodSessionsCount: prev.sessionsCount,
  };
}

export async function GetHQVarianceTrend(
  filters: HQCashDrawerFilters,
  dateFrom: Date,
  dateTo: Date
): Promise<HQVarianceTrendPoint[]> {
  await assertHQPermission("hq.merchant.view");
  const { supabase, effectiveMerchantIds } = await resolveEffectiveMerchantIds(filters);

  let query = supabase
    .from("cash_drawer_sessions")
    .select(
      `
      business_date, cash_drawer_id, merchant_id,
      opening_amount, closing_amount, expected_cash, variance,
      cash_drawers!cash_drawer_sessions_cash_drawer_id_fkey(name),
      merchants!cash_drawer_sessions_merchant_id_fkey(name)
    `
    )
    .gte("business_date", format(dateFrom, "yyyy-MM-dd"))
    .lte("business_date", format(dateTo, "yyyy-MM-dd"))
    .order("business_date", { ascending: true });

  if (effectiveMerchantIds && effectiveMerchantIds.length > 0) {
    query = query.in("merchant_id", effectiveMerchantIds);
  }
  if (filters.locationIds && filters.locationIds.length > 0) {
    query = query.in("location_id", filters.locationIds);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("[HQCashDrawerAnalytics] GetHQVarianceTrend error:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((s) => ({
    business_date: s.business_date,
    cash_drawer_id: s.cash_drawer_id,
    drawer_name: s.cash_drawers?.name ?? "Unknown Drawer",
    merchant_id: s.merchant_id,
    merchant_name: s.merchants?.name ?? "Unknown Merchant",
    opening_amount: s.opening_amount,
    closing_amount: s.closing_amount,
    expected_cash: s.expected_cash,
    variance: s.variance,
  }));
}
