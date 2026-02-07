"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PaymentRecord, PaymentFilters } from "@/types/payment";

export async function GetPayments(
  clerkOrgId: string,
  locationId?: string | null,
  filters?: PaymentFilters
): Promise<PaymentRecord[]> {
  if (!clerkOrgId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  // Get merchant ID from clerk org ID
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("[GetPayments] Error getting merchant:", merchantError);
    return [];
  }

  // Build query with nested joins
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
      ),
      order_payment_items(
        *,
        order_items(id, item_name, quantity)
      ),
      reversals(
        *,
        order_refund_items(*)
      )
    `
    )
    .eq("orders.merchant_id", merchant.id);

  // Location scoping
  if (locationId && locationId !== "all") {
    query = query.eq("orders.location_id", locationId);
  }

  // Apply filters
  if (filters) {
    // Date Range on initiated_at
    if (filters.dateRange?.from) {
      const from = new Date(filters.dateRange.from);
      if (!isNaN(from.getTime())) {
        query = query.gte("initiated_at", from.toISOString());
      }
    }
    if (filters.dateRange?.to) {
      const toDate = new Date(filters.dateRange.to);
      if (!isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        query = query.lte("initiated_at", toDate.toISOString());
      }
    }

    // Payment method
    if (filters.paymentMethod && filters.paymentMethod.length > 0) {
      query = query.in("payment_method", filters.paymentMethod);
    }

    // Status
    if (filters.status && filters.status.length > 0) {
      query = query.in("status", filters.status);
    }

    // Amount range
    if (filters.amountRange?.min !== undefined) {
      query = query.gte("total_amount", filters.amountRange.min);
    }
    if (filters.amountRange?.max !== undefined) {
      query = query.lte("total_amount", filters.amountRange.max);
    }
  }

  const { data, error } = await query.order("initiated_at", {
    ascending: false,
  });

  if (error) {
    console.error("[GetPayments] Error getting payments:", error);
    return [];
  }

  let result = (data as PaymentRecord[]) || [];

  // Client-side filters (not supported by PostgREST)
  if (filters?.cardType && filters.cardType.length > 0) {
    result = result.filter(
      (p) => p.card_type && filters.cardType!.includes(p.card_type)
    );
  }

  if (filters?.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    result = result.filter(
      (p) =>
        p.orders?.order_number?.toLowerCase().includes(q) ||
        p.orders?.display_number?.toLowerCase().includes(q) ||
        p.authorization_code?.toLowerCase().includes(q) ||
        p.card_last_four?.includes(q) ||
        p.orders?.customer_name?.toLowerCase().includes(q) ||
        p.reference_number?.toLowerCase().includes(q) ||
        p.transaction_id?.toLowerCase().includes(q)
    );
  }

  return result;
}

