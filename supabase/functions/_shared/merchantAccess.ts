/**
 * Staff/station caller auth for edge functions invoked by the POS / kiosk:
 * verify the Clerk session token, then check the user is a member of the
 * merchant that owns a location. Same membership rule as `cdn-upload`
 * (merchants.clerk_org_id → members.organization_id), with the Dexa HQ bypass
 * reported back so callers can log it.
 */
import { verifyToken } from "npm:@clerk/backend";
import type { SupabaseClient } from "npm:@supabase/supabase-js";

export async function verifyClerkCaller(
  token: string,
): Promise<{ ok: true; userId: string } | { ok: false }> {
  const jwtKey = Deno.env.get("CLERK_JWT_KEY");
  const secretKey = Deno.env.get("CLERK_SECRET_KEY");
  try {
    // A PEM jwtKey verifies without a network round-trip; fall back to the
    // secret key (JWKS fetch) when it isn't configured.
    const verified = await verifyToken(
      token,
      jwtKey ? { jwtKey } : { secretKey: secretKey! },
    );
    return verified.sub ? { ok: true, userId: verified.sub } : { ok: false };
  } catch (error) {
    console.error("[merchantAccess] Clerk token verification failed", error);
    return { ok: false };
  }
}

async function isDexaHqAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data: memberRows, error } = await admin
    .from("members")
    .select("role")
    .eq("user_id", userId);
  if (error || !memberRows?.length) return false;
  const roleCodes = Array.from(
    new Set(
      memberRows
        .map((row: { role: unknown }) => row.role)
        .filter((v: unknown): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  if (roleCodes.length === 0) return false;
  const { data: roles, error: rolesError } = await admin
    .from("roles")
    .select("code")
    .in("code", roleCodes)
    .eq("organization_type", "hq");
  return !rolesError && Boolean(roles?.length);
}

export type LocationAccess =
  | { ok: true; merchantId: string; viaHq: boolean }
  | { ok: false; status: 403 | 404 };

/** The caller may act for `locationId` iff they belong to its merchant (or HQ). */
export async function verifyLocationAccess(
  admin: SupabaseClient,
  userId: string,
  locationId: string,
): Promise<LocationAccess> {
  const { data: location, error } = await admin
    .from("locations")
    .select("id, merchant_id")
    .eq("id", locationId)
    .maybeSingle();
  if (error || !location?.merchant_id) return { ok: false, status: 404 };
  const merchantId = location.merchant_id as string;

  const { data: merchant } = await admin
    .from("merchants")
    .select("clerk_org_id")
    .eq("id", merchantId)
    .maybeSingle();
  if (merchant?.clerk_org_id) {
    const { data: member } = await admin
      .from("members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("organization_id", merchant.clerk_org_id)
      .limit(1)
      .maybeSingle();
    if (member) return { ok: true, merchantId, viaHq: false };
  }
  if (await isDexaHqAdmin(admin, userId)) {
    return { ok: true, merchantId, viaHq: true };
  }
  return { ok: false, status: 403 };
}
