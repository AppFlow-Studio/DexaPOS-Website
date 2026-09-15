"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { LogAuditEvent } from "../actions/audit-logs";

/**
 * Table-less marketing QR codes — the code on a flyer, door decal or delivery
 * bag. Unlike a table code these are not gated behind `qr_table_ordering`: a
 * flyer is a storefront feature, and gating it behind a multi-location dine-in
 * entitlement would lock out exactly the single-location merchants who print
 * flyers.
 *
 * Authorisation follows the pattern already established by
 * `getQrTableManagerSnapshot`: verify location access with the *caller's* JWT
 * via `authorize_location_access`, then read and write the rows with the
 * server-only client. The dashboard JWT can lack the legacy location claims
 * that the RLS policies and `user_location_ids()` depend on, so trusting them
 * alone would reject legitimate merchants.
 */

export interface MarketingQrRow {
  id: string;
  name: string;
  shortCode: string;
  isActive: boolean;
  scanCount: number;
  lastScannedAt: string | null;
  createdAt: string;
}

export interface MarketingQrListResult {
  success: boolean;
  rows: MarketingQrRow[];
  error?: string;
}

export interface MarketingQrMutationResult {
  success: boolean;
  row?: MarketingQrRow;
  error?: string;
}

const CODE_COLUMNS =
  "id, name, short_code, is_active, scan_count, last_scanned_at, created_at";

interface MarketingQrDbRow {
  id: string;
  name: string;
  short_code: string;
  is_active: boolean;
  scan_count: number | string | null;
  last_scanned_at: string | null;
  created_at: string;
}

function mapRow(row: MarketingQrDbRow): MarketingQrRow {
  return {
    id: row.id,
    name: row.name,
    shortCode: row.short_code,
    isActive: row.is_active,
    // bigint arrives as a string over PostgREST once it is large enough.
    scanCount: Number(row.scan_count ?? 0),
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
  };
}

/** Verify the caller may act on this location, using their own JWT. */
async function authorizeLocation(locationId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("authorize_location_access", {
    p_location_id: locationId,
  });

  return error ? "You do not have access to this location." : null;
}

export async function listMarketingQrCodes(
  locationId: string
): Promise<MarketingQrListResult> {
  if (!locationId) {
    return { success: false, rows: [], error: "Missing location" };
  }

  const denied = await authorizeLocation(locationId);
  if (denied) return { success: false, rows: [], error: denied };

  const { data, error } = await createServiceRoleClient()
    .from("marketing_qr_codes")
    .select(CODE_COLUMNS)
    .eq("location_id", locationId)
    // Active first, then newest. A merchant looking at this screen is almost
    // always looking for a code they can still print.
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, rows: [], error: "Could not load marketing QR codes." };
  }

  return { success: true, rows: (data ?? []).map(mapRow) };
}

export async function createMarketingQrCode(
  locationId: string,
  name: string
): Promise<MarketingQrMutationResult> {
  const trimmed = name.trim();

  if (!locationId) return { success: false, error: "Missing location" };
  if (!trimmed) return { success: false, error: "Give this code a name." };

  const denied = await authorizeLocation(locationId);
  if (denied) return { success: false, error: denied };

  const service = createServiceRoleClient();

  const { data: location, error: locationError } = await service
    .from("locations")
    .select("id, name, merchant_id")
    .eq("id", locationId)
    .single();

  if (locationError || !location) {
    return { success: false, error: "Location not found." };
  }

  // The short code is minted by the database so its alphabet and length live
  // in exactly one place — the same function the CHECK constraint validates
  // against. Retry rather than pre-check: two concurrent creates both pass a
  // pre-check and one still loses the unique index.
  let created: MarketingQrDbRow | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    const { data: shortCode, error: codeError } = await service.rpc(
      "marketing_qr_generate_short_code"
    );

    if (codeError || typeof shortCode !== "string") {
      lastError = "Could not generate a code.";
      break;
    }

    const { data, error } = await service
      .from("marketing_qr_codes")
      .insert({
        merchant_id: location.merchant_id,
        location_id: locationId,
        name: trimmed,
        short_code: shortCode,
      })
      .select(CODE_COLUMNS)
      .single();

    if (!error) {
      created = data as MarketingQrDbRow;
      break;
    }

    // 23505 is the unique index doing its job; anything else is real.
    if (error.code !== "23505") {
      lastError = "Could not create the code.";
      break;
    }
  }

  if (!created) {
    return {
      success: false,
      error: lastError ?? "Could not allocate a unique code. Please try again.",
    };
  }

  const row = mapRow(created);

  await LogAuditEvent({
    merchantId: location.merchant_id,
    locationId,
    action: "created_marketing_qr_code",
    actionCategory: "settings",
    severity: "info",
    resourceType: "marketing_qr_code",
    resourceId: row.id,
    resourceName: row.name,
    changes: { after: { name: row.name, short_code: row.shortCode } },
  });

  return { success: true, row };
}

/**
 * Deactivate a code. There is deliberately no delete: a printed flyer outlives
 * its row, and the row is what lets `/m/{code}` say "no longer active" instead
 * of 404-ing someone standing in the shop holding it.
 */
export async function deactivateMarketingQrCode(
  locationId: string,
  id: string
): Promise<MarketingQrMutationResult> {
  if (!locationId || !id) return { success: false, error: "Missing code" };

  const denied = await authorizeLocation(locationId);
  if (denied) return { success: false, error: denied };

  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("marketing_qr_codes")
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    // Scope the update by location as well as id, so a caller authorised for
    // one location cannot deactivate another location's code by guessing.
    .eq("id", id)
    .eq("location_id", locationId)
    .select(CODE_COLUMNS)
    .single();

  if (error || !data) {
    return { success: false, error: "Could not deactivate this code." };
  }

  const row = mapRow(data as MarketingQrDbRow);

  await LogAuditEvent({
    locationId,
    action: "deactivated_marketing_qr_code",
    actionCategory: "settings",
    severity: "warning",
    resourceType: "marketing_qr_code",
    resourceId: row.id,
    resourceName: row.name,
    changes: { before: { is_active: true }, after: { is_active: false } },
  });

  return { success: true, row };
}

export interface MarketingQrStoreContext {
  storeName: string | null;
  slug: string | null;
  customDomain: string | null;
  branding: {
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    backgroundColor: string | null;
  } | null;
}

/**
 * Just the store identity and branding a marketing QR needs to render.
 *
 * `getQrTableManagerSnapshot` returns the same fields, but it also loads every
 * floor-plan table for the location — 233 rows at one real branch — which is a
 * lot to fetch for four colours and a slug.
 */
export async function getMarketingQrStoreContext(
  locationId: string
): Promise<MarketingQrStoreContext> {
  const empty: MarketingQrStoreContext = {
    storeName: null,
    slug: null,
    customDomain: null,
    branding: null,
  };

  if (!locationId) return empty;

  const denied = await authorizeLocation(locationId);
  if (denied) return empty;

  const { data } = await createServiceRoleClient()
    .from("online_store_config")
    .select(
      "store_name, slug, custom_domain, logo_url, primary_color, secondary_color, background_color"
    )
    .eq("location_id", locationId)
    .maybeSingle();

  if (!data) return empty;

  return {
    storeName: data.store_name ?? null,
    slug: data.slug ?? null,
    customDomain: data.custom_domain ?? null,
    branding: {
      logoUrl: data.logo_url ?? null,
      primaryColor: data.primary_color ?? null,
      secondaryColor: data.secondary_color ?? null,
      backgroundColor: data.background_color ?? null,
    },
  };
}
