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
 * - All Locations view: returns only global items (location_id IS NULL)
 * - Specific Location view: returns global items + location-specific items
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
  if (locationId && locationId !== "all") {
    // Show global items (location_id IS NULL) + items for this location
    query = query.or(`location_id.is.null,location_id.eq.${locationId}`);
  } else {
    // All Locations view - only show global items
    query = query.is("location_id", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error getting inventory items:", error);
    return [];
  }

  // Transform to flatten vendor
  return (data || []).map((item) => ({
    ...item,
    vendor: Array.isArray(item.vendor) ? item.vendor[0] : item.vendor || null,
  }));
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

  // Insert line items
  const itemsToInsert = data.items.map((item) => ({
    purchase_order_id: po.id,
    inventory_item_id: item.inventory_item_id,
    quantity_ordered: item.quantity_ordered,
    quantity_received: 0,
    unit_cost: item.unit_cost,
  }));

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
    .select("status")
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

  // Update PO status (triggers will handle stock update if 'received')
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === "pending") {
    updateData.ordered_at = new Date().toISOString();
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

  // Build base query for items
  let itemQuery = supabase
    .from("inventory_items")
    .select("id, current_stock, reorder_point, stock_mode, cost_per_unit")
    .eq("merchant_id", merchant.id);

  // Apply location filter
  if (locationId && locationId !== "all") {
    itemQuery = itemQuery.or(
      `location_id.is.null,location_id.eq.${locationId}`
    );
  } else {
    itemQuery = itemQuery.is("location_id", null);
  }

  const { data: items } = await itemQuery;

  const totalItems = items?.length || 0;

  const lowStock = (items || []).filter(
    (s) =>
      s.stock_mode === "stock_tracking" &&
      s.current_stock > 0 &&
      s.current_stock <= s.reorder_point
  ).length;

  const outOfStock = (items || []).filter(
    (s) =>
      s.stock_mode === "out_of_stock" ||
      (s.stock_mode === "stock_tracking" && s.current_stock <= 0)
  ).length;

  const totalValue = (items || []).reduce((sum, s) => {
    return sum + s.current_stock * (s.cost_per_unit || 0);
  }, 0);

  // Get vendor count
  let vendorQuery = supabase
    .from("vendors")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchant.id);

  if (locationId && locationId !== "all") {
    vendorQuery = vendorQuery.or(
      `location_id.is.null,location_id.eq.${locationId}`
    );
  } else {
    vendorQuery = vendorQuery.is("location_id", null);
  }

  const { count: totalVendors } = await vendorQuery;

  return {
    totalItems,
    totalVendors: totalVendors || 0,
    lowStock,
    outOfStock,
    totalValue,
  };
}
