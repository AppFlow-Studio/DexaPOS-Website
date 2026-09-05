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
  reason?: string | null;
  nextOpen?: string | null;
}

export interface QrOrderStatusResult {
  success: boolean;
  hasOrder?: boolean;
  orderId?: string | null;
  orderNumber?: string | null;
  displayNumber?: string | null;
  rawStatus?: string | null;
  stage?: string | null;
  statusLabel?: string | null;
  tableLabel?: string | null;
  estimatedReadyAt?: string | null;
  etaMinutes?: number | null;
  lastUpdatedAt?: string | null;
  sessionExpiresAt?: string | null;
  pollIntervalSeconds?: number | null;
  error?: string;
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
    reason: data.reason ?? null,
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

export async function getQrOrderStatus(
  sessionToken: string
): Promise<QrOrderStatusResult> {
  if (!sessionToken) {
    return { success: false, error: "Session token is required" };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("get_qr_order_status", {
    p_session_token: sessionToken,
  });

  if (error) {
    return {
      success: false,
      error: "Failed to load QR order status",
    };
  }

  if (!data || typeof data !== "object") {
    return {
      success: false,
      error: "Failed to load QR order status",
    };
  }

  return {
    success: data.success === true,
    hasOrder:
      data.has_order != null ? Boolean(data.has_order) : undefined,
    orderId: data.order_id ?? null,
    orderNumber: data.order_number ?? null,
    displayNumber: data.display_number ?? null,
    rawStatus: data.raw_status ?? null,
    stage: data.stage ?? null,
    statusLabel: data.status_label ?? null,
    tableLabel: data.table_label ?? null,
    estimatedReadyAt: data.estimated_ready_at ?? null,
    etaMinutes:
      data.eta_minutes != null ? Number(data.eta_minutes) : null,
    lastUpdatedAt: data.last_updated_at ?? null,
    sessionExpiresAt: data.session_expires_at ?? null,
    pollIntervalSeconds:
      data.poll_interval_seconds != null
        ? Number(data.poll_interval_seconds)
        : null,
    error: data.error ?? undefined,
  };
}

/** Why a marketing code did not resolve. Drives which copy the page shows. */
export type MarketingQrFailureReason =
  | "not_found"
  | "inactive"
  | "store_unavailable"
  | "rate_limited"
  | "unavailable";

export interface ResolvedMarketingQr {
  success: boolean;
  /** The code's internal name. Never shown to guests — useful in logs. */
  name?: string | null;
  reason?: MarketingQrFailureReason;
}

/**
 * Resolve a table-less marketing QR (a flyer, decal or delivery-bag code).
 *
 * Unlike a table code this starts no session and binds no table: it records
 * the scan and the storefront then renders normally. `resolve_marketing_qr`
 * writes the scan event and bumps the counter, so calling this more than once
 * per request would double-count.
 */
export async function resolveMarketingQr(
  slug: string,
  shortCode: string
): Promise<ResolvedMarketingQr> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("resolve_marketing_qr", {
    p_slug: slug,
    p_short_code: shortCode,
  });

  if (error || !data || typeof data !== "object") {
    return { success: false, reason: "unavailable" };
  }

  const payload = data as Record<string, unknown>;

  if (payload.success !== true) {
    const raw = typeof payload.error === "string" ? payload.error : "";
    const known: MarketingQrFailureReason[] = [
      "not_found",
      "inactive",
      "store_unavailable",
      "rate_limited",
    ];

    return {
      success: false,
      reason: known.includes(raw as MarketingQrFailureReason)
        ? (raw as MarketingQrFailureReason)
        : "unavailable",
    };
  }

  return {
    success: true,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}
