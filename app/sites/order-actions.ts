"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** Shared tax rate lookup by location_id. Prefers 'standard'/'default' category,
 *  falls back to any active rate (handles custom category names set in dashboard).
 *  Returns a decimal multiplier, e.g. 0.08875 for 8.875%. */
async function getTaxRateForLocation(
  supabase: ReturnType<typeof createServiceRoleClient>,
  locationId: string
): Promise<number> {
  let { data: taxRate } = await supabase
    .from("tax_rates")
    .select("percentage")
    .eq("location_id", locationId)
    .eq("is_active", true)
    .in("tax_category", ["standard", "default"])
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!taxRate) {
    const { data: fallbackRate } = await supabase
      .from("tax_rates")
      .select("percentage")
      .eq("location_id", locationId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    taxRate = fallbackRate;
  }

  return taxRate?.percentage ? taxRate.percentage / 100 : 0;
}

export async function getStoreTaxRate(storeConfigId: string): Promise<number> {
  const supabase = createServiceRoleClient();

  const { data: config } = await supabase
    .from("online_store_config")
    .select("location_id")
    .eq("id", storeConfigId)
    .single();

  if (!config?.location_id) return 0;
  return getTaxRateForLocation(supabase, config.location_id);
}

/** Fetch tax rate directly from a location UUID — used by order tracking
 *  so it doesn't depend on site.id being available. */
export async function getStoreTaxRateByLocationId(locationId: string): Promise<number> {
  if (!locationId) return 0;
  const supabase = createServiceRoleClient();
  return getTaxRateForLocation(supabase, locationId);
}

export interface PlaceOrderItem {
  id: string; // menu_item_id
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  modifiers?: {
    id: string | null;
    name: string;
    price: number;
    quantity: number;
    groupName: string | null;
  }[];
}

export interface PlaceOrderDetails {
  orderType: "pickup" | "delivery";
  deliveryAddress?: {
    street: string;
    unit?: string;
    city: string;
    state: string;
    zip: string;
    delivery_notes?: string;
  } | null;
  requestedTime?: string | null;
  tip?: number;
  specialInstructions?: string;
}

export interface PlaceOrderResult {
  success: boolean;
  error?: string;
  orderId?: string;
  orderNumber?: string;
  displayNumber?: string;
  estimatedTime?: number;
}

export async function placeOrder(
  sessionToken: string,
  items: PlaceOrderItem[],
  details: PlaceOrderDetails
): Promise<PlaceOrderResult> {
  if (!sessionToken) {
    return { success: false, error: "Not authenticated" };
  }

  const supabase = createServiceRoleClient();

  // Load the session
  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("*, online_store_config!inner(location_id, merchant_id, estimated_prep_minutes)")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session) {
    return { success: false, error: "Session expired. Please sign in again." };
  }

  if (!session.is_authenticated) {
    return { success: false, error: "Please verify your phone number first." };
  }

  const locationId = (session as any).online_store_config.location_id;
  const estimatedMinutes =
    (session as any).online_store_config.estimated_prep_minutes ?? 20;

  // Calculate totals
  let subtotal = 0;
  const rpcItems = items.map((item) => {
    const modifierTotal = (item.modifiers ?? []).reduce(
      (sum, m) => sum + m.price * m.quantity,
      0
    );
    const unitPrice = item.price + modifierTotal;
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;

    return {
      id: item.id,
      name: item.name,
      note: item.notes ?? null,
      price: unitPrice,
      total: lineTotal,
      quantity: item.quantity,
      external_id: item.id,
      modifiers: (item.modifiers ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        price: m.price,
        quantity: m.quantity,
        group_name: m.groupName,
      })),
    };
  });

  // Fetch tax rate for this location — prefer standard/default, fall back to any active rate
  let { data: taxRate } = await supabase
    .from("tax_rates")
    .select("percentage")
    .eq("location_id", locationId)
    .eq("is_active", true)
    .in("tax_category", ["standard", "default"])
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!taxRate) {
    const { data: fallbackRate } = await supabase
      .from("tax_rates")
      .select("percentage")
      .eq("location_id", locationId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    taxRate = fallbackRate;
  }

  const taxPercent = taxRate?.percentage ?? 0;
  const tax = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
  const tip = details.tip ?? 0;
  const total = subtotal + tax + tip;

  // Build a unique provider_order_id for idempotency
  const providerOrderId = `web-${session.id}-${Date.now()}`;

  const orderTypeRaw =
    details.orderType === "delivery" ? "DELIVERY" : "PICKUP";

  const deliveryAddr = details.deliveryAddress
    ? {
        street: details.deliveryAddress.street,
        unit: details.deliveryAddress.unit ?? null,
        city: details.deliveryAddress.city,
        state: details.deliveryAddress.state,
        zip: details.deliveryAddress.zip,
        delivery_notes: details.deliveryAddress.delivery_notes ?? null,
      }
    : null;

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "process_online_order",
    {
      p_location_id: locationId,
      p_provider: "website",
      p_provider_order_id: providerOrderId,
      p_order_type_raw: orderTypeRaw,
      p_customer_name: session.customer_name,
      p_customer_phone: session.customer_phone,
      p_customer_email: session.customer_email,
      p_subtotal: subtotal,
      p_tax: tax,
      p_total: total,
      p_gratuity: tip,
      p_items: rpcItems,
      p_delivery_address: deliveryAddr,
      p_order_notes: details.specialInstructions ?? null,
      p_placed_at: new Date().toISOString(),
      p_ready_by: details.requestedTime ?? null,
      p_auto_accept: true,
    }
  );

  if (rpcError) {
    console.error("process_online_order RPC error:", rpcError);
    return { success: false, error: "Failed to place order. Please try again." };
  }

  const result = rpcResult as any;
  if (!result?.success) {
    return {
      success: false,
      error: result?.error ?? "Order processing failed",
    };
  }

  // Link the order to the session
  await supabase
    .from("online_order_sessions")
    .update({
      order_id: result.order_id,
      cart_data: rpcItems,
      order_type: details.orderType,
      delivery_address: deliveryAddr,
      requested_time: details.requestedTime ?? null,
    })
    .eq("id", session.id);

  // Link order to customer if we have a customer_id
  if (session.customer_id) {
    await supabase
      .from("orders")
      .update({ customer_id: session.customer_id })
      .eq("id", result.order_id);
  }

  return {
    success: true,
    orderId: result.order_id,
    orderNumber: result.order_number,
    displayNumber: result.display_number,
    estimatedTime: estimatedMinutes,
  };
}

// ---- Order Tracking ----

export interface OrderTrackingData {
  orderId: string;
  locationId: string;
  orderNumber: string;
  displayNumber: string;
  status: string;
  orderType: string;
  customerName: string | null;
  createdAt: string;
  sentToKitchenAt: string | null;
  startedPreparingAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  estimatedPrepMinutes: number;
  subtotal: number;
  tax: number;
  taxRatePercent: number | null; // stored rate from order_items.tax_rate (e.g. 8.875)
  tip: number;
  total: number;
  specialInstructions: string | null;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    specialInstructions: string | null;
  }[];
}

export async function getOrderTracking(
  orderId: string
): Promise<{ data: OrderTrackingData | null }> {
  const supabase = createServiceRoleClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `
      id, order_number, display_number, status, order_type,
      customer_name, created_at, sent_to_kitchen_at, started_preparing_at,
      ready_at, completed_at, cancelled_at, cancellation_reason,
      subtotal, tax_amount, tip_amount, total_amount,
      special_instructions, location_id,
      order_items (item_name, quantity, unit_price, subtotal, special_instructions, tax_rate)
    `
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { data: null };
  }

  // Get estimated prep minutes from online_store_config
  const { data: config } = await supabase
    .from("online_store_config")
    .select("estimated_prep_minutes")
    .eq("location_id", (order as any).location_id)
    .limit(1)
    .single();

  const o = order as any;
  return {
    data: {
      orderId: o.id,
      locationId: o.location_id,
      orderNumber: o.order_number,
      displayNumber: o.display_number,
      status: o.status,
      orderType: o.order_type,
      customerName: o.customer_name,
      createdAt: o.created_at,
      sentToKitchenAt: o.sent_to_kitchen_at,
      startedPreparingAt: o.started_preparing_at,
      readyAt: o.ready_at,
      completedAt: o.completed_at,
      cancelledAt: o.cancelled_at,
      cancellationReason: o.cancellation_reason ?? null,
      estimatedPrepMinutes: config?.estimated_prep_minutes ?? 20,
      subtotal: Number(o.subtotal) || 0,
      tax: Number(o.tax_amount) || 0,
      taxRatePercent: (() => {
        const rates = (o.order_items ?? [])
          .map((i: any) => Number(i.tax_rate))
          .filter((r: number) => r > 0);
        return rates.length > 0 ? rates[0] : null;
      })(),
      tip: Number(o.tip_amount) || 0,
      total: Number(o.total_amount) || 0,
      specialInstructions: o.special_instructions,
      items: (o.order_items ?? []).map((i: any) => ({
        name: i.item_name,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price) || 0,
        subtotal: Number(i.subtotal) || 0,
        specialInstructions: i.special_instructions,
      })),
    },
  };
}

export interface OrderHistoryEntry {
  id: string;
  orderNumber: string;
  displayNumber: string;
  orderType: string;
  status: string;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  createdAt: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
}

export async function getOrderHistory(
  sessionToken: string
): Promise<{ data: OrderHistoryEntry[]; error?: string }> {
  if (!sessionToken) {
    return { data: [], error: "Not authenticated" };
  }

  const supabase = createServiceRoleClient();

  // Get the session to find the customer_id
  const { data: session } = await supabase
    .from("online_order_sessions")
    .select("customer_id")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session?.customer_id) {
    return { data: [], error: "No customer linked" };
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      `
      id, order_number, display_number, order_type, status,
      subtotal, tax_amount, tip_amount, total_amount, created_at,
      order_items (item_name, quantity, unit_price, subtotal)
    `
    )
    .eq("customer_id", session.customer_id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return { data: [], error: "Failed to load order history" };
  }

  return {
    data: (orders ?? []).map((o: any) => ({
      id: o.id,
      orderNumber: o.order_number,
      displayNumber: o.display_number,
      orderType: o.order_type,
      status: o.status,
      subtotal: Number(o.subtotal) || 0,
      tax: Number(o.tax_amount) || 0,
      tip: Number(o.tip_amount) || 0,
      total: Number(o.total_amount) || 0,
      createdAt: o.created_at,
      items: (o.order_items ?? []).map((i: any) => ({
        name: i.item_name,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price) || 0,
        subtotal: Number(i.subtotal) || 0,
      })),
    })),
  };
}
