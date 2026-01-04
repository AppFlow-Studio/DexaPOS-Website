"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// ============================================================================
// TYPES
// ============================================================================

export interface LocationStockRecord {
  id: string;
  location_id: string;
  inventory_item_id: string;
  stock_quantity: number;
  reorder_threshold: number | null;
  created_at: string;
  updated_at: string;
}

export interface AggregateStockInfo {
  total_stock: number;
  location_count: number;
  low_stock_count: number;
  out_of_stock_count: number;
}

export interface LocationInventoryOverride {
  id: string;
  location_id: string;
  inventory_item_id: string;
  custom_cost: number | null;
  custom_reorder_threshold: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// GET LOCATION STOCK
// ============================================================================

/**
 * Get stock quantity for a specific item at a specific location
 */
export async function GetLocationStock(
  locationId: string,
  inventoryItemId: string
): Promise<{ data?: LocationStockRecord; error?: string }> {
  if (!locationId || !inventoryItemId) {
    return { error: "Location ID and Item ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("location_inventory_stock")
    .select("*")
    .eq("location_id", locationId)
    .eq("inventory_item_id", inventoryItemId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found (acceptable)
    console.error("Error getting location stock:", error);
    return { error: error.message };
  }

  return { data: data || undefined };
}

/**
 * Get stock for multiple items at a specific location
 */
export async function GetLocationStockBatch(
  locationId: string,
  inventoryItemIds: string[]
): Promise<{ data?: Record<string, LocationStockRecord>; error?: string }> {
  if (!locationId || !inventoryItemIds.length) {
    return { data: {} };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("location_inventory_stock")
    .select("*")
    .eq("location_id", locationId)
    .in("inventory_item_id", inventoryItemIds);

  if (error) {
    console.error("Error getting location stock batch:", error);
    return { error: error.message };
  }

  // Convert to map for easy lookup
  const stockMap: Record<string, LocationStockRecord> = {};
  for (const record of data || []) {
    stockMap[record.inventory_item_id] = record;
  }

  return { data: stockMap };
}

// ============================================================================
// GET AGGREGATE STOCK (FOR GLOBAL VIEW)
// ============================================================================

/**
 * Get aggregate stock info across all locations using RPC
 */
export async function GetAggregateStock(
  inventoryItemId: string
): Promise<{ data?: AggregateStockInfo; error?: string }> {
  if (!inventoryItemId) {
    return { error: "Item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_aggregate_stock", {
    p_inventory_item_id: inventoryItemId,
  });

  if (error) {
    console.error("Error getting aggregate stock:", error);
    return { error: error.message };
  }

  return { data: data as AggregateStockInfo };
}

/**
 * Get aggregate stock for multiple items (batch)
 */
export async function GetAggregateStockBatch(
  inventoryItemIds: string[]
): Promise<{ data?: Record<string, AggregateStockInfo>; error?: string }> {
  if (!inventoryItemIds.length) {
    return { data: {} };
  }

  const supabase = createServerSupabaseClient();

  // Call RPC for each item (could be optimized with a batch RPC later)
  const results: Record<string, AggregateStockInfo> = {};

  for (const itemId of inventoryItemIds) {
    const { data, error } = await supabase.rpc("get_aggregate_stock", {
      p_inventory_item_id: itemId,
    });

    if (!error && data) {
      results[itemId] = data as AggregateStockInfo;
    }
  }

  return { data: results };
}

// ============================================================================
// SET / ADJUST STOCK
// ============================================================================

/**
 * Set stock quantity (absolute value) using RPC
 */
export async function SetLocationStock(
  locationId: string,
  inventoryItemId: string,
  quantity: number
): Promise<{ success?: boolean; error?: string }> {
  if (!locationId || !inventoryItemId) {
    return { error: "Location ID and Item ID are required" };
  }

  if (quantity < 0) {
    return { error: "Stock quantity cannot be negative" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase.rpc("set_location_stock", {
    p_location_id: locationId,
    p_inventory_item_id: inventoryItemId,
    p_quantity: quantity,
  });

  if (error) {
    console.error("Error setting location stock:", error);
    return { error: error.message };
  }

  return { success: true };
}

/**
 * Set stock quantity and/or reorder threshold for a location
 * This updates the location_inventory_stock table directly
 */
export async function SetLocationStockWithThreshold(
  locationId: string,
  inventoryItemId: string,
  quantity?: number,
  reorderThreshold?: number | null
): Promise<{ success?: boolean; error?: string }> {
  if (!locationId || !inventoryItemId) {
    return { error: "Location ID and Item ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // Build update object
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (quantity !== undefined) {
    if (quantity < 0) {
      return { error: "Stock quantity cannot be negative" };
    }
    updateData.stock_quantity = quantity;
  }

  if (reorderThreshold !== undefined) {
    updateData.reorder_threshold = reorderThreshold;
  }

  // Upsert to location_inventory_stock
  const { error } = await supabase.from("location_inventory_stock").upsert(
    {
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      ...updateData,
    },
    { onConflict: "location_id,inventory_item_id" }
  );

  if (error) {
    console.error("Error setting location stock with threshold:", error);
    return { error: error.message };
  }

  return { success: true };
}

/**
 * Increment stock (e.g., for receiving deliveries)
 */
export async function IncrementLocationStock(
  locationId: string,
  inventoryItemId: string,
  quantity: number
): Promise<{ success?: boolean; error?: string }> {
  if (!locationId || !inventoryItemId) {
    return { error: "Location ID and Item ID are required" };
  }

  if (quantity <= 0) {
    return { error: "Increment quantity must be positive" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase.rpc("increment_location_stock", {
    p_location_id: locationId,
    p_inventory_item_id: inventoryItemId,
    p_quantity: quantity,
  });

  if (error) {
    console.error("Error incrementing location stock:", error);
    return { error: error.message };
  }

  return { success: true };
}

/**
 * Decrement stock (e.g., for sales)
 */
export async function DecrementLocationStock(
  locationId: string,
  inventoryItemId: string,
  quantity: number
): Promise<{ success?: boolean; error?: string }> {
  if (!locationId || !inventoryItemId) {
    return { error: "Location ID and Item ID are required" };
  }

  if (quantity <= 0) {
    return { error: "Decrement quantity must be positive" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase.rpc("decrement_location_stock", {
    p_location_id: locationId,
    p_inventory_item_id: inventoryItemId,
    p_quantity: quantity,
  });

  if (error) {
    console.error("Error decrementing location stock:", error);
    return { error: error.message };
  }

  return { success: true };
}

// ============================================================================
// LOCATION INVENTORY OVERRIDES (COST / THRESHOLD)
// ============================================================================

/**
 * Get override for a specific item at a location
 */
export async function GetLocationInventoryOverride(
  locationId: string,
  inventoryItemId: string
): Promise<{ data?: LocationInventoryOverride; error?: string }> {
  if (!locationId || !inventoryItemId) {
    return { error: "Location ID and Item ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("location_inventory_overrides")
    .select("*")
    .eq("location_id", locationId)
    .eq("inventory_item_id", inventoryItemId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error getting location override:", error);
    return { error: error.message };
  }

  return { data: data || undefined };
}

/**
 * Set or update location override for cost/threshold
 */
export async function UpsertLocationInventoryOverride(params: {
  locationId: string;
  inventoryItemId: string;
  customCost?: number | null;
  customReorderThreshold?: number | null;
  notes?: string | null;
}): Promise<{ data?: { id: string }; error?: string }> {
  const {
    locationId,
    inventoryItemId,
    customCost,
    customReorderThreshold,
    notes,
  } = params;

  if (!locationId || !inventoryItemId) {
    return { error: "Location ID and Item ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc(
    "upsert_location_inventory_override",
    {
      p_location_id: locationId,
      p_inventory_item_id: inventoryItemId,
      p_custom_cost: customCost ?? null,
      p_custom_reorder_threshold: customReorderThreshold ?? null,
      p_notes: notes ?? null,
    }
  );

  if (error) {
    console.error("Error upserting location override:", error);
    return { error: error.message };
  }

  return { data: data as { id: string } };
}

/**
 * Remove location override (revert to global values)
 */
export async function RemoveLocationInventoryOverride(
  locationId: string,
  inventoryItemId: string
): Promise<{ success?: boolean; error?: string }> {
  if (!locationId || !inventoryItemId) {
    return { error: "Location ID and Item ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("location_inventory_overrides")
    .delete()
    .eq("location_id", locationId)
    .eq("inventory_item_id", inventoryItemId);

  if (error) {
    console.error("Error removing location override:", error);
    return { error: error.message };
  }

  return { success: true };
}

// ============================================================================
// INITIALIZE STOCK FOR LOCATION
// ============================================================================

/**
 * Initialize stock entries for a location (copies defaults from global items)
 */
export async function InitializeLocationStock(
  locationId: string
): Promise<{ count?: number; error?: string }> {
  if (!locationId) {
    return { error: "Location ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("initialize_location_stock", {
    p_location_id: locationId,
  });

  if (error) {
    console.error("Error initializing location stock:", error);
    return { error: error.message };
  }

  return { count: data as number };
}

// ============================================================================
// LOCATION STOCK STATS (FOR DASHBOARD CARDS)
// ============================================================================

/**
 * Get inventory stats for a specific location
 */
export async function GetLocationInventoryStats(locationId: string): Promise<{
  data?: {
    total_items: number;
    low_stock_items: number;
    out_of_stock_items: number;
    total_value: number;
  };
  error?: string;
}> {
  if (!locationId) {
    return { error: "Location ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Get location stock with joined item data
  const { data: stockData, error: stockError } = await supabase
    .from("location_inventory_stock")
    .select(
      `
      stock_quantity,
      reorder_threshold,
      inventory_item:inventory_items(
        id,
        cost_per_unit,
        reorder_threshold
      )
    `
    )
    .eq("location_id", locationId);

  if (stockError) {
    console.error("Error getting location inventory stats:", stockError);
    return { error: stockError.message };
  }

  // Get location overrides for cost
  const itemIds = (stockData || [])
    .map((s) => (s.inventory_item as any)?.id)
    .filter(Boolean);

  const { data: overrides } = await supabase
    .from("location_inventory_overrides")
    .select("inventory_item_id, custom_cost")
    .eq("location_id", locationId)
    .in("inventory_item_id", itemIds);

  const overrideMap = new Map(
    (overrides || []).map((o) => [o.inventory_item_id, o.custom_cost])
  );

  // Calculate stats
  let total_items = 0;
  let low_stock_items = 0;
  let out_of_stock_items = 0;
  let total_value = 0;

  for (const stock of stockData || []) {
    const item = stock.inventory_item as any;
    if (!item) continue;

    total_items++;

    const effectiveCost = overrideMap.get(item.id) ?? item.cost_per_unit ?? 0;
    const stockQty = stock.stock_quantity ?? 0;
    const threshold = stock.reorder_threshold ?? item.reorder_threshold ?? 0;

    total_value += stockQty * effectiveCost;

    if (stockQty <= 0) {
      out_of_stock_items++;
    } else if (stockQty <= threshold) {
      low_stock_items++;
    }
  }

  return {
    data: {
      total_items,
      low_stock_items,
      out_of_stock_items,
      total_value,
    },
  };
}

/**
 * Get global inventory stats (aggregate across all locations)
 */
export async function GetGlobalInventoryStats(clerkOrgId: string): Promise<{
  data?: {
    total_items: number;
    locations_with_low_stock: number;
    locations_with_out_of_stock: number;
    total_value: number;
  };
  error?: string;
}> {
  if (!clerkOrgId) {
    return { error: "Organization ID is required" };
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

  // Get all global items
  const { data: items, error: itemsError } = await supabase
    .from("inventory_items")
    .select("id, cost_per_unit")
    .eq("merchant_id", merchant.id)
    .is("location_id", null);

  if (itemsError) {
    return { error: itemsError.message };
  }

  const total_items = items?.length || 0;

  // Get aggregate stock for all items
  const { data: stockData } = await supabase
    .from("location_inventory_stock")
    .select("inventory_item_id, stock_quantity, location_id")
    .in(
      "inventory_item_id",
      (items || []).map((i) => i.id)
    );

  // Calculate aggregates
  let total_value = 0;
  const lowStockLocations = new Set<string>();
  const outOfStockLocations = new Set<string>();

  const itemCostMap = new Map(
    (items || []).map((i) => [i.id, i.cost_per_unit])
  );

  for (const stock of stockData || []) {
    const cost = itemCostMap.get(stock.inventory_item_id) || 0;
    const qty = stock.stock_quantity || 0;
    total_value += qty * cost;

    if (qty <= 0) {
      outOfStockLocations.add(stock.location_id);
    }
    // Note: Would need threshold data to properly calculate low stock
  }

  return {
    data: {
      total_items,
      locations_with_low_stock: lowStockLocations.size,
      locations_with_out_of_stock: outOfStockLocations.size,
      total_value,
    },
  };
}
