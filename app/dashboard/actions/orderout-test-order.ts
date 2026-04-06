"use server";

// ============================================================================
// OrderOut Test Order — Merchant-facing webhook tester
// ============================================================================
// Fires a synthetic OrderOut webhook against our own edge function to verify
// the full ingestion pipe (auth → restaurant lookup → translator → RPC →
// orders/online_orders/order_items). Uses real menu items from the selected
// location so line items resolve cleanly.
//
// The webhook secret is read server-side only — never reaches the browser.
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";
import { getCurrentUserMerchantRole } from "./role-check";
import {
  buildOrderOutTestPayload,
  generateTestOrderNumber,
  type OrderOutTestOrderType,
  type OrderOutTestDeliveryCompany,
} from "@/lib/orderout/build-test-payload";

// ============================================================================
// Types
// ============================================================================

export interface SendTestOrderInput {
  locationId: string;
  orderType?: OrderOutTestOrderType; // default PICKUP
  deliveryCompany?: OrderOutTestDeliveryCompany; // default OrderOut
  itemCount?: number | "random"; // default "random" → 1–4
  forceSend?: boolean; // bypass is_accepting_orders guard
}

export interface SendTestOrderResult {
  success: boolean;
  error?: string;
  message?: string;
  testOrderNumber?: string;
  data?: {
    order_id?: string;
    order_number?: string;
    display_number?: string;
    status?: string;
    payment_status?: string;
    item_count?: number;
    auto_accepted?: boolean;
    duplicate?: boolean;
    warnings?: string[];
  } | null;
  /** true when the webhook stored the payload in the DLQ instead of creating an order */
  stored_in_dlq?: boolean;
}

export interface TestOrderHistoryRow {
  id: string; // online_orders.id
  orderId: string; // orders.id
  testOrderNumber: string; // provider_order_id (TEST-...)
  status: string; // orders.status
  createdAt: string;
  total: number;
  itemCount: number;
  deliveryCompany: string | null;
  orderType: string;
}

// ============================================================================
// Helpers
// ============================================================================

function pickRandom<T>(arr: T[], count: number): T[] {
  if (count >= arr.length) return [...arr];
  // Fisher-Yates partial shuffle
  const copy = [...arr];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ============================================================================
// Main: sendOrderOutTestOrder
// ============================================================================

export async function sendOrderOutTestOrder(
  input: SendTestOrderInput
): Promise<SendTestOrderResult> {
  const { locationId, orderType = "PICKUP", deliveryCompany = "OrderOut", forceSend = false } =
    input;

  if (!locationId) {
    return { success: false, error: "Missing locationId" };
  }

  // 1. Authz — confirm caller is an admin/owner for this merchant
  const role = await getCurrentUserMerchantRole();
  if (!role) {
    return { success: false, error: "Not authenticated" };
  }
  if (!role.isOwnerOrAdmin) {
    return {
      success: false,
      error: "Only merchant owners or admins can send test orders",
    };
  }

  const supabase = createServerSupabaseClient();

  // 2. Resolve OrderOut restaurant + location name
  const { data: restaurant, error: restaurantError } = await supabase
    .from("orderout_restaurants")
    .select(
      "pos_uuid, oo_restaurant_id, is_accepting_orders, auto_accept_orders, location_id"
    )
    .eq("location_id", locationId)
    .single();

  if (restaurantError || !restaurant) {
    return {
      success: false,
      error: "This location is not onboarded to OrderOut",
    };
  }

  // Belt-and-suspenders: ensure the location belongs to this merchant
  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id, name, merchant_id")
    .eq("id", locationId)
    .single();

  if (locationError || !location) {
    return { success: false, error: "Location not found" };
  }
  if (location.merchant_id !== role.merchantId) {
    return { success: false, error: "Location does not belong to your merchant" };
  }

  // 3. Guard: not accepting orders
  if (!restaurant.is_accepting_orders && !forceSend) {
    return {
      success: false,
      error:
        "Location is not accepting orders. Toggle 'Accepting Orders' on in OrderOut, or use Force Send to test the DLQ path.",
    };
  }

  // 4. Pick real menu items for this location
  const { data: menuItems, error: menuItemsError } = await supabase
    .from("menu_items")
    .select("id, name, price, location_id")
    .eq("merchant_id", role.merchantId)
    .eq("availability", true)
    .or(`location_id.is.null,location_id.eq.${locationId}`)
    .limit(100);

  if (menuItemsError) {
    return { success: false, error: `Failed to fetch menu items: ${menuItemsError.message}` };
  }
  if (!menuItems || menuItems.length === 0) {
    return {
      success: false,
      error: "No active menu items found for this location. Add items first.",
    };
  }

  const desiredCount =
    input.itemCount === "random" || input.itemCount === undefined
      ? randomInt(1, 4)
      : Math.max(1, Math.min(input.itemCount, menuItems.length));

  const chosen = pickRandom(
    menuItems.map((m) => ({ id: m.id, name: m.name, price: Number(m.price ?? 0) })),
    desiredCount
  );
  const quantities = chosen.map(() => randomInt(1, 3));

  // 5. Build payload
  const testOrderNumber = generateTestOrderNumber();
  const payload = buildOrderOutTestPayload({
    restaurantPosUuid: restaurant.pos_uuid,
    restaurantName: location.name ?? "Test Restaurant",
    locationId,
    items: chosen,
    quantities,
    orderType,
    deliveryCompany,
    orderNumber: testOrderNumber,
  });

  // 6. POST to our own webhook
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const webhookSecret = process.env.ORDEROUT_WEBHOOK_SECRET;
  if (!supabaseUrl || !webhookSecret) {
    return { success: false, error: "Server configuration error (missing webhook env)" };
  }

  let webhookResponse: Response;
  let webhookJson: {
    success?: boolean;
    data?: SendTestOrderResult["data"];
    message?: string;
    error?: string;
  };

  try {
    webhookResponse = await fetch(
      `${supabaseUrl}/functions/v1/orderout-orders-webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webhookSecret}`,
        },
        body: JSON.stringify(payload),
      }
    );
    webhookJson = await webhookResponse.json();
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? `Webhook call failed: ${err.message}`
          : "Webhook call failed",
      testOrderNumber,
    };
  }

  if (!webhookResponse.ok) {
    return {
      success: false,
      error: webhookJson?.error || `Webhook returned ${webhookResponse.status}`,
      testOrderNumber,
    };
  }

  // The webhook returns 200 for successful creation AND for DLQ-path responses
  // (restaurant not accepting, missing restaurantId, etc.). Differentiate by
  // whether we got an order_id back.
  const storedInDlq = !webhookJson?.data?.order_id;

  // 7. Audit log — only when the caller actually created an order
  if (!storedInDlq && webhookJson?.data?.order_id) {
    try {
      await LogAuditEvent({
        merchantId: role.merchantId,
        locationId,
        action: "Sent OrderOut test order",
        actionCategory: "integrations",
        severity: "info",
        resourceType: "order",
        resourceId: webhookJson.data.order_id,
        resourceName: testOrderNumber,
        metadata: {
          delivery_company: deliveryCompany,
          item_count: chosen.length,
          order_type: orderType,
          force_sent: forceSend,
          webhook_message: webhookJson.message,
        },
      });
    } catch (err) {
      console.warn("[sendOrderOutTestOrder] Audit log failed:", err);
    }
  }

  return {
    success: true,
    message: webhookJson?.message,
    testOrderNumber,
    data: webhookJson?.data ?? null,
    stored_in_dlq: storedInDlq,
  };
}

// ============================================================================
// listRecentTestOrders
// ============================================================================

export async function listRecentTestOrders(input: {
  locationId: string;
  limit?: number;
}): Promise<{
  success: boolean;
  data: TestOrderHistoryRow[];
  error?: string;
}> {
  const { locationId, limit = 10 } = input;
  if (!locationId) {
    return { success: false, data: [], error: "Missing locationId" };
  }

  const role = await getCurrentUserMerchantRole();
  if (!role) {
    return { success: false, data: [], error: "Not authenticated" };
  }

  const supabase = createServerSupabaseClient();

  const { data: rows, error } = await supabase
    .from("online_orders")
    .select(
      "id, order_id, provider_order_id, delivery_company, created_at, orders!inner(id, status, total_amount, location_id, merchant_id, order_type)"
    )
    .eq("provider", "orderout")
    .eq("location_id", locationId)
    .eq("merchant_id", role.merchantId)
    .like("provider_order_id", "TEST-%")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { success: false, data: [], error: error.message };
  }

  const orderIds = (rows || []).map((r) => r.order_id).filter(Boolean);
  const itemCountByOrder = new Map<string, number>();
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id")
      .in("order_id", orderIds);
    for (const oi of items || []) {
      itemCountByOrder.set(oi.order_id, (itemCountByOrder.get(oi.order_id) ?? 0) + 1);
    }
  }

  const result: TestOrderHistoryRow[] = (rows || []).map((r) => {
    const order = (Array.isArray(r.orders) ? r.orders[0] : r.orders) as {
      id: string;
      status: string;
      total_amount: number | null;
      order_type: string;
    } | null;
    return {
      id: r.id,
      orderId: r.order_id,
      testOrderNumber: r.provider_order_id,
      status: order?.status ?? "unknown",
      createdAt: r.created_at,
      total: Number(order?.total_amount ?? 0),
      itemCount: itemCountByOrder.get(r.order_id) ?? 0,
      deliveryCompany: r.delivery_company,
      orderType: order?.order_type ?? "delivery",
    };
  });

  return { success: true, data: result };
}
