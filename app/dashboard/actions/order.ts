"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { LogAuditEvent } from "./audit-logs";
import {
  Order,
  OrderItem,
  OrderPayment,
  OrderItemModifier,
  OrderResponse,
  OrderFilters,
} from "@/types/order-management";

export async function GetOrders(
  clerkOrgId: string,
  locationId?: string | null,
  filters?: OrderFilters
): Promise<OrderResponse[]> {
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
    console.error("[GetOrders] Error getting merchant:", merchantError);
    return [];
  }

  // Build query with location filtering
  let query = supabase
    .from("orders")
    .select(
      `
            *,
            order_items(
            *,
            order_item_modifiers(
                *
            )
            ),
            order_payments(*)
            `
    )
    .eq("merchant_id", merchant.id);

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  // Apply filters
  if (filters) {
    // Date Range
    if (filters.dateRange?.from) {
      query = query.gte("created_at", filters.dateRange.from.toISOString());
    }
    if (filters.dateRange?.to) {
      // Set to end of day if it's the same as from or if only date is provided
      const toDate = new Date(filters.dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      query = query.lte("created_at", toDate.toISOString());
    }

    // Status
    if (filters.status && filters.status.length > 0) {
      query = query.in("status", filters.status);
    }

    // Order Type
    if (filters.orderType && filters.orderType.length > 0) {
      query = query.in("order_type", filters.orderType);
    }

    // Staff
    if (filters.staffId && filters.staffId !== "all") {
      query = query.eq("created_by_staff_id", filters.staffId);
    }

    // Amount Range
    if (filters.amountRange?.min !== undefined) {
      query = query.gte("total_amount", filters.amountRange.min);
    }
    if (filters.amountRange?.max !== undefined) {
      query = query.lte("total_amount", filters.amountRange.max);
    }
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("[GetOrders] Error getting orders:", error);
    return [];
  }

  let result = (data as OrderResponse[]) || [];

  // Enrich orders with staff/user names (embedded join can fail; batch fetch is reliable)
  const staffIds = [
    ...new Set(result.map((o) => (o as any).created_by_staff_id).filter(Boolean)),
  ] as string[];
  const userIds = [
    ...new Set(result.map((o) => (o as any).created_by_user_id).filter(Boolean)),
  ] as string[];

  const [staffRes, userRes] = await Promise.all([
    staffIds.length > 0
      ? supabase
          .from("staff_profiles")
          .select("id, first_name, last_name, display_name")
          .in("id", staffIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null; display_name: string | null }[] }),
    userIds.length > 0
      ? supabase
          .from("users")
          .select("id, first_name, last_name")
          .in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[] }),
  ]);

  const staffById = new Map<string, { first_name?: string | null; last_name?: string | null; display_name?: string | null }>();
  for (const s of staffRes.data ?? []) {
    if (s?.id) staffById.set(s.id, s);
  }
  const userById = new Map<string, { first_name?: string | null; last_name?: string | null }>();
  for (const u of userRes.data ?? []) {
    if (u?.id) userById.set(u.id, u);
  }

  for (const order of result) {
    const orderAny = order as any;

    if (!order.created_by_staff && orderAny.created_by_staff_id) {
      const s = staffById.get(orderAny.created_by_staff_id);
      if (s) {
        orderAny.created_by_staff = {
          first_name: s.first_name ?? undefined,
          last_name: s.last_name ?? undefined,
          display_name: s.display_name ?? undefined,
        };
      }
    }
    if (!order.created_by_user && orderAny.created_by_user_id) {
      const u = userById.get(orderAny.created_by_user_id);
      if (u) {
        orderAny.created_by_user = {
          first_name: u.first_name ?? undefined,
          last_name: u.last_name ?? undefined,
        };
      }
    }
  }

  // Fallback: the embedded order_items join can intermittently return empty
  // (the same PostgREST quirk the staff/user enrichment above works around).
  // Batch-fetch items + modifiers for any order that came back without them so
  // receipts always have a line-item body to render.
  const ordersMissingItems = result.filter(
    (o) => !o.order_items || o.order_items.length === 0
  );
  if (ordersMissingItems.length > 0) {
    const missingIds = ordersMissingItems.map((o) => o.id);
    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select("*, order_item_modifiers(*)")
      .in("order_id", missingIds);

    if (itemsError) {
      console.error("[GetOrders] Error backfilling order_items:", itemsError);
    } else if (itemsData && itemsData.length > 0) {
      const itemsByOrder = new Map<string, any[]>();
      for (const it of itemsData as any[]) {
        const arr = itemsByOrder.get(it.order_id) ?? [];
        arr.push(it);
        itemsByOrder.set(it.order_id, arr);
      }
      for (const o of ordersMissingItems) {
        const items = itemsByOrder.get(o.id);
        if (items) (o as any).order_items = items;
      }
    }
  }

  // In-memory filter for Payment Method
  if (filters?.paymentMethod && filters.paymentMethod.length > 0) {
    result = result.filter((order) => {
      // If order has no payments, it doesn't match a specific payment method filter
      if (!order.order_payments || order.order_payments.length === 0)
        return false;

      // Check if any of the order's payments match the selected methods
      return order.order_payments.some((payment) =>
        filters.paymentMethod?.includes(payment.payment_method)
      );
    });
  }

  return result;
}

/**
 * Resolve the physical table label(s) for a dine-in order via its table
 * session. A merged check spans multiple tables (one session, many
 * `table_session_tables`), so `orders.table_number` names only one of them.
 * Returns all active tables ordered primary-first then by seated position,
 * plus a display label e.g. "Tables 4 + 5".
 */
export async function GetSessionTableLabel(
  sessionId: string
): Promise<{ tables: string[]; label: string | null }> {
  if (!sessionId) return { tables: [], label: null };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("table_session_tables")
    .select("is_primary, seated_position, is_active, floor_plan_objects(name)")
    .eq("session_id", sessionId)
    .eq("is_active", true);

  if (error || !data || data.length === 0) {
    if (error) console.error("[GetSessionTableLabel] Error:", error);
    return { tables: [], label: null };
  }

  const rows = [...(data as any[])].sort((a, b) => {
    // Primary table first, then by seated_position.
    if (!!a.is_primary !== !!b.is_primary) return a.is_primary ? -1 : 1;
    return (a.seated_position ?? 0) - (b.seated_position ?? 0);
  });

  const tables = rows
    .map((r) => r?.floor_plan_objects?.name)
    .filter((n): n is string => !!n);

  if (tables.length === 0) return { tables: [], label: null };

  const label =
    tables.length === 1
      ? `Table ${tables[0]}`
      : `Tables ${tables.join(" + ")}`;

  return { tables, label };
}

export async function GetCustomerOrders(
  customerId: string,
  locationId?: string
): Promise<OrderResponse[]> {
  if (!customerId) return [];

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("orders")
    .select(
      `*, order_items(*, order_item_modifiers(*)), order_payments(*)`
    )
    .eq("customer_id", customerId);

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("[GetCustomerOrders] Error:", error);
    return [];
  }

  return (data as OrderResponse[]) || [];
}

export async function GetOrderDetails(
  orderId: string,
  clerkOrgId?: string
): Promise<OrderResponse | null> {
  if (!orderId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  try {
    // If clerkOrgId provided, validate merchant access
    if (clerkOrgId) {
      const { data: merchant, error: merchantError } = await supabase
        .from("merchants")
        .select("id")
        .eq("clerk_org_id", clerkOrgId)
        .single();

      if (merchantError || !merchant) {
        console.error("[GetOrderDetails] Error getting merchant from clerk org:", merchantError);
        return null;
      }

      // Query with merchant filter
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select(
          `
                *,
                order_items(
                    *,
                    order_item_modifiers(*)
                ),
                order_payments(
                    *,
                    order_payment_items(
                        *,
                        order_items(id, item_name, quantity)
                    )
                ),
                order_status_history(
                *,
                users(first_name, last_name),
                staff_profiles(first_name, last_name)
                ),
                table_sessions(
                *,
                table_session_events(
                *,
                staff_profiles(first_name, last_name)
                )
                )
                `
        )
        .eq("id", orderId)
        .eq("merchant_id", merchant.id)
        .single();

      if (orderError || !order) {
        console.error("[GetOrderDetails] Order not found or access denied:", orderError);
        return null;
      }

      return order as OrderResponse;
    } else {
      // Fallback without merchant validation (RLS will handle it)
      console.warn("[GetOrderDetails] No clerkOrgId provided, relying on RLS");
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select(
          `
                *,
                order_items(
                    *,
                    order_item_modifiers(*)
                ),
                order_payments(
                    *,
                    order_payment_items(
                        *,
                        order_items(id, item_name, quantity)
                    )
                ),
                order_status_history(
                *,
                users(first_name, last_name),
                staff_profiles(first_name, last_name)
                ),
                table_sessions(
                *,
                table_session_events(
                *,
                staff_profiles(first_name, last_name)
                )
                )
                `
        )
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        console.error("[GetOrderDetails] Error getting order:", orderError);
        return null;
      }

      return order as OrderResponse;
    }
  } catch (error) {
    console.error("[GetOrderDetails] Unexpected error:", error);
    return null;
  }
}

export async function RefundOrder(
  clerkOrgId: string,
  orderId: string,
  reason: string = "Merchant Refund"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    return { success: false, error: "Merchant not found" };
  }

  const { data: order } = await supabase
    .from("orders")
    .select("order_number, total_amount, location_id")
    .eq("id", orderId)
    .eq("merchant_id", merchant.id)
    .single();

  const { error: orderError } = await supabase
    .from("orders")
    .update({
      status: "refunded",
      payment_status: "refunded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("merchant_id", merchant.id);

  if (orderError) return { success: false, error: orderError.message };

  await supabase
    .from("order_payments")
    .update({
      status: "refunded",
      refunded_at: new Date().toISOString(),
      refund_reason: reason,
    } as any)
    .eq("order_id", orderId)
    .in("status", ["captured", "paid"]);

  if (order) {
    await LogAuditEvent({
      clerkOrgId,
      locationId: order.location_id,
      action: `Refunded Order: ${order.order_number}`,
      actionCategory: "order",
      severity: "critical",
      resourceType: "order",
      resourceId: orderId,
      resourceName: order.order_number,
      metadata: { amount: order.total_amount, reason },
    });
  }

  return { success: true };
}

export async function VoidOrder(
  clerkOrgId: string,
  orderId: string,
  reason: string = "Merchant Void"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    return { success: false, error: "Merchant not found" };
  }

  const { data: order } = await supabase
    .from("orders")
    .select("order_number, total_amount, location_id")
    .eq("id", orderId)
    .eq("merchant_id", merchant.id)
    .single();

  const { error: orderError } = await supabase
    .from("orders")
    .update({
      status: "voided",
      payment_status: "unpaid",
      voided_at: new Date().toISOString(),
      void_reason: reason,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", orderId)
    .eq("merchant_id", merchant.id);

  if (orderError) return { success: false, error: orderError.message };

  await supabase
    .from("order_payments")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
    } as any)
    .eq("order_id", orderId)
    .in("status", ["pending", "authorized", "captured", "paid"]);

  if (order) {
    await LogAuditEvent({
      clerkOrgId,
      locationId: order.location_id,
      action: `Voided Order: ${order.order_number}`,
      actionCategory: "order",
      severity: "critical",
      resourceType: "order",
      resourceId: orderId,
      resourceName: order.order_number,
      metadata: { amount: order.total_amount, reason },
    });
  }

  return { success: true };
}
