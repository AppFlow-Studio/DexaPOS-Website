"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface ResolvedQrStorefrontSession {
  success: boolean;
  sessionToken?: string;
  sessionExpiresAt?: string | null;
  tableLabel?: string | null;
  floorPlanObjectId?: string | null;
  tableQrCodeId?: string | null;
  store?: {
    storeConfigId: string;
    merchantId: string;
    locationId: string;
    storeName: string;
    slug: string;
    customDomain: string | null;
    description: string | null;
    logoUrl: string | null;
    heroImageUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    estimatedPrepMinutes: number | null;
    qrFulfillmentMode: string | null;
    qrGeofenceEnabled: boolean | null;
    qrServiceFeePct: number | null;
  };
  error?: string;
  nextOpen?: string | null;
}

function mapResolvedQrPayload(data: any): ResolvedQrStorefrontSession {
  return {
    success: data.success === true,
    sessionToken: data.session_token ?? undefined,
    sessionExpiresAt: data.session_expires_at ?? null,
    tableLabel: data.table_label ?? null,
    floorPlanObjectId: null,
    tableQrCodeId: null,
    error: data.error ?? undefined,
    nextOpen: data.next_open ?? null,
    store: data.store
      ? {
          storeConfigId: data.store.store_config_id,
          merchantId: data.store.merchant_id,
          locationId: data.store.location_id,
          storeName: data.store.store_name,
          slug: data.store.slug,
          customDomain: data.store.custom_domain ?? null,
          description: data.store.description ?? null,
          logoUrl: data.store.logo_url ?? null,
          heroImageUrl: data.store.hero_image_url ?? null,
          primaryColor: data.store.primary_color ?? null,
          secondaryColor: data.store.secondary_color ?? null,
          estimatedPrepMinutes:
            data.store.estimated_prep_minutes != null
              ? Number(data.store.estimated_prep_minutes)
              : null,
          qrFulfillmentMode: data.store.qr_fulfillment_mode ?? null,
          qrGeofenceEnabled:
            data.store.qr_geofence_enabled != null
              ? Boolean(data.store.qr_geofence_enabled)
              : null,
          qrServiceFeePct:
            data.store.qr_service_fee_pct != null
              ? Number(data.store.qr_service_fee_pct)
              : null,
        }
      : undefined,
  };
}

export async function resolveQrStorefrontSession(
  slug: string,
  tableToken: string
): Promise<ResolvedQrStorefrontSession> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("resolve_table_qr", {
    p_slug: slug,
    p_table_token: tableToken,
  });

  if (error) {
    return {
      success: false,
      error: "QR ordering is unavailable right now",
    };
  }

  if (!data || typeof data !== "object") {
    return {
      success: false,
      error: "QR ordering is unavailable right now",
    };
  }

  const mapped = mapResolvedQrPayload(data);

  if (!mapped.success || !mapped.sessionToken) {
    return mapped;
  }

  const { data: sessionRow } = await supabase
    .from("online_order_sessions")
    .select("floor_plan_object_id, table_qr_code_id")
    .eq("session_token", mapped.sessionToken)
    .single();

  return {
    ...mapped,
    floorPlanObjectId: sessionRow?.floor_plan_object_id ?? null,
    tableQrCodeId: sessionRow?.table_qr_code_id ?? null,
  };
}

export async function raiseQrGuestAlert(
  sessionToken: string,
  message?: string | null
): Promise<{
  success: boolean;
  alertId?: string;
  tableLabel?: string | null;
  error?: string;
  reason?: string | null;
}> {
  if (!sessionToken) {
    return { success: false, error: "Session token is required" };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("raise_qr_guest_alert", {
    p_session_token: sessionToken,
    p_alert_type: "call_server",
    p_message: message?.trim() || null,
  });

  if (error) {
    return {
      success: false,
      error: "Failed to notify the restaurant",
    };
  }

  if (!data || typeof data !== "object") {
    return {
      success: false,
      error: "Failed to notify the restaurant",
    };
  }

  return {
    success: data.success === true,
    alertId: data.alert_id ?? undefined,
    tableLabel: data.table_label ?? null,
    error: data.error ?? undefined,
    reason: data.reason ?? null,
  };
}
