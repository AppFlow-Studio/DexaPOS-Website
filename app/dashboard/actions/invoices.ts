"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";
import type { PaginatedResult, PaginationParams } from "@/types/pagination";
import {
  buildPaginationMeta,
  emptyPaginatedResult,
  normalizePagination,
} from "@/lib/pagination";
import {
  isOverdue,
  OVERDUE_CANDIDATE_STATUSES,
  SENT_FILTER_STATUSES,
} from "@/lib/invoices/lifecycle";

// =============================================================================
// Types
// =============================================================================

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "paid"
  | "overdue"
  | "cancelled"
  | "payment_failed";

export type PaymentDueType =
  | "upon_receipt"
  | "net_15"
  | "net_30"
  | "net_60"
  | "custom";

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  menu_item_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  sort_order: number;
  is_to_go: boolean;
  created_at: string;
}

export interface Invoice {
  id: string;
  merchant_id: string;
  location_id: string | null;
  customer_id: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  payment_due_type: PaymentDueType;
  due_date: string | null;
  subtotal: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  customer?: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  items?: InvoiceItem[];
}

export interface CreateInvoiceItemInput {
  menu_item_id?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  is_to_go?: boolean;
  sort_order?: number;
}

export interface CreateInvoiceInput {
  location_id?: string | null;
  customer_id?: string | null;
  status?: InvoiceStatus;
  payment_due_type: PaymentDueType;
  due_date?: string | null;
  subtotal: number;
  discount_amount?: number;
  tax_rate?: number;
  tax_amount?: number;
  total_amount: number;
  note?: string | null;
  items: CreateInvoiceItemInput[];
}

export type UpdateInvoiceInput = Partial<
  Omit<CreateInvoiceInput, "items"> & { items?: CreateInvoiceItemInput[] }
>;

/**
 * DB-authoritative dashboard KPIs (§4). Derived server-side from the
 * event-written columns (`amount_paid`, `paid_at`, `status`) via the
 * `get_invoice_kpis` RPC — overdue is read-time derived from the effective
 * due date, never a persisted status.
 */
export interface InvoiceKpis {
  outstanding: number;
  paidThisMonth: number;
  overdueCount: number;
  overdueAmount: number;
  draftCount: number;
}

const EMPTY_KPIS: InvoiceKpis = {
  outstanding: 0,
  paidThisMonth: 0,
  overdueCount: 0,
  overdueAmount: 0,
  draftCount: 0,
};

// =============================================================================
// Helpers
// =============================================================================

async function getMerchantId(clerkOrgId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !data) {
    console.error("[Invoices] getMerchantId error:", error);
    return null;
  }
  return data.id;
}

async function generateInvoiceNumber(
  merchantId: string,
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<string> {
  const { data, error } = await supabase
    .rpc("generate_invoice_number", { p_merchant_id: merchantId });

  if (error || !data) {
    console.error("[generateInvoiceNumber] RPC error:", error);
    // Fallback: timestamp-based to avoid blocking invoice creation
    return `INV-${Date.now()}`;
  }

  return data as string;
}

// =============================================================================
// Read Actions
// =============================================================================

export async function GetInvoices(
  clerkOrgId: string,
  locationId?: string | null,
  status?: InvoiceStatus | null,
  pagination?: PaginationParams,
): Promise<PaginatedResult<Invoice>> {
  if (!clerkOrgId) return emptyPaginatedResult(pagination);

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return emptyPaginatedResult(pagination);

  const supabase = createServerSupabaseClient();
  const normalizedPagination = normalizePagination(pagination);

  let query = supabase
    .from("invoices")
    .select(
      `
      id,
      merchant_id,
      location_id,
      customer_id,
      invoice_number,
      status,
      payment_due_type,
      due_date,
      subtotal,
      discount_amount,
      tax_rate,
      tax_amount,
      total_amount,
      amount_paid,
      sent_at,
      note,
      created_at,
      updated_at,
      customer:customers(id, name, email, phone)
    `,
      { count: "exact" },
    )
    .eq("merchant_id", merchantId)
    // Only the merchant's own customer invoices — platform_to_merchant bills
    // (HQ → merchant, §5) are payables and must not pollute this list.
    .eq("bill_type", "merchant_to_customer");

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  // "Overdue" is derived, not stored — nothing ever writes status='overdue'
  // (migration 20260614120000), so a literal .eq() matched zero rows and the
  // tab hung on its skeleton forever. The date test needs per-row interval
  // arithmetic PostgREST cannot express, so overdue is filtered in memory
  // below; the DB narrows to the candidate statuses first.
  const isDerivedOverdue = status === "overdue";

  if (isDerivedOverdue) {
    query = query.in("status", [...OVERDUE_CANDIDATE_STATUSES]);
  } else if (status === "sent") {
    // A sent invoice becomes 'viewed' the moment the customer opens it, and
    // 'payment_failed' on a decline. All three are still sent invoices.
    query = query.in("status", [...SENT_FILTER_STATUSES]);
  } else if (status) {
    query = query.eq("status", status);
  }

  const ordered = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  // Overdue must be filtered before it can be paginated: the predicate runs
  // in memory, so slicing first would page over rows that then disappear and
  // report a total counting invoices that are not overdue at all.
  if (isDerivedOverdue) {
    const { data, error } = await ordered;

    if (error) {
      console.error("[GetInvoices] error:", error);
      return emptyPaginatedResult(pagination);
    }

    const overdue = ((data as unknown as Invoice[]) || []).filter((invoice) =>
      isOverdue(invoice),
    );

    return {
      data: overdue.slice(
        normalizedPagination.offset,
        normalizedPagination.offset + normalizedPagination.pageSize,
      ),
      pagination: buildPaginationMeta(overdue.length, pagination),
    };
  }

  const { data, error, count } = await ordered.range(
    normalizedPagination.offset,
    normalizedPagination.offset + normalizedPagination.pageSize - 1,
  );

  if (error) {
    console.error("[GetInvoices] error:", error);
    return emptyPaginatedResult(pagination);
  }

  return {
    data: (data as Invoice[]) || [],
    pagination: buildPaginationMeta(count ?? 0, pagination),
  };
}

export async function GetInvoice(
  invoiceId: string
): Promise<Invoice | null> {
  if (!invoiceId) return null;

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
      *,
      customer:customers(id, name, email, phone),
      items:invoice_items(*)
    `
    )
    .eq("id", invoiceId)
    .single();

  if (error) {
    console.error("[GetInvoice] error:", error);
    return null;
  }

  return data as Invoice;
}

export async function GetInvoiceKpis(
  clerkOrgId: string,
  locationId?: string | null
): Promise<InvoiceKpis> {
  if (!clerkOrgId) return EMPTY_KPIS;

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return EMPTY_KPIS;

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_invoice_kpis", {
    p_merchant_id: merchantId,
    p_location_id: locationId && locationId !== "all" ? locationId : null,
  });

  if (error || !data) {
    console.error("[GetInvoiceKpis] error:", error);
    return EMPTY_KPIS;
  }

  const k = data as {
    outstanding?: number | string;
    paid_this_month?: number | string;
    overdue_count?: number | string;
    overdue_amount?: number | string;
    draft_count?: number | string;
  };

  return {
    outstanding: Number(k.outstanding ?? 0),
    paidThisMonth: Number(k.paid_this_month ?? 0),
    overdueCount: Number(k.overdue_count ?? 0),
    overdueAmount: Number(k.overdue_amount ?? 0),
    draftCount: Number(k.draft_count ?? 0),
  };
}

// =============================================================================
// Write Actions
// =============================================================================

export async function CreateInvoice(
  clerkOrgId: string,
  input: CreateInvoiceInput
): Promise<{ data?: Invoice; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const supabase = createServerSupabaseClient();
  const invoiceNumber = await generateInvoiceNumber(merchantId, supabase);

  const discountAmount = input.discount_amount ?? 0;
  const taxRate = input.tax_rate ?? 0;
  const taxAmount =
    input.tax_amount ?? Math.round(((input.subtotal - discountAmount) * taxRate) / 100 * 100) / 100;
  const totalAmount =
    input.total_amount ?? input.subtotal - discountAmount + taxAmount;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      merchant_id: merchantId,
      location_id: input.location_id || null,
      customer_id: input.customer_id || null,
      invoice_number: invoiceNumber,
      status: input.status ?? "draft",
      payment_due_type: input.payment_due_type,
      due_date: input.due_date || null,
      subtotal: input.subtotal,
      discount_amount: discountAmount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      note: input.note || null,
    })
    .select()
    .single();

  if (invoiceError) {
    console.error("[CreateInvoice] error:", invoiceError);
    return { error: invoiceError.message };
  }

  // Insert line items
  if (input.items && input.items.length > 0) {
    const itemRows = input.items.map((item, idx) => ({
      invoice_id: invoice.id,
      menu_item_id: item.menu_item_id || null,
      name: item.name,
      description: item.description || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: Math.round(item.quantity * item.unit_price * 100) / 100,
      is_to_go: item.is_to_go ?? false,
      sort_order: item.sort_order ?? idx,
    }));

    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(itemRows);

    if (itemsError) {
      console.error("[CreateInvoice] items insert error:", itemsError);
      // Invoice header was created; surface a warning so the caller can inform the user
      await LogAuditEvent({
        merchantId,
        action: `Created Invoice: ${invoiceNumber}`,
        actionCategory: "billing",
        resourceType: "invoice",
        resourceId: invoice.id,
        resourceName: invoiceNumber,
        metadata: {
          status: invoice.status,
          total_amount: totalAmount,
          customer_id: input.customer_id,
          items_error: itemsError.message,
        },
      });
      return {
        data: invoice as Invoice,
        error: "Invoice was created but line items could not be saved. Please edit the invoice to re-add them.",
      };
    }
  }

  await LogAuditEvent({
    merchantId,
    action: `Created Invoice: ${invoiceNumber}`,
    actionCategory: "billing",
    resourceType: "invoice",
    resourceId: invoice.id,
    resourceName: invoiceNumber,
    metadata: {
      status: invoice.status,
      total_amount: totalAmount,
      customer_id: input.customer_id,
    },
  });

  return { data: invoice as Invoice };
}

export async function UpdateInvoice(
  invoiceId: string,
  input: UpdateInvoiceInput
): Promise<{ data?: Invoice; error?: string }> {
  if (!invoiceId) return { error: "Invoice ID is required" };

  const supabase = createServerSupabaseClient();

  // Fetch existing for audit
  const { data: existing } = await supabase
    .from("invoices")
    .select("merchant_id, invoice_number, status, total_amount")
    .eq("id", invoiceId)
    .single();

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.customer_id !== undefined) updatePayload.customer_id = input.customer_id;
  if (input.location_id !== undefined) updatePayload.location_id = input.location_id;
  if (input.status !== undefined) updatePayload.status = input.status;
  if (input.payment_due_type !== undefined) updatePayload.payment_due_type = input.payment_due_type;
  if (input.due_date !== undefined) updatePayload.due_date = input.due_date;
  if (input.subtotal !== undefined) updatePayload.subtotal = input.subtotal;
  if (input.discount_amount !== undefined) updatePayload.discount_amount = input.discount_amount;
  if (input.tax_rate !== undefined) updatePayload.tax_rate = input.tax_rate;
  if (input.tax_amount !== undefined) updatePayload.tax_amount = input.tax_amount;
  if (input.total_amount !== undefined) updatePayload.total_amount = input.total_amount;
  if (input.note !== undefined) updatePayload.note = input.note;

  const { data: updated, error } = await supabase
    .from("invoices")
    .update(updatePayload)
    .eq("id", invoiceId)
    .select()
    .single();

  if (error) {
    console.error("[UpdateInvoice] error:", error);
    return { error: error.message };
  }

  // Replace items if provided
  if (input.items !== undefined) {
    const { error: deleteError } = await supabase
      .from("invoice_items")
      .delete()
      .eq("invoice_id", invoiceId);

    if (deleteError) {
      console.error("[UpdateInvoice] failed to delete existing items:", deleteError);
      return { error: "Invoice header updated but items could not be replaced: " + deleteError.message };
    }

    if (input.items.length > 0) {
      const itemRows = input.items.map((item, idx) => ({
        invoice_id: invoiceId,
        menu_item_id: item.menu_item_id || null,
        name: item.name,
        description: item.description || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: Math.round(item.quantity * item.unit_price * 100) / 100,
        is_to_go: item.is_to_go ?? false,
        sort_order: item.sort_order ?? idx,
      }));

      const { error: insertError } = await supabase
        .from("invoice_items")
        .insert(itemRows);

      if (insertError) {
        console.error("[UpdateInvoice] CRITICAL: items deleted but re-insert failed:", insertError);
        return {
          data: updated as Invoice,
          error: "Invoice updated but items could not be saved. Please edit the invoice to re-add them.",
        };
      }
    }
  }

  if (existing) {
    await LogAuditEvent({
      merchantId: existing.merchant_id,
      action: `Updated Invoice: ${existing.invoice_number}`,
      actionCategory: "billing",
      resourceType: "invoice",
      resourceId: invoiceId,
      resourceName: existing.invoice_number,
      changes: {
        before: { status: existing.status, total_amount: existing.total_amount },
        after: { status: updated.status, total_amount: updated.total_amount },
      },
    });
  }

  return { data: updated as Invoice };
}

export async function UpdateInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus
): Promise<{ success: boolean; error?: string }> {
  if (!invoiceId) return { success: false, error: "Invoice ID is required" };

  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("invoices")
    .select("merchant_id, invoice_number, status")
    .eq("id", invoiceId)
    .single();

  const { error } = await supabase
    .from("invoices")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", invoiceId);

  if (error) {
    console.error("[UpdateInvoiceStatus] error:", error);
    return { success: false, error: error.message };
  }

  if (existing) {
    await LogAuditEvent({
      merchantId: existing.merchant_id,
      action: `Updated Invoice Status: ${existing.invoice_number}`,
      actionCategory: "billing",
      resourceType: "invoice",
      resourceId: invoiceId,
      resourceName: existing.invoice_number,
      changes: {
        before: { status: existing.status },
        after: { status },
      },
    });
  }

  return { success: true };
}

export async function DeleteInvoice(
  invoiceId: string
): Promise<{ success: boolean; error?: string }> {
  if (!invoiceId) return { success: false, error: "Invoice ID is required" };

  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("invoices")
    .select("merchant_id, invoice_number")
    .eq("id", invoiceId)
    .single();

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", invoiceId);

  if (error) {
    console.error("[DeleteInvoice] error:", error);
    return { success: false, error: error.message };
  }

  if (existing) {
    await LogAuditEvent({
      merchantId: existing.merchant_id,
      action: `Deleted Invoice: ${existing.invoice_number}`,
      actionCategory: "billing",
      resourceType: "invoice",
      resourceId: invoiceId,
      resourceName: existing.invoice_number,
    });
  }

  return { success: true };
}
