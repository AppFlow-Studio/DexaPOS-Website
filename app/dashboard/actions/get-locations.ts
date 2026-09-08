"use server";

import { grantsAllMerchantLocations } from "@/lib/auth/merchant-location-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LocationsModel } from "@/types/db-modles";
import { GetUserRole } from "@/utils/get-user-role";
import { resolveImpersonationFromCookies } from "@/lib/admin/impersonation";

export interface LocationWithPrimary extends LocationsModel {
  is_primary_location?: boolean;
}

export async function GetUserRoleInMerchant(
  clerk_org_id: string,
  userId: string
) {
  // Under active impersonation, the HQ admin acts as the merchant owner for
  // the impersonated merchant. Every consumer that branches on role
  // (GetLocations is the immediate one; others may follow the same pattern)
  // should see merchant.owner so the dashboard renders the merchant's data
  // instead of the empty non-member fallback.
  const impersonation = await resolveImpersonationFromCookies().catch(() => null);
  if (impersonation && impersonation.clerkOrgId === clerk_org_id) {
    return { role: "merchant.owner" };
  }

  const supabase = createServerSupabaseClient();

  const { data: userRole, error: userRoleError } = await supabase
    .from("members")
    .select("role")
    .eq("organization_id", clerk_org_id)
    .eq("user_id", userId)
    .single();

  if (userRoleError) {
    // console.error('[GetUserRoleInMerchant] Error getting user role:', userRoleError)
    return null;
  }

  return userRole;
}

export async function GetLocations(clerkOrgId: string, user_id: string) {
  if (!clerkOrgId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  // First, get the merchant ID from the clerk_org_id
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("[GetLocations] Error getting merchant:", merchantError);
    return [];
  }

  // Get the user's role in the merchant organization if merchant.owner then get all locations

  const userRole = await GetUserRoleInMerchant(clerkOrgId, user_id);

  // Check for owner or admin roles to grant full access.
  //
  // The rule lives in `lib/auth/merchant-location-access.ts` rather than here,
  // because `user_location_ids()` in SQL has to answer the same question and
  // the two used to disagree — the picker offered locations RLS then refused,
  // and screens showed an empty list instead of an access error.
  const isOwnerOrAdmin = grantsAllMerchantLocations(userRole?.role);

  if (isOwnerOrAdmin) {
    const { data: locations, error: locationsError } = await supabase
      .from("locations")
      .select("*")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false });

    if (locationsError) {
      console.error("[GetLocations] Error getting locations:", locationsError);
      return [];
    }

    // console.log("[GetLocations] Merchant Owner Locations", locations);
    return locations;
  }

  // Then get locations for this merchant

  // Check the locations this user has in the merchant organization
  // `is_active` matters here for the same reason it matters in
  // `user_location_ids()`, which is what RLS and every reservations/orders RPC
  // actually gate on: an inactive membership is a revoked one. Without this
  // filter the picker offered branches the data layer then refused, and the
  // screen showed "0 bookings" rather than "you do not have access" — a false
  // answer dressed as a real one.
  const { data: userLocations, error: userLocationsError } = await supabase
    .from("location_members")
    .select("*")
    .eq("user_id", user_id)
    .eq("merchant_id", merchant.id)
    .eq("is_active", true);

  if (userLocationsError) {
    console.error(
      "[GetLocations] Error getting user locations:",
      userLocationsError
    );
    return [];
  }

  // console.log('[GetLocations] userLocations', userLocations)

  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("merchant_id", merchant.id)
    .in(
      "id",
      userLocations.map((location) => location.location_id)
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GetLocations] Error getting locations:", error);
    return [];
  }

  // Map locations with is_primary_location from location_members
  const locationsWithPrimary: LocationWithPrimary[] = data.map((location) => {
    const locationMember = userLocations.find(
      (lm) => lm.location_id === location.id
    );
    return {
      ...location,
      is_primary_location: locationMember?.is_primary_location ?? false,
    };
  });

  return locationsWithPrimary;
}
