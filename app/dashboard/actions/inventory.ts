"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InventoryItemWithVendor, StockMode } from "@/types/inventory";

// ============================================================================
// TYPES
// ============================================================================

export interface VendorWithStats {
  id: string;
  merchant_id: string;
  location_id: string | null;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  created_at: string;
  updated_at: string;
  // Computed stats
  total_orders: number;
  total_spend: number;
}

export interface PurchaseOrderWithDetails {
  id: string;
  merchant_id: string;
  location_id: string | null;
  po_number: string;
  vendor_id: string | null;
  status: string;
  total_amount: number;
  ordered_at: string | null;
  received_at: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  vendor?: {
    id: string;
    name: string;
  } | null;
  location?: {
    id: string;
    name: string;
  } | null;
  items?: {
    id: string;
    inventory_item_id: string;
    quantity_ordered: number;
    quantity_received: number;
    unit_cost: number;
    line_total: number;
    inventory_item: {
      id: string;
      name: string;
      unit_type: string;
    };
  }[];
}

// ============================================================================
// INVENTORY ITEMS - CRUD
// ============================================================================

/**
 * Get all inventory items for a merchant
 * - All Locations view: returns global items with AGGREGATE stock across all locations
 * - Specific Location view: returns global items + local items with LOCATION-SPECIFIC stock
 */
export async function GetInventoryItems(
  clerkOrgId: string,
  locationId?: string | null
): Promise<InventoryItemWithVendor[]> {
  if (!clerkOrgId) return [];

  const supabase = createServerSupabaseClient();

  // Get merchant
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("Error getting merchant:", merchantError);
    return [];
  }

  const isLocationView = locationId && locationId !== "all";

  let query = supabase
    .from("inventory_items")
    .select(
      `
            *,
            vendor:vendors!vendor_id(id, name)
        `
    )
    .eq("merchant_id", merchant.id)
    .order("name");

  // Apply location filter
  if (isLocationView) {
    // Show global items (location_id IS NULL) + items for this location
    query = query.or(`location_id.is.null,location_id.eq.${locationId}`);
  } else {
    // All Locations view - show global items + ALL local items (HQ can see everything)
    // No filter on location_id
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error getting inventory items:", error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  const itemIds = data.map((i) => i.id);

  // ========================================================================
  // LOCATION VIEW: Fetch location-specific stock and cost overrides
  // ========================================================================
  if (isLocationView) {
    // Get location stock
    const { data: stockData } = await supabase
      .from("location_inventory_stock")
      .select("inventory_item_id, stock_quantity, reorder_threshold")
      .eq("location_id", locationId)
      .in("inventory_item_id", itemIds);

    const stockMap = new Map(
      (stockData || []).map((s) => [s.inventory_item_id, s])
    );

    // Get location cost overrides (direct overrides, no vendor)
    const { data: overrideData } = await supabase
      .from("location_inventory_overrides")
      .select("inventory_item_id, custom_cost, custom_reorder_threshold")
      .eq("location_id", locationId)
      .in("inventory_item_id", itemIds);

    const overrideMap = new Map(
      (overrideData || []).map((o) => [o.inventory_item_id, o])
    );

    // Get vendor pricing overrides
    const { data: vendorPricingData } = await supabase
      .from("location_vendor_pricing")
      .select("inventory_item_id, unit_cost")
      .eq("location_id", locationId)
      .in("inventory_item_id", itemIds);

    const vendorPricingMap = new Map(
      (vendorPricingData || []).map((p) => [p.inventory_item_id, p.unit_cost])
    );

    // Transform items with location context
    return data.map((item) => {
      const stock = stockMap.get(item.id);
      const override = overrideMap.get(item.id);
      const vendorPrice = vendorPricingMap.get(item.id);

      // Effective cost priority: Direct override > Vendor pricing > Base cost
      const effectiveCost =
        override?.custom_cost ?? vendorPrice ?? item.cost_per_unit;

      // Effective reorder threshold: Stock table > Override table > Base
      const effectiveThreshold =
        stock?.reorder_threshold ??
        override?.custom_reorder_threshold ??
        item.reorder_threshold;

      return {
        ...item,
        // Location-specific stock
        current_stock: stock?.stock_quantity ?? 0,
        // Location-specific or effective values
        cost_per_unit: effectiveCost,
        reorder_threshold: effectiveThreshold,
        // Metadata for UI
        has_cost_override: !!(override?.custom_cost || vendorPrice),
        vendor: Array.isArray(item.vendor)
          ? item.vendor[0]
          : item.vendor || null,
      };
    });
  }

  // ========================================================================
  // GLOBAL VIEW: Fetch aggregate stock across all locations
  // ========================================================================

  // Get aggregate stock for all items
  const { data: allStockData } = await supabase
    .from("location_inventory_stock")
    .select(
      "inventory_item_id, stock_quantity, reorder_threshold, location_id"
    );

  // Get item reorder thresholds
  const itemThresholdMap = new Map(
    data.map((item) => [
      item.id,
      item.reorder_threshold ?? item.reorder_point ?? 0,
    ])
  );

  // Aggregate by item - track status breakdown per location
  const aggregateMap = new Map<
    string,
    {
      total: number;
      locations: Set<string>;
      inStockCount: number;
      lowStockCount: number;
      outOfStockCount: number;
    }
  >();

  for (const stock of allStockData || []) {
    const existing = aggregateMap.get(stock.inventory_item_id) || {
      total: 0,
      locations: new Set<string>(),
      inStockCount: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
    };

    const qty = stock.stock_quantity || 0;
    const threshold =
      stock.reorder_threshold ??
      itemThresholdMap.get(stock.inventory_item_id) ??
      0;

    existing.total += qty;
    existing.locations.add(stock.location_id);

    if (qty <= 0) {
      existing.outOfStockCount++;
    } else if (qty <= threshold) {
      existing.lowStockCount++;
    } else {
      existing.inStockCount++;
    }

    aggregateMap.set(stock.inventory_item_id, existing);
  }

  // Transform items with global context
  return data.map((item) => {
    const aggregate = aggregateMap.get(item.id);
    const locationCount = aggregate?.locations.size ?? 0;

    return {
      ...item,
      // Aggregate stock across all locations
      current_stock: aggregate?.total ?? item.current_stock ?? 0,
      // Metadata for UI - Status breakdown
      location_count: locationCount,
      in_stock_locations: aggregate?.inStockCount ?? 0,
      low_stock_locations: aggregate?.lowStockCount ?? 0,
      out_of_stock_locations: aggregate?.outOfStockCount ?? 0,
      is_aggregate: true, // Flag to indicate this is aggregated data
      // Base cost (no location-specific override in global view)
      cost_per_unit: item.cost_per_unit,
      vendor: Array.isArray(item.vendor) ? item.vendor[0] : item.vendor || null,
    };
  });
}

/**
 * Create a new inventory item
 * - If locationId is 'all' or null, creates a global item (location_id = NULL)
 * - If locationId is set, creates a location-specific item
 */
export async function CreateInventoryItem(
  clerkOrgId: string,
  data: {
    name: string;
    sku?: string;
    category?: string;
    unit_type: string;
    stock_mode?: StockMode;
    current_stock?: number;
    reorder_point?: number;
    cost_per_unit?: number;
    vendor_id?: string;
    location_id?: string | null;
  }
) {
  if (!clerkOrgId) return { error: "Organization ID is required" };

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

  // Determine location_id (null for global)
  const locationId =
    data.location_id === "all" ? null : data.location_id || null;

  const { data: item, error } = await supabase
    .from("inventory_items")
    .insert({
      merchant_id: merchant.id,
      location_id: locationId,
      name: data.name,
      sku: data.sku || null,
      category: data.category || null,
      unit_type: data.unit_type,
      stock_mode: data.stock_mode || "in_stock",
      current_stock: data.current_stock || 0,
      reorder_point: data.reorder_point || 0,
      cost_per_unit: data.cost_per_unit || 0,
      vendor_id: data.vendor_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating inventory item:", error);
    return { error: error.message };
  }

  return { data: item };
}

/**
 * Update an inventory item
 */
export async function UpdateInventoryItem(
  itemId: string,
  data: {
    name?: string;
    sku?: string;
    category?: string;
    unit_type?: string;
    stock_mode?: StockMode;
    current_stock?: number;
    reorder_point?: number;
    cost_per_unit?: number;
    vendor_id?: string | null;
  }
) {
  if (!itemId) return { error: "Item ID is required" };

  const supabase = createServerSupabaseClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.sku !== undefined) updateData.sku = data.sku;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.unit_type !== undefined) updateData.unit_type = data.unit_type;
  if (data.stock_mode !== undefined) updateData.stock_mode = data.stock_mode;
  if (data.current_stock !== undefined)
    updateData.current_stock = data.current_stock;
  if (data.reorder_point !== undefined)
    updateData.reorder_point = data.reorder_point;
  if (data.cost_per_unit !== undefined)
    updateData.cost_per_unit = data.cost_per_unit;
  if (data.vendor_id !== undefined) updateData.vendor_id = data.vendor_id;

  const { data: item, error } = await supabase
    .from("inventory_items")
    .update(updateData)
    .eq("id", itemId)
    .select()
    .single();

  if (error) {
    console.error("Error updating inventory item:", error);
    return { error: error.message };
  }

  return { data: item };
}

/**
 * Delete an inventory item
 */
export async function DeleteInventoryItem(itemId: string) {
  if (!itemId) return { error: "Item ID is required" };

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", itemId);

  if (error) {
    console.error("Error deleting inventory item:", error);
    return { error: error.message };
  }

  return { success: true };
}

/**
 * Quick stock update (inline editing)
 */
export async function UpdateItemStock(itemId: string, currentStock: number) {
  if (!itemId) return { error: "Item ID is required" };

  const supabase = createServerSupabaseClient();

  const { data: item, error } = await supabase
    .from("inventory_items")
    .update({
      current_stock: currentStock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .select()
    .single();

  if (error) {
    console.error("Error updating stock:", error);
    return { error: error.message };
  }

  return { data: item };
}

// ============================================================================
// VENDORS - CRUD
// ============================================================================

/**
 * Get all vendors for a merchant
 * - All Locations view: returns only global vendors (location_id IS NULL)
 * - Specific Location view: returns global + location-specific vendors
 */
export async function GetVendors(
  clerkOrgId: string,
  locationId?: string | null
): Promise<VendorWithStats[]> {
  if (!clerkOrgId) return [];

  const supabase = createServerSupabaseClient();

  // Get merchant
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("Error getting merchant:", merchantError);
    return [];
  }

  let query = supabase
    .from("vendors")
    .select("*")
    .eq("merchant_id", merchant.id)
    .order("name");

  // Apply location filter
  if (locationId && locationId !== "all") {
    // Show global vendors + vendors for this location
    query = query.or(`location_id.is.null,location_id.eq.${locationId}`);
  } else {
    // All Locations view - only show global vendors
    query = query.is("location_id", null);
  }

  const { data: vendors, error } = await query;

  if (error) {
    console.error("Error getting vendors:", error);
    return [];
  }

  // Get PO stats for each vendor
  const vendorIds = (vendors || []).map((v) => v.id);

  if (vendorIds.length === 0) {
    return [];
  }

  const { data: poStats } = await supabase
    .from("purchase_orders")
    .select("vendor_id, total_amount")
    .in("vendor_id", vendorIds);

  // Aggregate stats
  const statsMap: Record<string, { count: number; total: number }> = {};
  for (const po of poStats || []) {
    if (po.vendor_id) {
      if (!statsMap[po.vendor_id]) {
        statsMap[po.vendor_id] = { count: 0, total: 0 };
      }
      statsMap[po.vendor_id].count++;
      statsMap[po.vendor_id].total += po.total_amount || 0;
    }
  }

  return (vendors || []).map((vendor) => ({
    ...vendor,
    total_orders: statsMap[vendor.id]?.count || 0,
    total_spend: statsMap[vendor.id]?.total || 0,
  }));
}

/**
 * Create a new vendor
 */
export async function CreateVendor(
  clerkOrgId: string,
  data: {
    name: string;
    contact_name?: string;
    phone?: string;
    email?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    location_id?: string | null;
  }
) {
  if (!clerkOrgId) return { error: "Organization ID is required" };

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

  // Determine location_id (null for global)
  const locationId =
    data.location_id === "all" ? null : data.location_id || null;

  const { data: vendor, error } = await supabase
    .from("vendors")
    .insert({
      merchant_id: merchant.id,
      location_id: locationId,
      name: data.name,
      contact_name: data.contact_name || null,
      phone: data.phone || null,
      email: data.email || null,
      address_line1: data.address_line1 || null,
      city: data.city || null,
      state: data.state || null,
      zip_code: data.zip_code || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating vendor:", error);
    return { error: error.message };
  }

  return { data: vendor };
}

/**
 * Update a vendor
 */
export async function UpdateVendor(
  vendorId: string,
  data: {
    name?: string;
    contact_name?: string;
    phone?: string;
    email?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    zip_code?: string;
  }
) {
  if (!vendorId) return { error: "Vendor ID is required" };

  const supabase = createServerSupabaseClient();

  const { data: vendor, error } = await supabase
    .from("vendors")
    .update(data)
    .eq("id", vendorId)
    .select()
    .single();

  if (error) {
    console.error("Error updating vendor:", error);
    return { error: error.message };
  }

  return { data: vendor };
}

/**
 * Delete a vendor
 */
export async function DeleteVendor(vendorId: string) {
  if (!vendorId) return { error: "Vendor ID is required" };

  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("vendors").delete().eq("id", vendorId);

  if (error) {
    console.error("Error deleting vendor:", error);
    return { error: error.message };
  }

  return { success: true };
}

// ============================================================================
// PURCHASE ORDERS - CRUD
// ============================================================================

/**
 * Get all purchase orders for a location
 */
export async function GetPurchaseOrders(
  clerkOrgId: string,
  locationId?: string | null
): Promise<PurchaseOrderWithDetails[]> {
  if (!clerkOrgId) return [];

  const supabase = createServerSupabaseClient();

  // Get merchant
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("Error getting merchant:", merchantError);
    return [];
  }

  let query = supabase
    .from("purchase_orders")
    .select(
      `
            *,
            vendor:vendors(id, name),
            location:locations(id, name),
            items:purchase_order_items(
                id,
                inventory_item_id,
                quantity_ordered,
                quantity_received,
                unit_cost,
                line_total,
                item_name,
                item_sku,
                item_unit_type,
                item_category,
                inventory_item:inventory_items(id, name, unit_type)
            )
        `
    )
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false });

  // Filter by location if specified
  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error getting purchase orders:", error);
    return [];
  }

  return (data || []).map((po) => ({
    ...po,
    vendor: Array.isArray(po.vendor) ? po.vendor[0] : po.vendor || null,
    location: Array.isArray(po.location) ? po.location[0] : po.location || null,
    items: (po.items || []).map(
      (item: { inventory_item: unknown[] | unknown }) => ({
        ...item,
        inventory_item: Array.isArray(item.inventory_item)
          ? item.inventory_item[0]
          : item.inventory_item,
      })
    ),
  }));
}

/**
 * Create a new purchase order with items
 */
export async function CreatePurchaseOrder(
  clerkOrgId: string,
  data: {
    location_id: string;
    vendor_id: string;
    items: Array<{
      inventory_item_id: string;
      quantity_ordered: number;
      unit_cost: number;
    }>;
  }
) {
  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!data.location_id || data.location_id === "all") {
    return {
      error: "A specific location must be selected to create a purchase order",
    };
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

  // Get inventory item details for snapshots
  const itemIds = data.items.map((i) => i.inventory_item_id);
  const { data: inventoryItems } = await supabase
    .from("inventory_items")
    .select("id, name, sku, unit_type, category")
    .in("id", itemIds);

  const itemMap = new Map((inventoryItems || []).map((i) => [i.id, i]));

  // Calculate total
  const total = data.items.reduce(
    (sum, item) => sum + item.quantity_ordered * item.unit_cost,
    0
  );

  // Create PO (po_number is auto-generated by trigger)
  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      merchant_id: merchant.id,
      location_id: data.location_id,
      vendor_id: data.vendor_id,
      po_number: "", // Will be set by trigger
      status: "draft",
      total_amount: total,
    })
    .select()
    .single();

  if (poError || !po) {
    console.error("Error creating PO:", poError);
    return { error: poError?.message || "Failed to create purchase order" };
  }

  // Insert line items with snapshot columns
  const itemsToInsert = data.items.map((item) => {
    const invItem = itemMap.get(item.inventory_item_id);
    return {
      purchase_order_id: po.id,
      inventory_item_id: item.inventory_item_id,
      quantity_ordered: item.quantity_ordered,
      quantity_received: 0,
      unit_cost: item.unit_cost,
      // Snapshot columns
      item_name: invItem?.name || null,
      item_sku: invItem?.sku || null,
      item_unit_type: invItem?.unit_type || null,
      item_category: invItem?.category || null,
    };
  });

  const { error: itemsError } = await supabase
    .from("purchase_order_items")
    .insert(itemsToInsert);

  if (itemsError) {
    console.error("Error creating PO items:", itemsError);
    // Rollback PO
    await supabase.from("purchase_orders").delete().eq("id", po.id);
    return { error: itemsError.message };
  }

  return { data: po };
}

/**
 * Update PO status (with workflow validation)
 */
export async function UpdatePurchaseOrderStatus(
  poId: string,
  newStatus: "pending" | "received" | "paid" | "cancelled",
  receivedQuantities?: Record<string, number>
) {
  if (!poId) return { error: "PO ID is required" };

  const supabase = createServerSupabaseClient();

  // Get current PO
  const { data: po, error: fetchError } = await supabase
    .from("purchase_orders")
    .select("status, location_id")
    .eq("id", poId)
    .single();

  if (fetchError || !po) {
    return { error: "Purchase order not found" };
  }

  // Validate status transition
  const validTransitions: Record<string, string[]> = {
    draft: ["pending", "cancelled"],
    pending: ["received", "cancelled"],
    received: ["paid"],
    paid: [],
    cancelled: [],
  };

  if (!validTransitions[po.status]?.includes(newStatus)) {
    return { error: `Cannot transition from ${po.status} to ${newStatus}` };
  }

  // If receiving, update item quantities first
  if (newStatus === "received" && receivedQuantities) {
    for (const [itemId, qty] of Object.entries(receivedQuantities)) {
      await supabase
        .from("purchase_order_items")
        .update({ quantity_received: qty })
        .eq("id", itemId);
    }
  }

  // Update PO status
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === "pending") {
    updateData.ordered_at = new Date().toISOString();
  } else if (newStatus === "received") {
    updateData.received_at = new Date().toISOString();
  } else if (newStatus === "paid") {
    updateData.paid_at = new Date().toISOString();
  }

  const { data: updated, error } = await supabase
    .from("purchase_orders")
    .update(updateData)
    .eq("id", poId)
    .select()
    .single();

  if (error) {
    console.error("Error updating PO status:", error);
    return { error: error.message };
  }

  // ========================================================================
  // AUTO-INCREMENT LOCATION STOCK WHEN RECEIVING
  // ========================================================================
  if (newStatus === "received" && po.location_id) {
    // Get PO items with received quantities
    const { data: poItems } = await supabase
      .from("purchase_order_items")
      .select("inventory_item_id, quantity_received")
      .eq("purchase_order_id", poId);

    // Call increment_location_stock RPC for each item
    for (const item of poItems || []) {
      if (item.quantity_received && item.quantity_received > 0) {
        const { error: stockError } = await supabase.rpc(
          "increment_location_stock",
          {
            p_location_id: po.location_id,
            p_inventory_item_id: item.inventory_item_id,
            p_quantity: item.quantity_received,
          }
        );

        if (stockError) {
          console.error(
            `Error incrementing stock for item ${item.inventory_item_id}:`,
            stockError
          );
          // Continue with other items, don't fail the whole operation
        }
      }
    }

    console.log(
      `✅ Auto-incremented stock for ${
        poItems?.length || 0
      } items at location ${po.location_id}`
    );
  }

  return { data: updated };
}

/**
 * Delete a purchase order (only drafts can be deleted)
 */
export async function DeletePurchaseOrder(poId: string) {
  if (!poId) return { error: "PO ID is required" };

  const supabase = createServerSupabaseClient();

  // Check status
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", poId)
    .single();

  if (po?.status !== "draft") {
    return { error: "Only draft purchase orders can be deleted" };
  }

  const { error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", poId);

  if (error) {
    console.error("Error deleting PO:", error);
    return { error: error.message };
  }

  return { success: true };
}

// ============================================================================
// INVENTORY STATS
// ============================================================================

export async function GetInventoryStats(
  clerkOrgId: string,
  locationId?: string | null
) {
  if (!clerkOrgId) return null;

  const supabase = createServerSupabaseClient();

  // Get merchant
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!merchant) return null;

  const isLocationView = locationId && locationId !== "all";

  // Get items for the merchant (current_stock and reorder_point for fallback calc)
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, cost_per_unit, reorder_point, stock_mode, current_stock")
    .eq("merchant_id", merchant.id);

  if (!items || items.length === 0) {
    return {
      totalItems: 0,
      totalVendors: 0,
      lowStock: 0,
      outOfStock: 0,
      totalValue: 0,
    };
  }

  const totalItems = items.length;
  const itemIds = items.map((i) => i.id);
  const itemMap = new Map(items.map((i) => [i.id, i]));

  // ========================================================================
  // LOCATION VIEW: Get stats from location_inventory_stock
  // ========================================================================
  if (isLocationView) {
    // Get stock records for this location (may not exist for all items)
    const { data: stockData } = await supabase
      .from("location_inventory_stock")
      .select("inventory_item_id, stock_quantity, reorder_threshold")
      .eq("location_id", locationId)
      .in("inventory_item_id", itemIds);

    // Build a map of item_id -> stock record
    const stockMap = new Map(
      (stockData || []).map((s) => [s.inventory_item_id, s])
    );

    // Get cost overrides for this location
    const { data: overrides } = await supabase
      .from("location_inventory_overrides")
      .select("inventory_item_id, custom_cost")
      .eq("location_id", locationId)
      .in("inventory_item_id", itemIds);

    const overrideMap = new Map(
      (overrides || []).map((o) => [o.inventory_item_id, o.custom_cost])
    );

    // Get vendor count
    const { count: totalVendors } = await supabase
      .from("vendors")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchant.id);

    let lowStock = 0;
    let outOfStock = 0;
    let totalValue = 0;

    // Iterate over ALL items, not just ones with stock records
    for (const item of items) {
      // Get stock from location_inventory_stock if exists, else default to 0
      // This matches the table display logic exactly
      const stockRecord = stockMap.get(item.id);
      const qty = stockRecord?.stock_quantity ?? 0;
      const threshold =
        stockRecord?.reorder_threshold ?? item.reorder_point ?? 0;
      const effectiveCost = overrideMap.get(item.id) ?? item.cost_per_unit ?? 0;

      totalValue += qty * effectiveCost;

      // Only count items that use stock_tracking mode
      if (item.stock_mode === "stock_tracking") {
        if (qty <= 0) {
          outOfStock++;
        } else if (qty <= threshold) {
          lowStock++;
        }
      } else if (item.stock_mode === "out_of_stock") {
        // Items explicitly marked as out of stock
        outOfStock++;
      }
    }

    return {
      totalItems,
      totalVendors: totalVendors || 0,
      lowStock,
      outOfStock,
      totalValue,
    };
  }

  // ========================================================================
  // GLOBAL VIEW: Count LOCATIONS with issues
  // ========================================================================
  const { data: allStockData } = await supabase
    .from("location_inventory_stock")
    .select(
      "inventory_item_id, stock_quantity, reorder_threshold, location_id"
    );

  // Get all locations for this merchant
  const { data: allLocations } = await supabase
    .from("locations")
    .select("id")
    .eq("merchant_id", merchant.id);

  const locationIds = (allLocations || []).map((l) => l.id);

  // Build a map of location_id -> item_id -> stock record
  const stockByLocation = new Map<
    string,
    Map<string, { qty: number; threshold: number }>
  >();

  for (const loc of locationIds) {
    stockByLocation.set(loc, new Map());
  }

  for (const stock of allStockData || []) {
    const locMap = stockByLocation.get(stock.location_id);
    if (locMap) {
      const item = itemMap.get(stock.inventory_item_id);
      locMap.set(stock.inventory_item_id, {
        qty: stock.stock_quantity ?? 0,
        threshold: stock.reorder_threshold ?? item?.reorder_point ?? 0,
      });
    }
  }

  // Count locations with issues
  const locationsWithLowStock = new Set<string>();
  const locationsWithOutOfStock = new Set<string>();
  let totalValue = 0;

  for (const [locationId, locStockMap] of stockByLocation) {
    for (const item of items) {
      if (item.stock_mode !== "stock_tracking") continue;

      // Get stock for this item at this location (default to 0 if no record)
      const stockRecord = locStockMap.get(item.id);
      const qty = stockRecord?.qty ?? 0;
      const threshold = stockRecord?.threshold ?? item.reorder_point ?? 0;

      // Only add to total value once per item (not per location)
      // We'll calculate value separately below

      if (qty <= 0) {
        locationsWithOutOfStock.add(locationId);
      } else if (qty <= threshold) {
        locationsWithLowStock.add(locationId);
      }
    }
  }

  // Calculate total inventory value (sum across all locations)
  for (const stock of allStockData || []) {
    const item = itemMap.get(stock.inventory_item_id);
    if (item) {
      totalValue += (stock.stock_quantity ?? 0) * (item.cost_per_unit ?? 0);
    }
  }

  // Get vendor count
  const { count: totalVendors } = await supabase
    .from("vendors")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchant.id)
    .is("location_id", null);

  return {
    totalItems,
    totalVendors: totalVendors || 0,
    lowStock: locationsWithLowStock.size,
    outOfStock: locationsWithOutOfStock.size,
    totalValue,
    isLocationBased: true,
  };
}
