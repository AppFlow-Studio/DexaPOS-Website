"use server";

// ============================================================================
// Cash Drawer Hardware Observability — Merchant Server Actions
// ============================================================================
// Read-only reporting over the durable cash-drawer kick log
// (public.cash_drawer_kick_events, populated by the printers.metadata trigger)
// plus the printer binding (cash_drawers.host_printer_id). Answers, per drawer:
// what printer it's wired to, whether recent kicks physically opened it, printer
// connectivity, and the raw kick history — cross-linked to the cash movements
// (no_sale / pay_in / pay_out) that should have triggered those kicks.
//
// Hardware is controlled from the POS tablet (binding is set on the Test Pop
// screen); the web only observes. Mirrors the read patterns in
// cash-drawer-analytics.ts.
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { format, startOfDay, endOfDay, subDays } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

export type KickOutcome = "ok" | "unconfirmed" | "failed";

export interface DrawerHardwareStatus {
  cash_drawer_id: string;
  drawer_name: string;
  location_id: string;
  is_open: boolean;
  host_printer_id: string | null;
  printer_name: string | null;
  printer_model: string | null;
  printer_connected: boolean | null;
  printer_last_status: string | null;
  printer_last_status_at: string | null;
  printer_error_count: number | null;
  supports_cash_drawer_kick: boolean | null;
  last_kick_outcome: KickOutcome | null;
  last_kick_at: string | null;
  okCount: number;
  unconfirmedCount: number;
  failedCount: number;
  totalKicks: number;
}

export interface KickEvent {
  id: string;
  kicked_at: string;
  cash_drawer_id: string | null;
  drawer_name: string | null;
  printer_id: string;
  printer_name: string | null;
  outcome: KickOutcome;
  command_acked: boolean | null;
  drawer_confirmed: boolean | null;
  error_message: string | null;
  source: string | null;
}

export interface KickHealthSummary {
  totalKicks: number;
  okCount: number;
  unconfirmedCount: number;
  failedCount: number;
  confirmedRate: number; // 0..1
  prevTotalKicks: number;
  prevOkCount: number;
  prevUnconfirmedCount: number;
  prevFailedCount: number;
  prevConfirmedRate: number;
}

export interface MovementKickCorrelation {
  operation_id: string;
  operation_type: string; // no_sale | pay_in | pay_out
  performed_at: string;
  performed_by_name: string;
  cash_drawer_id: string;
  drawer_name: string;
  amount: number;
  kick_outcome: KickOutcome | null;
  kick_at: string | null;
  kick_delta_seconds: number | null; // |kick - operation|, null if no match
  kick_confirmed: boolean | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_WINDOW_DAYS = 30; // rolling window for the per-drawer status counters
const CORRELATION_WINDOW_SECONDS = 180; // a kick must be within 3 min of the operation

async function getMerchantId(clerkOrgId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  if (error || !data) {
    console.error("[CashDrawerHardware] getMerchantId error:", error);
    return null;
  }
  return data.id;
}

function staffName(
  profile: { display_name?: string | null; first_name: string; last_name: string } | null
): string {
  if (!profile) return "Unknown";
  return profile.display_name || `${profile.first_name} ${profile.last_name}`.trim();
}

function normalizeOutcome(v: unknown): KickOutcome {
  return v === "ok" || v === "failed" ? v : "unconfirmed";
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Per-drawer hardware snapshot: bound printer, connectivity, last kick outcome,
 * and rolling confirmed/unconfirmed/failed counts over the last 30 days.
 */
export async function GetCashDrawerHardwareStatus(
  clerkOrgId: string,
  locationId: string | null
): Promise<DrawerHardwareStatus[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  let drawersQ = supabase
    .from("cash_drawers")
    .select("id, name, location_id, is_open, host_printer_id")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (locationId && locationId !== "all") {
    drawersQ = drawersQ.eq("location_id", locationId);
  }

  const { data: drawers, error: drawersError } = await drawersQ;
  if (drawersError || !drawers) {
    console.error("[CashDrawerHardware] drawers query error:", drawersError);
    return [];
  }
  if (drawers.length === 0) return [];

  // Host printers, fetched separately (avoids relying on embed FK-name hints).
  const printerIds = Array.from(
    new Set(
      (drawers as any[])
        .map((d) => d.host_printer_id)
        .filter((id: string | null): id is string => !!id)
    )
  );
  const printerMap = new Map<string, any>();
  if (printerIds.length > 0) {
    const { data: printers } = await supabase
      .from("printers")
      .select(
        "id, printer_name, printer_model, is_connected, last_status, last_status_at, error_count, supports_cash_drawer_kick"
      )
      .in("id", printerIds);
    for (const p of (printers as any[]) ?? []) printerMap.set(p.id, p);
  }

  // Kick events for these drawers over the rolling window.
  const drawerIds = (drawers as any[]).map((d) => d.id);
  const since = subDays(new Date(), STATUS_WINDOW_DAYS).toISOString();
  const { data: events } = await supabase
    .from("cash_drawer_kick_events")
    .select("cash_drawer_id, outcome, kicked_at")
    .eq("merchant_id", merchantId)
    .in("cash_drawer_id", drawerIds)
    .gte("kicked_at", since)
    .order("kicked_at", { ascending: false });

  const agg = new Map<
    string,
    { ok: number; unconfirmed: number; failed: number; lastOutcome: KickOutcome | null; lastAt: string | null }
  >();
  for (const e of (events as any[]) ?? []) {
    const id = e.cash_drawer_id as string | null;
    if (!id) continue;
    const cur =
      agg.get(id) ?? { ok: 0, unconfirmed: 0, failed: 0, lastOutcome: null as KickOutcome | null, lastAt: null as string | null };
    const outcome = normalizeOutcome(e.outcome);
    if (outcome === "ok") cur.ok += 1;
    else if (outcome === "failed") cur.failed += 1;
    else cur.unconfirmed += 1;
    // events come newest-first → first seen is the latest
    if (cur.lastAt === null) {
      cur.lastOutcome = outcome;
      cur.lastAt = e.kicked_at;
    }
    agg.set(id, cur);
  }

  return (drawers as any[]).map((d) => {
    const p = d.host_printer_id ? printerMap.get(d.host_printer_id) : null;
    const a = agg.get(d.id);
    return {
      cash_drawer_id: d.id,
      drawer_name: d.name,
      location_id: d.location_id,
      is_open: !!d.is_open,
      host_printer_id: d.host_printer_id ?? null,
      printer_name: p?.printer_name ?? null,
      printer_model: p?.printer_model ?? null,
      printer_connected: p ? !!p.is_connected : null,
      printer_last_status: p?.last_status ?? null,
      printer_last_status_at: p?.last_status_at ?? null,
      printer_error_count: p?.error_count ?? null,
      supports_cash_drawer_kick: p ? !!p.supports_cash_drawer_kick : null,
      last_kick_outcome: a?.lastOutcome ?? null,
      last_kick_at: a?.lastAt ?? null,
      okCount: a?.ok ?? 0,
      unconfirmedCount: a?.unconfirmed ?? 0,
      failedCount: a?.failed ?? 0,
      totalKicks: a ? a.ok + a.unconfirmed + a.failed : 0,
    };
  });
}

/**
 * Durable kick-event log rows for the table, filterable by drawer and outcome.
 */
export async function GetCashDrawerKickEvents(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date,
  opts?: { drawerId?: string | null; outcome?: KickOutcome | null; limit?: number }
): Promise<KickEvent[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("cash_drawer_kick_events")
    .select(
      `
      id, kicked_at, cash_drawer_id, printer_id, outcome,
      command_acked, drawer_confirmed, error_message, source,
      drawer:cash_drawers!cash_drawer_kick_events_cash_drawer_id_fkey(name),
      printer:printers!cash_drawer_kick_events_printer_id_fkey(printer_name)
    `
    )
    .eq("merchant_id", merchantId)
    .gte("kicked_at", startOfDay(dateFrom).toISOString())
    .lte("kicked_at", endOfDay(dateTo).toISOString())
    .order("kicked_at", { ascending: false })
    .limit(opts?.limit ?? 500);

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }
  if (opts?.drawerId) {
    query = query.eq("cash_drawer_id", opts.drawerId);
  }
  if (opts?.outcome) {
    query = query.eq("outcome", opts.outcome);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("[CashDrawerHardware] GetCashDrawerKickEvents error:", error);
    return [];
  }

  return (data as any[]).map((e) => {
    const drawer = Array.isArray(e.drawer) ? e.drawer[0] : e.drawer;
    const printer = Array.isArray(e.printer) ? e.printer[0] : e.printer;
    return {
      id: e.id,
      kicked_at: e.kicked_at,
      cash_drawer_id: e.cash_drawer_id,
      drawer_name: drawer?.name ?? null,
      printer_id: e.printer_id,
      printer_name: printer?.printer_name ?? null,
      outcome: normalizeOutcome(e.outcome),
      command_acked: e.command_acked,
      drawer_confirmed: e.drawer_confirmed,
      error_message: e.error_message,
      source: e.source,
    };
  });
}

/**
 * Kick health totals + previous-period deltas (shaped for the DeltaBadge).
 */
export async function GetKickHealthSummary(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<KickHealthSummary> {
  const empty: KickHealthSummary = {
    totalKicks: 0,
    okCount: 0,
    unconfirmedCount: 0,
    failedCount: 0,
    confirmedRate: 0,
    prevTotalKicks: 0,
    prevOkCount: 0,
    prevUnconfirmedCount: 0,
    prevFailedCount: 0,
    prevConfirmedRate: 0,
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
      .from("cash_drawer_kick_events")
      .select("outcome")
      .eq("merchant_id", merchantId!)
      .gte("kicked_at", startOfDay(from).toISOString())
      .lte("kicked_at", endOfDay(to).toISOString());

    if (locationId && locationId !== "all") {
      q = q.eq("location_id", locationId);
    }

    const { data } = await q;
    let ok = 0,
      unconfirmed = 0,
      failed = 0;
    for (const r of (data as any[]) ?? []) {
      const o = normalizeOutcome(r.outcome);
      if (o === "ok") ok += 1;
      else if (o === "failed") failed += 1;
      else unconfirmed += 1;
    }
    const total = ok + unconfirmed + failed;
    return { ok, unconfirmed, failed, total, rate: total > 0 ? ok / total : 0 };
  }

  const [cur, prev] = await Promise.all([
    queryPeriod(dateFrom, dateTo),
    queryPeriod(prevFrom, prevTo),
  ]);

  return {
    totalKicks: cur.total,
    okCount: cur.ok,
    unconfirmedCount: cur.unconfirmed,
    failedCount: cur.failed,
    confirmedRate: cur.rate,
    prevTotalKicks: prev.total,
    prevOkCount: prev.ok,
    prevUnconfirmedCount: prev.unconfirmed,
    prevFailedCount: prev.failed,
    prevConfirmedRate: prev.rate,
  };
}

/**
 * Money-movement ↔ kick correlation: each no_sale / pay_in / pay_out operation
 * beside the nearest kick for the same drawer (within CORRELATION_WINDOW_SECONDS).
 * Surfaces the "staff hit No Sale but the drawer never opened" case for support.
 */
export async function GetMovementKickCorrelation(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<MovementKickCorrelation[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  // Sessions in range → operations of interest. Mirrors GetNoSaleOperations.
  let sessionsQ = supabase
    .from("cash_drawer_sessions")
    .select("id")
    .eq("merchant_id", merchantId)
    .gte("business_date", format(dateFrom, "yyyy-MM-dd"))
    .lte("business_date", format(dateTo, "yyyy-MM-dd"));
  if (locationId && locationId !== "all") {
    sessionsQ = sessionsQ.eq("location_id", locationId);
  }
  const { data: sessions } = await sessionsQ;
  if (!sessions || sessions.length === 0) return [];
  const sessionIds = (sessions as any[]).map((s) => s.id);

  const { data: ops, error: opsError } = await supabase
    .from("cash_drawer_operations")
    .select(
      `
      id, cash_drawer_id, operation_type, amount, performed_at,
      drawer:cash_drawers!cash_drawer_operations_cash_drawer_id_fkey(name),
      performed_by_profile:staff_profiles!cash_drawer_operations_performed_by_fkey(first_name, last_name, display_name)
    `
    )
    .in("session_id", sessionIds)
    .in("operation_type", ["no_sale", "pay_in", "pay_out"])
    .order("performed_at", { ascending: false });

  if (opsError || !ops || ops.length === 0) {
    if (opsError) console.error("[CashDrawerHardware] correlation ops error:", opsError);
    return [];
  }

  // Kick events for those drawers, padded by the match window on both ends.
  const drawerIds = Array.from(
    new Set((ops as any[]).map((o) => o.cash_drawer_id).filter(Boolean))
  );
  const padMs = CORRELATION_WINDOW_SECONDS * 1000;
  const kFrom = new Date(startOfDay(dateFrom).getTime() - padMs).toISOString();
  const kTo = new Date(endOfDay(dateTo).getTime() + padMs).toISOString();

  const kicksByDrawer = new Map<
    string,
    Array<{ at: number; outcome: KickOutcome; confirmed: boolean | null }>
  >();
  if (drawerIds.length > 0) {
    const { data: kicks } = await supabase
      .from("cash_drawer_kick_events")
      .select("cash_drawer_id, outcome, drawer_confirmed, kicked_at")
      .eq("merchant_id", merchantId)
      .in("cash_drawer_id", drawerIds)
      .gte("kicked_at", kFrom)
      .lte("kicked_at", kTo);
    for (const k of (kicks as any[]) ?? []) {
      const id = k.cash_drawer_id as string;
      const arr = kicksByDrawer.get(id) ?? [];
      arr.push({
        at: new Date(k.kicked_at).getTime(),
        outcome: normalizeOutcome(k.outcome),
        confirmed: k.drawer_confirmed,
      });
      kicksByDrawer.set(id, arr);
    }
  }

  return (ops as any[]).map((op) => {
    const drawer = Array.isArray(op.drawer) ? op.drawer[0] : op.drawer;
    const opAt = new Date(op.performed_at).getTime();
    let best: { at: number; outcome: KickOutcome; confirmed: boolean | null } | null = null;
    let bestDelta = Infinity;
    for (const k of kicksByDrawer.get(op.cash_drawer_id) ?? []) {
      const delta = Math.abs(k.at - opAt);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = k;
      }
    }
    const matched = best && bestDelta <= CORRELATION_WINDOW_SECONDS * 1000 ? best : null;
    return {
      operation_id: op.id,
      operation_type: op.operation_type,
      performed_at: op.performed_at,
      performed_by_name: staffName(op.performed_by_profile),
      cash_drawer_id: op.cash_drawer_id,
      drawer_name: drawer?.name ?? "Unknown Drawer",
      amount: Number(op.amount) || 0,
      kick_outcome: matched?.outcome ?? null,
      kick_at: matched ? new Date(matched.at).toISOString() : null,
      kick_delta_seconds: matched ? Math.round(bestDelta / 1000) : null,
      kick_confirmed: matched ? matched.confirmed : null,
    };
  });
}
