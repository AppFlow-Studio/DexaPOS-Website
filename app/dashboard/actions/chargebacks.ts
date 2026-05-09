"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MerchantChargebackDocument {
  name: string;
  url?: string;
  uploaded_at?: string;
}

export interface MerchantChargebackOriginalPayment {
  payment_id: string;
  order_id?: string;
  order_number?: string;
  customer_name?: string;
  payment_method?: string;
  payment_status?: string;
  total_amount: number;
  card_last_four?: string;
  authorization_code?: string;
  reference_number?: string;
  initiated_at?: string;
  captured_at?: string;
}

export interface MerchantChargebackRow {
  id: string;
  original_payment_id: string;
  dispute_psp_reference?: string;
  merchant_id: string;
  location_id?: string;
  amount: number;
  reason_code: string;
  reason_description?: string;
  card_network?: string;
  status: string;
  defendable: boolean;
  defense_deadline?: string;
  defense_submitted_at?: string;
  defense_documents: MerchantChargebackDocument[];
  resolved_at?: string;
  resolution?: string;
  resolution_amount: number;
  received_at?: string;
  original_payment?: MerchantChargebackOriginalPayment;
}

export interface MerchantChargebackFilters {
  statuses?: string[];
  dateFrom?: string;
  dateTo?: string;
  locationId?: string;
}

export interface MerchantChargebacksResult {
  data: MerchantChargebackRow[];
  total: number;
  pendingCount: number;
  urgentCount: number;
  errorCode?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDocuments(raw: unknown): MerchantChargebackDocument[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d) => typeof d === "object" && d !== null && "name" in d);
}

function toBoolean(val: unknown): boolean {
  if (val === true || val === 1 || val === "true" || val === "t") return true;
  return false;
}

// ─── GetMerchantChargebacks ───────────────────────────────────────────────────

export async function GetMerchantChargebacks(
  clerkOrgId: string,
  filters?: MerchantChargebackFilters,
  limit: number = 50,
  offset: number = 0
): Promise<MerchantChargebacksResult> {
  if (!clerkOrgId) return { data: [], total: 0, pendingCount: 0, urgentCount: 0 };

  const supabase = createServerSupabaseClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    return { data: [], total: 0, pendingCount: 0, urgentCount: 0 };
  }

  const merchantId = merchant.id;
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);

  let query = supabase
    .from("chargebacks")
    .select(
      `id, original_payment_id, dispute_psp_reference, merchant_id, location_id,
       amount, reason_code, reason_description, card_network, status, defendable,
       defense_deadline, defense_submitted_at, defense_documents,
       resolved_at, resolution, resolution_amount, received_at`,
      { count: "exact" }
    )
    .eq("merchant_id", merchantId)
    .order("defense_deadline", { ascending: true, nullsFirst: false })
    .order("received_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (filters?.statuses && filters.statuses.length > 0) {
    query = query.in("status", filters.statuses);
  }
  if (filters?.locationId && filters.locationId !== "all") {
    query = query.eq("location_id", filters.locationId);
  }
  if (filters?.dateFrom) {
    query = query.gte("received_at", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte("received_at", filters.dateTo);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[GetMerchantChargebacks] Error:", error);
    return { data: [], total: 0, pendingCount: 0, urgentCount: 0, errorCode: error.code };
  }

  const rows = data ?? [];

  // Fetch original payments
  const paymentIds = Array.from(
    new Set(rows.map((r) => r.original_payment_id).filter(Boolean))
  ) as string[];

  type PaymentRow = {
    id: string; order_id: string | null; payment_method: string | null;
    status: string | null; total_amount: number; card_last_four: string | null;
    authorization_code: string | null; reference_number: string | null;
    initiated_at: string | null; captured_at: string | null;
  };

  const paymentById = new Map<string, PaymentRow>();

  if (paymentIds.length > 0) {
    const { data: payments } = await supabase
      .from("order_payments")
      .select("id, order_id, payment_method, status, total_amount, card_last_four, authorization_code, reference_number, initiated_at, captured_at")
      .in("id", paymentIds);

    for (const p of payments ?? []) {
      paymentById.set(p.id, p as PaymentRow);
    }
  }

  // Fetch orders for those payments
  const orderIds = Array.from(
    new Set(Array.from(paymentById.values()).map((p) => p.order_id).filter(Boolean))
  ) as string[];

  const orderById = new Map<string, { id: string; order_number: string | null; display_number: string | null; customer_name: string | null }>();

  if (orderIds.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, order_number, display_number, customer_name")
      .in("id", orderIds);

    for (const o of orders ?? []) {
      orderById.set(o.id, o);
    }
  }

  // Count pending
  const pendingStatuses = ["notified", "under_review"];
  let pendingQuery = supabase
    .from("chargebacks")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .in("status", pendingStatuses);
  if (filters?.locationId && filters.locationId !== "all") {
    pendingQuery = pendingQuery.eq("location_id", filters.locationId);
  }
  const { count: pendingCount } = await pendingQuery;

  // Count urgent (deadline within 7 days)
  const now = new Date();
  const cutoff7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let urgentQuery = supabase
    .from("chargebacks")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .in("status", pendingStatuses)
    .not("defense_deadline", "is", null)
    .gte("defense_deadline", now.toISOString())
    .lte("defense_deadline", cutoff7d.toISOString());
  if (filters?.locationId && filters.locationId !== "all") {
    urgentQuery = urgentQuery.eq("location_id", filters.locationId);
  }
  const { count: urgentCount } = await urgentQuery;

  const mapped: MerchantChargebackRow[] = rows.map((row) => {
    const payment = paymentById.get(row.original_payment_id);
    const order = payment?.order_id ? orderById.get(payment.order_id) : undefined;

    return {
      id: row.id,
      original_payment_id: row.original_payment_id,
      dispute_psp_reference: row.dispute_psp_reference ?? undefined,
      merchant_id: row.merchant_id,
      location_id: row.location_id ?? undefined,
      amount: Number(row.amount ?? 0),
      reason_code: row.reason_code ?? "unknown",
      reason_description: row.reason_description ?? undefined,
      card_network: row.card_network ?? undefined,
      status: row.status ?? "notified",
      defendable: toBoolean(row.defendable),
      defense_deadline: row.defense_deadline ?? undefined,
      defense_submitted_at: row.defense_submitted_at ?? undefined,
      defense_documents: normalizeDocuments(row.defense_documents),
      resolved_at: row.resolved_at ?? undefined,
      resolution: row.resolution ?? undefined,
      resolution_amount: Number(row.resolution_amount ?? 0),
      received_at: row.received_at ?? undefined,
      original_payment: payment
        ? {
            payment_id: payment.id,
            order_id: payment.order_id ?? undefined,
            order_number: order?.order_number ?? order?.display_number ?? undefined,
            customer_name: order?.customer_name ?? undefined,
            payment_method: payment.payment_method ?? undefined,
            payment_status: payment.status ?? undefined,
            total_amount: Number(payment.total_amount ?? 0),
            card_last_four: payment.card_last_four ?? undefined,
            authorization_code: payment.authorization_code ?? undefined,
            reference_number: payment.reference_number ?? undefined,
            initiated_at: payment.initiated_at ?? undefined,
            captured_at: payment.captured_at ?? undefined,
          }
        : undefined,
    };
  });

  return {
    data: mapped,
    total: count ?? 0,
    pendingCount: pendingCount ?? 0,
    urgentCount: urgentCount ?? 0,
  };
}

// ─── UploadDisputeDocument ────────────────────────────────────────────────────

export async function UploadDisputeDocument(
  clerkOrgId: string,
  chargebackId: string,
  document: MerchantChargebackDocument
): Promise<{ success: boolean; error?: string }> {
  if (!clerkOrgId || !chargebackId) return { success: false, error: "Missing parameters" };

  const supabase = createServerSupabaseClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) return { success: false, error: "Merchant not found" };

  // Verify ownership
  const { data: cb, error: cbError } = await supabase
    .from("chargebacks")
    .select("id, defense_documents")
    .eq("id", chargebackId)
    .eq("merchant_id", merchant.id)
    .single();

  if (cbError || !cb) return { success: false, error: "Chargeback not found" };

  const existing = normalizeDocuments(cb.defense_documents);
  const updated = [...existing, { ...document, uploaded_at: document.uploaded_at ?? new Date().toISOString() }];

  const { error: updateError } = await supabase
    .from("chargebacks")
    .update({ defense_documents: updated })
    .eq("id", chargebackId);

  if (updateError) {
    console.error("[UploadDisputeDocument] Error:", updateError);
    return { success: false, error: updateError.message };
  }

  await LogAuditEvent({
    clerkOrgId,
    action: "uploaded_dispute_document",
    actionCategory: "payments",
    severity: "info",
    resourceType: "chargeback",
    resourceId: chargebackId,
    resourceName: document.name,
  });

  return { success: true };
}

// ─── SubmitChargebackDefense ──────────────────────────────────────────────────

export async function SubmitChargebackDefense(
  clerkOrgId: string,
  chargebackId: string
): Promise<{ success: boolean; error?: string }> {
  if (!clerkOrgId || !chargebackId) return { success: false, error: "Missing parameters" };

  const supabase = createServerSupabaseClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) return { success: false, error: "Merchant not found" };

  // Verify ownership and check current status
  const { data: cb, error: cbError } = await supabase
    .from("chargebacks")
    .select("id, status, defense_submitted_at")
    .eq("id", chargebackId)
    .eq("merchant_id", merchant.id)
    .single();

  if (cbError || !cb) return { success: false, error: "Chargeback not found" };

  if (cb.defense_submitted_at) {
    return { success: false, error: "Defense already submitted" };
  }

  const { error: updateError } = await supabase
    .from("chargebacks")
    .update({
      defense_submitted_at: new Date().toISOString(),
      status: "defended",
    })
    .eq("id", chargebackId);

  if (updateError) {
    console.error("[SubmitChargebackDefense] Error:", updateError);
    return { success: false, error: updateError.message };
  }

  await LogAuditEvent({
    clerkOrgId,
    action: "submitted_chargeback_defense",
    actionCategory: "payments",
    severity: "info",
    resourceType: "chargeback",
    resourceId: chargebackId,
  });

  return { success: true };
}
