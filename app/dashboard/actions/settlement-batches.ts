"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SettlementBatchRecord, BatchFilters, PaymentRecord } from "@/types/payment";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GetSettlementBatches(
  clerkOrgId: string,
  locationId?: string | null,
  filters?: BatchFilters
): Promise<SettlementBatchRecord[]> {
  if (!clerkOrgId) return [];

  const supabase = createServerSupabaseClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("[GetSettlementBatches] Error getting merchant:", merchantError);
    return [];
  }

  let query = supabase
    .from("settlement_batches")
    .select(
      `
      *,
      payment_terminals (
        terminal_name,
        serial_number,
        terminal_model
      )
    `
    )
    .eq("merchant_id", merchant.id);

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  if (filters?.dateRange?.from) {
    const from = new Date(filters.dateRange.from);
    if (!isNaN(from.getTime())) {
      query = query.gte("business_date", from.toISOString().slice(0, 10));
    }
  }
  if (filters?.dateRange?.to) {
    const to = new Date(filters.dateRange.to);
    if (!isNaN(to.getTime())) {
      query = query.lte("business_date", to.toISOString().slice(0, 10));
    }
  }

  if (filters?.status && filters.status.length > 0) {
    query = query.in("status", filters.status);
  }

  const { data, error } = await query.order("business_date", { ascending: false });

  if (error) {
    console.error("[GetSettlementBatches] Error:", error);
    return [];
  }

  return (data || []).map((b) => ({
    ...b,
    gross_amount: Number(b.gross_amount) || 0,
    tip_amount: Number(b.tip_amount) || 0,
    refund_amount: Number(b.refund_amount) || 0,
    interchange_fees: Number(b.interchange_fees) || 0,
    assessment_fees: Number(b.assessment_fees) || 0,
    processor_fees: Number(b.processor_fees) || 0,
    net_deposit: Number(b.net_deposit) || 0,
  })) as SettlementBatchRecord[];
}

export async function GetBatchPayments(
  clerkOrgId: string,
  batchId: string,
  locationId?: string | null
): Promise<PaymentRecord[]> {
  if (!clerkOrgId || !batchId) return [];

  const supabase = createServerSupabaseClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("[GetBatchPayments] Error getting merchant:", merchantError);
    return [];
  }

  // Resolve `batchId` against settlement_batches so we can prefer the FK
  // (order_payments.settlement_batch_id) over the text host-batch-number
  // columns. Accepts a UUID, a `batch_id` text label, or a raw host number.
  let batchUuid: string | null = null;
  let hostBatchNumber: string | null = null;
  let terminalId: string | null = null;
  let businessDate: string | null = null;

  if (UUID_RE.test(batchId)) {
    const { data: sb } = await supabase
      .from("settlement_batches")
      .select("id, batch_number, terminal_id, business_date")
      .eq("id", batchId)
      .eq("merchant_id", merchant.id)
      .maybeSingle();
    batchUuid = sb?.id ?? null;
    hostBatchNumber = sb?.batch_number ?? null;
    terminalId = sb?.terminal_id ?? null;
    businessDate = sb?.business_date ?? null;
  } else {
    const { data: sb } = await supabase
      .from("settlement_batches")
      .select("id, batch_number, terminal_id, business_date")
      .eq("batch_id", batchId)
      .eq("merchant_id", merchant.id)
      .maybeSingle();
    batchUuid = sb?.id ?? null;
    hostBatchNumber = sb?.batch_number ?? null;
    terminalId = sb?.terminal_id ?? null;
    businessDate = sb?.business_date ?? null;
    if (!batchUuid && !hostBatchNumber) {
      hostBatchNumber = batchId;
    }
  }

  if (!batchUuid && !hostBatchNumber) return [];

  const baseSelect = `
    *,
    orders!inner(
      order_number,
      display_number,
      location_id,
      status,
      order_type,
      customer_name,
      created_at,
      merchant_id
    )
  `;

  // Preferred: FK match.
  let data: PaymentRecord[] | null = null;
  if (batchUuid) {
    let q = supabase
      .from("order_payments")
      .select(baseSelect)
      .eq("orders.merchant_id", merchant.id)
      .eq("settlement_batch_id", batchUuid);

    if (locationId && locationId !== "all") {
      q = q.eq("orders.location_id", locationId);
    }

    const { data: fkRows, error: fkErr } = await q.order("initiated_at", {
      ascending: false,
    });
    if (fkErr) {
      console.error("[GetBatchPayments] FK lookup error:", fkErr);
      return [];
    }
    data = (fkRows as PaymentRecord[]) ?? [];
  }

  // Fallback: host-batch-number match, scoped by terminal + business date
  // window so recycled batch numbers from other terminals/days don't leak.
  if ((!data || data.length === 0) && hostBatchNumber) {
    let q = supabase
      .from("order_payments")
      .select(baseSelect)
      .eq("orders.merchant_id", merchant.id)
      .is("settlement_batch_id", null)
      .or(
        `batch_number.eq.${hostBatchNumber},dejavoo_batch_number.eq.${hostBatchNumber}`
      );

    if (locationId && locationId !== "all") {
      q = q.eq("orders.location_id", locationId);
    }

    if (terminalId) {
      q = q.eq("terminal_id", terminalId);
    }

    if (businessDate) {
      const d = new Date(`${businessDate}T00:00:00Z`);
      const from = new Date(d.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const to = new Date(d.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
      q = q.gte("initiated_at", from).lt("initiated_at", to);
    }

    const { data: fbRows, error: fbErr } = await q.order("initiated_at", {
      ascending: false,
    });
    if (fbErr) {
      console.error("[GetBatchPayments] Fallback lookup error:", fbErr);
      return [];
    }
    data = (fbRows as PaymentRecord[]) ?? [];
  }

  return data ?? [];
}
