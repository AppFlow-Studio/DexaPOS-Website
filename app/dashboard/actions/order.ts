"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
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

export async function GetOrderDetails(
  orderId: string
): Promise<OrderResponse | null> {
  if (!orderId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  try {
    // Get order with related items (including modifiers) and payments
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        `
                *,
                order_items(
                    *,
                    order_item_modifiers(*)
                ),
                order_payments(*),
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
    console.log("order", order);

    return order as OrderResponse;
  } catch (error) {
    console.error("[GetOrderDetails] Unexpected error:", error);
    return null;
  }
}
