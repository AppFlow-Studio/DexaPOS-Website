"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LocationsModel } from "@/types/db-modles";
import { GetUserRole } from "@/utils/get-user-role";

export interface LocationWithPrimary extends LocationsModel {
  is_primary_location?: boolean;
}

export async function GetUserRoleInMerchant(
  clerk_org_id: string,
  userId: string
) {
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

  // Check for owner or admin roles to grant full access
  const isOwnerOrAdmin =
    userRole?.role === "merchant.owner" ||
    userRole?.role === "org:admin" ||
    userRole?.role === "admin";

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

    console.log("[GetLocations] Merchant Owner Locations", locations);
    return locations;
  }

  // Then get locations for this merchant

  // Check the locations this user has in the merchant organization
  const { data: userLocations, error: userLocationsError } = await supabase
    .from("location_members")
    .select("*")
    .eq("user_id", user_id)
    .eq("merchant_id", merchant.id);

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
