"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface SessionData {
  id: string;
  sessionToken: string;
  storeConfigId: string;
  customerId: string | null;
  customerPhone: string | null;
  customerName: string | null;
  customerEmail: string | null;
  isAuthenticated: boolean;
  orderType: "pickup" | "delivery" | null;
  deliveryAddress: any | null;
  deliveryZoneId: string | null;
  cartData: any[];
  loyaltyPointsBalance: number;
  loyaltyPointsToApply: number;
  orderId: string | null;
  requestedTime: string | null;
  expiresAt: string | null;
  floorPlanObjectId: string | null;
  tableLabel: string | null;
  tableQrCodeId: string | null;
}

function mapSession(row: any): SessionData {
  return {
    id: row.id,
    sessionToken: row.session_token,
    storeConfigId: row.store_config_id,
    customerId: row.customer_id,
    customerPhone: row.customer_phone,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    isAuthenticated: row.is_authenticated,
    orderType: row.order_type,
    deliveryAddress: row.delivery_address,
    deliveryZoneId: row.delivery_zone_id,
    cartData: row.cart_data ?? [],
    loyaltyPointsBalance: row.loyalty_points_balance ?? 0,
    loyaltyPointsToApply: row.loyalty_points_to_apply ?? 0,
    orderId: row.order_id,
    requestedTime: row.requested_time,
    expiresAt: row.expires_at,
    floorPlanObjectId: row.floor_plan_object_id ?? null,
    tableLabel: row.table_label ?? null,
    tableQrCodeId: row.table_qr_code_id ?? null,
  };
}

export async function getSession(
  sessionToken: string
): Promise<{ data: SessionData | null; error?: string }> {
  if (!sessionToken) return { data: null, error: "No session token" };

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("online_order_sessions")
    .select("*")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) {
    return { data: null, error: "Session not found or expired" };
  }

  return { data: mapSession(data) };
}

export interface SessionUpdateData {
  orderType?: "pickup" | "delivery";
  deliveryAddress?: any;
  deliveryZoneId?: string | null;
  cartData?: any[];
  loyaltyPointsToApply?: number;
  requestedTime?: string | null;
  customerName?: string;
  customerEmail?: string;
  customerEmailOptIn?: boolean;
  customerSmsOptIn?: boolean;
}

export async function updateSession(
  sessionToken: string,
  updates: SessionUpdateData
): Promise<{ success: boolean; error?: string }> {
  if (!sessionToken) return { success: false, error: "No session token" };

  const supabase = createServiceRoleClient();

  const dbUpdates: Record<string, any> = {};
  if (updates.orderType !== undefined) dbUpdates.order_type = updates.orderType;
  if (updates.deliveryAddress !== undefined)
    dbUpdates.delivery_address = updates.deliveryAddress;
  if (updates.deliveryZoneId !== undefined)
    dbUpdates.delivery_zone_id = updates.deliveryZoneId;
  if (updates.cartData !== undefined) dbUpdates.cart_data = updates.cartData;
  if (updates.loyaltyPointsToApply !== undefined)
    dbUpdates.loyalty_points_to_apply = updates.loyaltyPointsToApply;
  if (updates.requestedTime !== undefined)
    dbUpdates.requested_time = updates.requestedTime;
  if (updates.customerName !== undefined)
    dbUpdates.customer_name = updates.customerName;
  if (updates.customerEmail !== undefined)
    dbUpdates.customer_email = updates.customerEmail;
  if (updates.customerEmailOptIn !== undefined)
    dbUpdates.customer_email_opt_in = updates.customerEmailOptIn;
  if (updates.customerSmsOptIn !== undefined)
    dbUpdates.customer_sms_opt_in = updates.customerSmsOptIn;

  const { error } = await supabase
    .from("online_order_sessions")
    .update(dbUpdates)
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    return { success: false, error: "Failed to update session" };
  }

  return { success: true };
}

export async function initSession(
  storeConfigId: string
): Promise<{ data: { sessionToken: string } | null; error?: string }> {
  if (!storeConfigId) return { data: null, error: "No store config ID" };

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("online_order_sessions")
    .insert({
      store_config_id: storeConfigId,
      is_authenticated: false,
      cart_data: [],
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("session_token")
    .single();

  if (error || !data?.session_token) {
    return { data: null, error: "Failed to create session" };
  }

  return { data: { sessionToken: data.session_token } };
}

export async function clearSession(
  sessionToken: string
): Promise<{ success: boolean }> {
  if (!sessionToken) return { success: false };

  const supabase = createServiceRoleClient();

  await supabase
    .from("online_order_sessions")
    .delete()
    .eq("session_token", sessionToken);

  return { success: true };
}
