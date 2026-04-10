"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SettlementBatchRecord, BatchFilters, PaymentRecord } from "@/types/payment";

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
    .select("*")
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

  let query = supabase
    .from("order_payments")
    .select(
      `
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
    `
    )
    .eq("orders.merchant_id", merchant.id)
    .or(`batch_number.eq.${batchId},dejavoo_batch_number.eq.${batchId}`);

  if (locationId && locationId !== "all") {
    query = query.eq("orders.location_id", locationId);
  }

  const { data, error } = await query.order("initiated_at", { ascending: false });

  if (error) {
    console.error("[GetBatchPayments] Error:", error);
    return [];
  }

  return (data as PaymentRecord[]) || [];
}
