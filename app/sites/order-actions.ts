"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

async function broadcastOrderStatus(orderId: string, status: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `order-update:${orderId}`,
            event: "status_changed",
            payload: { orderId, status },
          },
        ],
      }),
    });
  } catch (err) {
    console.error("broadcastOrderStatus error:", err);
  }
}

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
    .select("*, online_store_config!inner(location_id, merchant_id, estimated_prep_minutes, auto_accept_orders)")
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
  const autoAccept: boolean =
    (session as any).online_store_config.auto_accept_orders ?? false;

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
      p_auto_accept: autoAccept,
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

  // Fire transactional receipt email + confirmation SMS. Don't block the order
  // response on notification I/O — `void` so failures don't fail the checkout.
  void (async () => {
    try {
      const { sendOrderPlacedNotifications } = await import(
        "@/lib/messaging/order-notifications"
      );
      await sendOrderPlacedNotifications(result.order_id);
    } catch (err) {
      console.error("[placeOrder] notification fire-and-forget failed:", err);
    }
  })();

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
  acceptedAt: string | null;
  sentToKitchenAt: string | null;
  startedPreparingAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  declinedAt: string | null;
  declinedReason: string | null;
  estimatedPrepMinutes: number;
  requestedTime: string | null;
  locationTimezone: string;
  subtotal: number;
  tax: number;
  taxRatePercent: number | null;
  tip: number;
  total: number;
  specialInstructions: string | null;
  cardLastFour: string | null;
  cardType: string | null;
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
      customer_name, created_at, accepted_at, sent_to_kitchen_at, started_preparing_at,
      ready_at, completed_at, cancelled_at, cancelled_by, cancellation_reason,
      declined_at, declined_reason, estimated_delivery_time,
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

  // Get payment record for card info
  const { data: payment } = await supabase
    .from("order_payments")
    .select("card_last_four, card_type")
    .eq("order_id", orderId)
    .eq("payment_method", "card")
    .limit(1)
    .single();

  // Get location timezone for scheduled order display
  const { data: locationRow } = await supabase
    .from("locations")
    .select("timezone")
    .eq("id", (order as any).location_id)
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
      acceptedAt: o.accepted_at ?? null,
      sentToKitchenAt: o.sent_to_kitchen_at,
      startedPreparingAt: o.started_preparing_at,
      readyAt: o.ready_at,
      completedAt: o.completed_at,
      cancelledAt: o.cancelled_at,
      cancelledBy: o.cancelled_by ?? null,
      cancellationReason: o.cancellation_reason ?? null,
      declinedAt: o.declined_at ?? null,
      declinedReason: o.declined_reason ?? null,
      estimatedPrepMinutes: config?.estimated_prep_minutes ?? 20,
      requestedTime: o.estimated_delivery_time ?? null,
      locationTimezone: locationRow?.timezone ?? "America/New_York",
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
      cardLastFour: payment?.card_last_four ?? null,
      cardType: payment?.card_type ?? null,
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
    /** menu_items.id from the original order. Null for open items or items
     *  that pre-date menu_item_id capture — those can't be safely reordered. */
    menuItemId: string | null;
    name: string;
    quantity: number;
    /** Line unit price as charged. INCLUDES modifier cost (matches how the
     *  server stores unit_price). Reorder logic must subtract modifiers to get
     *  the base price before re-adding via addItem(). */
    unitPrice: number;
    subtotal: number;
    modifiers: {
      modifierItemId: string | null;
      name: string;
      price: number;
      quantity: number;
    }[];
  }[];
}

// ---- Customer Cancel ----

export async function cancelOnlineOrder(
  orderId: string,
  sessionToken: string,
  reason: string,
  trigger: "customer" | "timeout" = "customer"
): Promise<{ success: boolean; error?: string }> {
  if (!orderId || !sessionToken) {
    return { success: false, error: "Missing order or session" };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { success: false, error: "Cancel service is not configured." };
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/cancel-online-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        order_id: orderId,
        session_token: sessionToken,
        reason: reason || null,
        trigger,
      }),
    });

    const result = await response.json();
    if (!response.ok || !result?.success) {
      return {
        success: false,
        error: result?.error ?? "Failed to cancel order. Please try again.",
      };
    }

    void (async () => {
      try {
        const { sendOrderStatusNotifications } = await import(
          "@/lib/messaging/order-notifications"
        );
        await sendOrderStatusNotifications(orderId, "cancelled");
      } catch (err) {
        console.error("[cancelOnlineOrder] notification failed:", err);
      }
    })();

    void broadcastOrderStatus(orderId, result.status || "cancelled");
    return { success: true };
  } catch (error) {
    console.error("cancel-online-order error:", error);
    return { success: false, error: "Failed to cancel order. Please try again." };
  }
}

// ---- Promo Code Validation ----

export type PromoCodeError =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "usage_limit_reached"
  | "customer_limit_reached"
  | "minimum_not_met"
  | "first_order_only";

export interface PromoCodeResult {
  valid: boolean;
  error?: string;
  errorCode?: PromoCodeError;
  promotionId?: string;
  promotionName?: string;
  discountType?: "percentage" | "fixed_amount";
  discountValue?: number;
  discountAmount?: number; // computed dollar amount off the order
}

/**
 * Validate a promo code against the merchant's promotions table.
 * Returns the computed discount amount so the UI can apply it immediately.
 * The server action uses service-role so RLS on promotions doesn't block it.
 */
export async function validatePromoCode(
  storeConfigId: string,
  code: string,
  orderSubtotal: number,
  customerId?: string
): Promise<PromoCodeResult> {
  if (!code.trim()) return { valid: false, error: "Please enter a promo code.", errorCode: "not_found" };

  const supabase = createServiceRoleClient();

  const { data: config } = await supabase
    .from("online_store_config")
    .select("merchant_id")
    .eq("id", storeConfigId)
    .single();

  if (!config) return { valid: false, error: "Store not found.", errorCode: "not_found" };

  const { data: promoRaw } = await supabase
    .from("promotions")
    .select(
      "id, name, discount_type, discount_value, discount_max, min_order_amount, " +
      "is_active, starts_at, ends_at, max_uses_total, max_uses_per_customer, " +
      "current_uses, promo_type"
    )
    .eq("merchant_id", config.merchant_id)
    .ilike("promo_code", code.trim())
    .single();

  if (!promoRaw) return { valid: false, error: "That promo code doesn't exist.", errorCode: "not_found" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promo = promoRaw as any;

  if (!promo.is_active) {
    return { valid: false, error: "This promo code is no longer active.", errorCode: "inactive" };
  }

  const now = new Date();

  if (promo.starts_at && new Date(promo.starts_at) > now) {
    const startDate = new Date(promo.starts_at).toLocaleDateString("en-US", { month: "long", day: "numeric" });
    return { valid: false, error: `This code isn't valid until ${startDate}.`, errorCode: "not_started" };
  }

  if (promo.ends_at && new Date(promo.ends_at) < now) {
    const expDate = new Date(promo.ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric" });
    return { valid: false, error: `This code expired on ${expDate}.`, errorCode: "expired" };
  }

  if (promo.max_uses_total !== null && promo.current_uses >= promo.max_uses_total) {
    return { valid: false, error: "This promo code has reached its usage limit.", errorCode: "usage_limit_reached" };
  }

  const minOrder = Number(promo.min_order_amount ?? 0);
  if (minOrder > 0 && orderSubtotal < minOrder) {
    return {
      valid: false,
      error: `Minimum order of $${minOrder.toFixed(2)} required to use this code.`,
      errorCode: "minimum_not_met",
    };
  }

  if (customerId && promo.max_uses_per_customer !== null) {
    const { count } = await supabase
      .from("promotion_usage")
      .select("id", { count: "exact", head: true })
      .eq("promotion_id", promo.id)
      .eq("customer_id", customerId);

    if ((count ?? 0) >= promo.max_uses_per_customer) {
      return {
        valid: false,
        error: "You've already used this promo code the maximum number of times.",
        errorCode: "customer_limit_reached",
      };
    }
  }

  if (promo.promo_type === "first_visit" && customerId) {
    const { count } = await supabase
      .from("promotion_usage")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("merchant_id", config.merchant_id);

    if ((count ?? 0) > 0) {
      return {
        valid: false,
        error: "This code is for first-time customers only.",
        errorCode: "first_order_only",
      };
    }
  }

  // Compute discount amount
  const discountType = promo.discount_type as "percentage" | "fixed_amount";
  let discountAmount = 0;
  if (discountType === "percentage") {
    discountAmount = orderSubtotal * (Number(promo.discount_value) / 100);
    if (promo.discount_max) discountAmount = Math.min(discountAmount, Number(promo.discount_max));
  } else if (discountType === "fixed_amount") {
    discountAmount = Math.min(Number(promo.discount_value), orderSubtotal);
  }
  discountAmount = Math.round(discountAmount * 100) / 100;

  return {
    valid: true,
    promotionId: promo.id,
    promotionName: promo.name,
    discountType,
    discountValue: Number(promo.discount_value),
    discountAmount,
  };
}

// ---- Delivery Zone Pre-Validation ----

export interface DeliveryZoneCheckResult {
  valid: boolean;
  reason?: string;
  zoneName?: string;
  deliveryFeeCents?: number;
  minOrderCents?: number;
}

/**
 * Check whether a text address falls within the store's delivery zones.
 * Called client-side (debounced) as the customer types their address, so they
 * get immediate feedback before placing the order.
 *
 * Uses the same geocoding + haversine logic as the edge function — single
 * source of truth lives in the edge function; this mirrors it server-side
 * via the Google Maps Geocoding API so we don't expose the key to the browser.
 */
export async function checkDeliveryZone(
  storeConfigId: string,
  address: { street: string; city: string; state: string; zip: string }
): Promise<DeliveryZoneCheckResult> {
  if (!storeConfigId) return { valid: false, reason: "Missing store configuration." };

  const supabase = createServiceRoleClient();

  const { data: config } = await supabase
    .from("online_store_config")
    .select("address, delivery_radius_miles, delivery_fee, min_order, free_delivery_threshold")
    .eq("id", storeConfigId)
    .single();

  if (!config) return { valid: false, reason: "Store not found." };

  const { data: zones } = await supabase
    .from("delivery_zones")
    .select("id, zone_name, zone_type, radius_miles, delivery_fee, min_order, is_active")
    .eq("store_config_id", storeConfigId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  const hasZones = zones && zones.length > 0;
  const storeRadiusMiles = Number(config.delivery_radius_miles ?? 0);
  const hasStoreRadius = storeRadiusMiles > 0;

  // No zone restrictions configured — delivery is open everywhere.
  if (!hasZones && !hasStoreRadius) {
    return {
      valid: true,
      deliveryFeeCents: Math.round((config.delivery_fee ?? 0) * 100),
      minOrderCents: Math.round((config.min_order ?? 0) * 100),
    };
  }

  // Geocode the customer address.
  const addressText = [address.street, address.city, address.state, address.zip]
    .filter(Boolean)
    .join(", ");

  if (!addressText.trim()) {
    return { valid: false, reason: "Please enter a complete delivery address." };
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!googleKey) {
    // No geocoding key — skip pre-validation; the edge function will gate it.
    return { valid: true };
  }

  let customerLat: number | null = null;
  let customerLng: number | null = null;
  try {
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressText)}&key=${googleKey}`
    );
    const geoData = await geoRes.json();
    if (geoData.status === "OK" && geoData.results?.[0]) {
      customerLat = geoData.results[0].geometry.location.lat;
      customerLng = geoData.results[0].geometry.location.lng;
    }
  } catch {
    // Geocoding failed — let edge function handle it.
    return { valid: true };
  }

  if (customerLat === null || customerLng === null) {
    return {
      valid: false,
      reason: "We couldn't locate that address. Please double-check the street, city, and ZIP.",
    };
  }

  const storeAddress = config.address as { lat?: number; lng?: number } | null;
  if (!storeAddress?.lat || !storeAddress?.lng) {
    // Store has no coordinates — skip distance check.
    return { valid: true };
  }

  function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3958.8;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Check named zones first.
  for (const zone of zones ?? []) {
    if (zone.zone_type === "radius" && zone.radius_miles) {
      const dist = haversine(storeAddress.lat, storeAddress.lng, customerLat, customerLng);
      if (dist <= Number(zone.radius_miles)) {
        return {
          valid: true,
          zoneName: zone.zone_name,
          deliveryFeeCents: Math.round((zone.delivery_fee ?? 0) * 100),
          minOrderCents: Math.round((zone.min_order ?? 0) * 100),
        };
      }
    }
  }

  // Check store-level radius fallback.
  if (hasStoreRadius) {
    const dist = haversine(storeAddress.lat, storeAddress.lng, customerLat, customerLng);
    if (dist <= storeRadiusMiles) {
      return {
        valid: true,
        deliveryFeeCents: Math.round((config.delivery_fee ?? 0) * 100),
        minOrderCents: Math.round((config.min_order ?? 0) * 100),
      };
    }
  }

  return {
    valid: false,
    reason: "Sorry, we don't deliver to this address. Try a different address or choose pickup.",
  };
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
      order_items (
        menu_item_id, item_name, quantity, unit_price, subtotal,
        order_item_modifiers ( modifier_item_id, modifier_name, price_modifier, quantity )
      )
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
        menuItemId: i.menu_item_id ?? null,
        name: i.item_name,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price) || 0,
        subtotal: Number(i.subtotal) || 0,
        modifiers: (i.order_item_modifiers ?? []).map((m: any) => ({
          modifierItemId: m.modifier_item_id ?? null,
          name: m.modifier_name,
          price: Number(m.price_modifier) || 0,
          quantity: Number(m.quantity) || 1,
        })),
      })),
    })),
  };
}
