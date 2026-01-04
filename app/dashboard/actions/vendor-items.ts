"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { VendorItemWithDetails, InventoryItem } from "@/types/inventory";

// ============================================================================
// GET VENDOR ITEMS
// ============================================================================

export async function GetVendorItems(vendorId: string): Promise<{
  data?: VendorItemWithDetails[];
  error?: string;
}> {
  if (!vendorId) {
    return { error: "Vendor ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Get vendor items
  const { data: vendorItems, error: itemsError } = await supabase
    .from("vendor_items")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });

  if (itemsError) {
    console.error("Error fetching vendor items:", itemsError);
    return { error: itemsError.message };
  }

  if (!vendorItems || vendorItems.length === 0) {
    return { data: [] };
  }

  // Get inventory item details
  const inventoryItemIds = vendorItems.map((vi) => vi.inventory_item_id);
  const { data: inventoryItems, error: invError } = await supabase
    .from("inventory_items")
    .select("id, name, sku, category, unit_type")
    .in("id", inventoryItemIds);

  if (invError) {
    console.error("Error fetching inventory items:", invError);
    return { error: invError.message };
  }

  // Create map for quick lookup
  const inventoryMap = new Map(
    (inventoryItems || []).map((item) => [item.id, item])
  );

  // Merge data
  const result: VendorItemWithDetails[] = vendorItems.map((vi) => ({
    ...vi,
    inventory_item: inventoryMap.get(vi.inventory_item_id) || null,
  }));

  return { data: result };
}

// ============================================================================
// ADD VENDOR ITEM
// ============================================================================

export async function AddVendorItem(params: {
  vendorId: string;
  inventoryItemId: string;
  vendorSku?: string;
  defaultCost: number;
  packSize?: string;
  isPreferred?: boolean;
}): Promise<{ data?: VendorItemWithDetails; error?: string }> {
  const {
    vendorId,
    inventoryItemId,
    vendorSku,
    defaultCost,
    packSize,
    isPreferred,
  } = params;

  if (!vendorId || !inventoryItemId) {
    return { error: "Vendor ID and Inventory Item ID are required" };
  }

  if (defaultCost < 0) {
    return { error: "Cost must be non-negative" };
  }

  const supabase = createServerSupabaseClient();

  // Check if already exists
  const { data: existing } = await supabase
    .from("vendor_items")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("inventory_item_id", inventoryItemId)
    .single();

  if (existing) {
    return { error: "This item is already in the vendor's catalog" };
  }

  // Insert
  const { data: vendorItem, error } = await supabase
    .from("vendor_items")
    .insert({
      vendor_id: vendorId,
      inventory_item_id: inventoryItemId,
      vendor_sku: vendorSku || null,
      default_cost: defaultCost,
      pack_size: packSize || null,
      is_preferred: isPreferred || false,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error adding vendor item:", error);
    return { error: error.message };
  }

  // Fetch inventory item details
  const { data: inventoryItem } = await supabase
    .from("inventory_items")
    .select("id, name, sku, category, unit_type")
    .eq("id", inventoryItemId)
    .single();

  return {
    data: {
      ...vendorItem,
      inventory_item: inventoryItem || null,
    },
  };
}

// ============================================================================
// UPDATE VENDOR ITEM
// ============================================================================

export async function UpdateVendorItem(params: {
  id: string;
  vendorSku?: string;
  defaultCost?: number;
  packSize?: string;
  isPreferred?: boolean;
}): Promise<{ data?: VendorItemWithDetails; error?: string }> {
  const { id, vendorSku, defaultCost, packSize, isPreferred } = params;

  if (!id) {
    return { error: "Vendor Item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (vendorSku !== undefined) updateData.vendor_sku = vendorSku;
  if (defaultCost !== undefined) updateData.default_cost = defaultCost;
  if (packSize !== undefined) updateData.pack_size = packSize;
  if (isPreferred !== undefined) updateData.is_preferred = isPreferred;

  const { data: vendorItem, error } = await supabase
    .from("vendor_items")
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("Error updating vendor item:", error);
    return { error: error.message };
  }

  // Fetch inventory item details
  const { data: inventoryItem } = await supabase
    .from("inventory_items")
    .select("id, name, sku, category, unit_type")
    .eq("id", vendorItem.inventory_item_id)
    .single();

  return {
    data: {
      ...vendorItem,
      inventory_item: inventoryItem || null,
    },
  };
}

// ============================================================================
// REMOVE VENDOR ITEM
// ============================================================================

export async function RemoveVendorItem(id: string): Promise<{
  success?: boolean;
  error?: string;
}> {
  if (!id) {
    return { error: "Vendor Item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("vendor_items").delete().eq("id", id);

  if (error) {
    console.error("Error removing vendor item:", error);
    return { error: error.message };
  }

  return { success: true };
}

// ============================================================================
// GET AVAILABLE INVENTORY ITEMS FOR VENDOR
// Returns items not yet in this vendor's catalog
// ============================================================================

export async function GetAvailableItemsForVendor(
  clerkOrgId: string,
  vendorId: string
): Promise<{
  data?: Array<{
    id: string;
    name: string;
    sku: string | null;
    category: string | null;
    unit_type: string;
    cost_per_unit: number;
  }>;
  error?: string;
}> {
  if (!clerkOrgId || !vendorId) {
    return { error: "Organization ID and Vendor ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // Get merchant
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    return { error: "Merchant not found" };
  }

  // Get existing vendor items
  const { data: existingItems } = await supabase
    .from("vendor_items")
    .select("inventory_item_id")
    .eq("vendor_id", vendorId);

  const existingIds = (existingItems || []).map((e) => e.inventory_item_id);

  // Get inventory items not in vendor catalog
  let query = supabase
    .from("inventory_items")
    .select("id, name, sku, category, unit_type, cost_per_unit")
    .eq("merchant_id", merchant.id)
    .order("name");

  // Exclude already added items
  if (existingIds.length > 0) {
    query = query.not("id", "in", `(${existingIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching available items:", error);
    return { error: error.message };
  }

  return { data: data || [] };
}

// ============================================================================
// GET VENDOR DETAILS (Enhanced with Phase 2 stats)
// ============================================================================

export async function GetVendorDetails(vendorId: string): Promise<{
  data?: {
    vendor: Record<string, unknown>;
    items_count: number;
    locations_count: number;
  };
  error?: string;
}> {
  if (!vendorId) {
    return { error: "Vendor ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Get vendor
  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", vendorId)
    .single();

  if (vendorError || !vendor) {
    return { error: "Vendor not found" };
  }

  // Get items count
  const { count: itemsCount } = await supabase
    .from("vendor_items")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId);

  // Get locations count
  const { count: locationsCount } = await supabase
    .from("location_vendors")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId);

  return {
    data: {
      vendor,
      items_count: itemsCount || 0,
      locations_count: locationsCount || 0,
    },
  };
}
