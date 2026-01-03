"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LocationVendorWithDetails } from "@/types/inventory";

// ============================================================================
// GET LOCATIONS FOR VENDOR
// ============================================================================

export async function GetLocationsForVendor(vendorId: string): Promise<{
  data?: LocationVendorWithDetails[];
  error?: string;
}> {
  if (!vendorId) {
    return { error: "Vendor ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Get location links
  const { data: links, error: linksError } = await supabase
    .from("location_vendors")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });

  if (linksError) {
    console.error("Error fetching location links:", linksError);
    return { error: linksError.message };
  }

  if (!links || links.length === 0) {
    return { data: [] };
  }

  // Get location details
  const locationIds = links.map((l) => l.location_id);
  const { data: locations, error: locError } = await supabase
    .from("locations")
    .select("id, name")
    .in("id", locationIds);

  if (locError) {
    console.error("Error fetching locations:", locError);
    return { error: locError.message };
  }

  // Create map
  const locationMap = new Map((locations || []).map((l) => [l.id, l]));

  // Merge
  const result: LocationVendorWithDetails[] = links.map((link) => ({
    ...link,
    location: locationMap.get(link.location_id) || null,
  }));

  return { data: result };
}

// ============================================================================
// GET AVAILABLE LOCATIONS TO LINK
// Returns locations that are NOT yet linked to this vendor
// ============================================================================

export async function GetAvailableLocationsForVendor(
  clerkOrgId: string,
  vendorId: string
): Promise<{
  data?: Array<{ id: string; name: string }>;
  error?: string;
}> {
  if (!clerkOrgId || !vendorId) {
    return { error: "Org ID and Vendor ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // Get merchant
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!merchant) return { error: "Merchant not found" };

  // Get existing links
  const { data: links } = await supabase
    .from("location_vendors")
    .select("location_id")
    .eq("vendor_id", vendorId);

  const linkedIds = (links || []).map((l) => l.location_id);

  // Get available locations
  let query = supabase
    .from("locations")
    .select("id, name")
    .eq("merchant_id", merchant.id)
    .eq("is_active", true)
    .order("name");

  // Exclude linked
  if (linkedIds.length > 0) {
    query = query.not("id", "in", `(${linkedIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    return { error: error.message };
  }

  return { data: data || [] };
}

// ============================================================================
// LINK VENDOR TO LOCATION
// ============================================================================

export async function LinkVendorToLocation(params: {
  vendorId: string;
  locationId: string;
  accountNumber?: string;
  notes?: string;
  isPreferred?: boolean;
}): Promise<{ data?: LocationVendorWithDetails; error?: string }> {
  const { vendorId, locationId, accountNumber, notes, isPreferred } = params;

  if (!vendorId || !locationId) {
    return { error: "Vendor and Location are required" };
  }

  const supabase = createServerSupabaseClient();

  // Check existing
  const { data: existing } = await supabase
    .from("location_vendors")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("location_id", locationId)
    .single();

  if (existing) {
    return { error: "This vendor is already linked to this location" };
  }

  // Insert
  const { data: link, error } = await supabase
    .from("location_vendors")
    .insert({
      vendor_id: vendorId,
      location_id: locationId,
      account_number: accountNumber || null,
      notes: notes || null,
      is_preferred: isPreferred || false,
    })
    .select("*")
    .single();

  if (error) {
    return { error: error.message };
  }

  // Get location details
  const { data: location } = await supabase
    .from("locations")
    .select("id, name")
    .eq("id", locationId)
    .single();

  return {
    data: {
      ...link,
      location: location || null,
    },
  };
}

// ============================================================================
// REMOVE LINK
// ============================================================================

export async function RemoveLocationLink(linkId: string): Promise<{
  success?: boolean;
  error?: string;
}> {
  if (!linkId) return { error: "Link ID required" };

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("location_vendors")
    .delete()
    .eq("id", linkId);

  if (error) return { error: error.message };

  return { success: true };
}
