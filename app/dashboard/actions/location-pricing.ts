"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LocationVendorPricing } from "@/types/inventory";

// ============================================================================
// GET PRICING FOR VENDOR ITEM
// Returns pricing for all locations served by this vendor for a specific item
// ============================================================================

export async function GetLocationPricingForItem(
  vendorId: string,
  inventoryItemId: string
): Promise<{
  data?: Array<{
    location: { id: string; name: string };
    pricing?: LocationVendorPricing | null;
  }>;
  error?: string;
}> {
  if (!vendorId || !inventoryItemId) {
    return { error: "Vendor and Item IDs are required" };
  }

  const supabase = createServerSupabaseClient();

  // 1. Get all locations served by this vendor
  const { data: links, error: linksError } = await supabase
    .from("location_vendors")
    .select("location_id, location:locations(id, name)")
    .eq("vendor_id", vendorId);

  if (linksError) {
    console.error("Error fetching location links:", linksError);
    return { error: linksError.message };
  }

  if (!links || links.length === 0) {
    return { data: [] };
  }

  // 2. Get existing pricing overrides
  const locationIds = links.map((l) => l.location_id);
  const { data: pricing, error: pricingError } = await supabase
    .from("location_vendor_pricing")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("inventory_item_id", inventoryItemId)
    .in("location_id", locationIds);

  if (pricingError) {
    console.error("Error fetching pricing:", pricingError);
    return { error: pricingError.message };
  }

  // 3. Map locations to pricing
  const pricingMap = new Map(
    (pricing || []).map((p) => [p.location_id, p as LocationVendorPricing])
  );

  const result = links.map((link) => ({
    location: Array.isArray(link.location) ? link.location[0] : link.location,
    pricing: pricingMap.get(link.location_id) || null,
  }));

  return { data: result };
}

// ============================================================================
// UPSERT LOCATION PRICING
// ============================================================================

export async function UpsertLocationPricing(params: {
  vendorId: string;
  locationId: string;
  inventoryItemId: string;
  unitCost: number;
}): Promise<{ data?: LocationVendorPricing; error?: string }> {
  const { vendorId, locationId, inventoryItemId, unitCost } = params;

  if (unitCost < 0) {
    return { error: "Cost cannot be negative" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("location_vendor_pricing")
    .upsert(
      {
        vendor_id: vendorId,
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        unit_cost: unitCost,
        last_updated: new Date().toISOString(),
      },
      {
        onConflict: "location_id, vendor_id, inventory_item_id",
      }
    )
    .select("*")
    .single();

  if (error) {
    console.error("Error upserting pricing:", error);
    return { error: error.message };
  }

  return { data: data as LocationVendorPricing };
}

// ============================================================================
// REMOVE LOCATION PRICING (Revert to default)
// ============================================================================

export async function RemoveLocationPricing(
  pricingId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("location_vendor_pricing")
    .delete()
    .eq("id", pricingId);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
