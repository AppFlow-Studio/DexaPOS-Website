"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { format, subDays } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CashDrawerSession {
  id: string;
  business_date: string;
  cash_drawer_id: string;
  drawer_name: string;
  location_id: string;
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

export interface CashDrawerOperation {
  id: string;
  session_id: string;
  cash_drawer_id: string;
  drawer_name?: string;
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

export interface CashDrawerSummaryStats {
  totalCashSales: number;
  totalVariance: number;
  noSaleCount: number;
  sessionsCount: number;
  prevPeriodTotalCashSales: number;
  prevPeriodTotalVariance: number;
  prevPeriodNoSaleCount: number;
  prevPeriodSessionsCount: number;
}

export interface VarianceTrendPoint {
  business_date: string;
  drawer_name: string;
  cash_drawer_id: string;
  opening_amount: number;
  closing_amount: number | null;
  expected_cash: number | null;
  variance: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getMerchantId(clerkOrgId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  if (error || !data) {
    console.error("[CashDrawerAnalytics] getMerchantId error:", error);
    return null;
  }
  return data.id;
}

function staffName(profile: { display_name?: string | null; first_name: string; last_name: string } | null): string {
  if (!profile) return "Unknown";
  return profile.display_name || `${profile.first_name} ${profile.last_name}`.trim();
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function GetCashDrawerSessions(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<CashDrawerSession[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("cash_drawer_sessions")
    .select(
      `
      id, business_date, cash_drawer_id, location_id,
      opened_by, opened_at, opening_amount,
      closed_by, closed_at, closing_amount,
      expected_cash, variance, status, variance_notes,
      cash_drawers!cash_drawer_sessions_cash_drawer_id_fkey(name),
      opened_by_profile:staff_profiles!cash_drawer_sessions_opened_by_fkey(first_name, last_name, display_name),
      closed_by_profile:staff_profiles!cash_drawer_sessions_closed_by_fkey(first_name, last_name, display_name)
    `
    )
    .eq("merchant_id", merchantId)
    .gte("business_date", format(dateFrom, "yyyy-MM-dd"))
    .lte("business_date", format(dateTo, "yyyy-MM-dd"))
    .order("business_date", { ascending: false })
    .order("opened_at", { ascending: false });

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("[CashDrawerAnalytics] GetCashDrawerSessions error:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((s) => ({
    id: s.id,
    business_date: s.business_date,
    cash_drawer_id: s.cash_drawer_id,
    drawer_name: s.cash_drawers?.name ?? "Unknown Drawer",
    location_id: s.location_id,
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

export async function GetCashDrawerOperations(
  sessionId: string
): Promise<CashDrawerOperation[]> {
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
    console.error("[CashDrawerAnalytics] GetCashDrawerOperations error:", error);
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

export async function GetNoSaleOperations(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<CashDrawerOperation[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  // First get session IDs in range
  let sessionsQ = supabase
    .from("cash_drawer_sessions")
    .select("id")
    .eq("merchant_id", merchantId)
    .gte("business_date", format(dateFrom, "yyyy-MM-dd"))
    .lte("business_date", format(dateTo, "yyyy-MM-dd"));

  if (locationId && locationId !== "all") {
    sessionsQ = sessionsQ.eq("location_id", locationId);
  }

  const { data: sessions, error: sessionsError } = await sessionsQ;
  if (sessionsError || !sessions || sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);

  const { data, error } = await supabase
    .from("cash_drawer_operations")
    .select(
      `
      id, session_id, cash_drawer_id, operation_type,
      amount, performed_by, performed_at, reason, balance_after, approved_by,
      drawer:cash_drawers!cash_drawer_operations_cash_drawer_id_fkey(name),
      performed_by_profile:staff_profiles!cash_drawer_operations_performed_by_fkey(first_name, last_name, display_name),
      approved_by_profile:staff_profiles!cash_drawer_operations_approved_by_fkey(first_name, last_name, display_name)
    `
    )
    .eq("operation_type", "no_sale")
    .in("session_id", sessionIds)
    .order("performed_at", { ascending: false });

  if (error || !data) {
    console.error("[CashDrawerAnalytics] GetNoSaleOperations error:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((op) => ({
    id: op.id,
    session_id: op.session_id,
    cash_drawer_id: op.cash_drawer_id,
    drawer_name: op.drawer?.name ?? "Unknown Drawer",
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

export async function GetCashDrawerSummaryStats(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<CashDrawerSummaryStats> {
  const empty: CashDrawerSummaryStats = {
    totalCashSales: 0,
    totalVariance: 0,
    noSaleCount: 0,
    sessionsCount: 0,
    prevPeriodTotalCashSales: 0,
    prevPeriodTotalVariance: 0,
    prevPeriodNoSaleCount: 0,
    prevPeriodSessionsCount: 0,
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return empty;

  const supabase = createServerSupabaseClient();
  const rangeDays =
    Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const prevFrom = subDays(dateFrom, rangeDays);
  const prevTo = subDays(dateTo, rangeDays);

  async function queryPeriod(from: Date, to: Date) {
    let q = supabase
      .from("cash_drawer_sessions")
      .select("id, variance, closing_amount")
      .eq("merchant_id", merchantId!)
      .gte("business_date", format(from, "yyyy-MM-dd"))
      .lte("business_date", format(to, "yyyy-MM-dd"));

    if (locationId && locationId !== "all") {
      q = q.eq("location_id", locationId);
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

export async function GetVarianceTrend(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<VarianceTrendPoint[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("cash_drawer_sessions")
    .select(
      `
      business_date, cash_drawer_id,
      opening_amount, closing_amount, expected_cash, variance,
      cash_drawers!cash_drawer_sessions_cash_drawer_id_fkey(name)
    `
    )
    .eq("merchant_id", merchantId)
    .gte("business_date", format(dateFrom, "yyyy-MM-dd"))
    .lte("business_date", format(dateTo, "yyyy-MM-dd"))
    .order("business_date", { ascending: true });

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("[CashDrawerAnalytics] GetVarianceTrend error:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((s) => ({
    business_date: s.business_date,
    drawer_name: s.cash_drawers?.name ?? "Unknown Drawer",
    cash_drawer_id: s.cash_drawer_id,
    opening_amount: s.opening_amount,
    closing_amount: s.closing_amount,
    expected_cash: s.expected_cash,
    variance: s.variance,
  }));
}
