"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import { LogAuditEvent } from "./audit-logs";
import { CreatePurchaseOrder } from "./inventory";

// ============================================================================
// TYPES
// ============================================================================

export type TransferStatus = "draft" | "in_transit" | "received" | "cancelled";

export interface TransferLocation {
  id: string;
  name: string;
}

export interface InventoryTransfer {
  id: string;
  merchant_id: string;
  from_location_id: string;
  to_location_id: string;
  transfer_number: string;
  status: TransferStatus;
  notes: string | null;
  initiated_by_user_id: string | null;
  initiated_by_name: string | null;
  received_by_user_id: string | null;
  received_by_name: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
  from_location?: { id: string; name: string } | null;
  to_location?: { id: string; name: string } | null;
  // Computed
  items_count?: number;
}

export interface InventoryTransferItem {
  id: string;
  transfer_id: string;
  inventory_item_id: string;
  quantity_sent: number;
  quantity_received: number | null;
  inventory_item: {
    id: string;
    name: string;
    unit_type: string;
    category: string | null;
  } | null;
}

export interface TransferDetail {
  transfer: InventoryTransfer;
  items: InventoryTransferItem[];
}

export interface InitiateTransferInput {
  from_location_id: string;
  to_location_id: string;
  notes?: string;
  items: { inventory_item_id: string; quantity: number }[];
}

// ============================================================================
// HELPERS
// ============================================================================

async function resolveMerchantId(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clerkOrgId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !data) {
    console.error("[transfers] merchant lookup failed:", error);
    return null;
  }
  return data.id;
}

// ============================================================================
// GET — Merchant locations (for source/destination pickers)
// ============================================================================

export async function GetMerchantLocations(
  clerkOrgId: string,
): Promise<TransferLocation[]> {
  if (!clerkOrgId) return [];

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase, clerkOrgId);
  if (!merchantId) return [];

  const { data, error } = await supabase
    .from("locations")
    .select("id, name")
    .eq("merchant_id", merchantId)
    .order("name", { ascending: true });

  if (error) {
    console.error("[transfers] GetMerchantLocations failed:", error);
    return [];
  }
  return (data ?? []) as TransferLocation[];
}

// ============================================================================
// GET — Transfers touching a location (as source OR destination)
// ============================================================================

export async function GetTransfers(
  clerkOrgId: string,
  locationId?: string | null,
): Promise<InventoryTransfer[]> {
  if (!clerkOrgId) return [];
  if (!locationId || locationId === "all") return [];

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("inventory_transfers")
    .select(
      `
        *,
        from_location:locations!from_location_id(id, name),
        to_location:locations!to_location_id(id, name),
        inventory_transfer_items(count)
      `,
    )
    .or(`from_location_id.eq.${locationId},to_location_id.eq.${locationId}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[transfers] GetTransfers failed:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const items = row.inventory_transfer_items as { count: number }[] | undefined;
    const { inventory_transfer_items, ...rest } = row;
    void inventory_transfer_items;
    return {
      ...(rest as unknown as InventoryTransfer),
      items_count: items?.[0]?.count ?? 0,
    };
  });
}

// ============================================================================
// GET — Single transfer with line items
// ============================================================================

export async function GetTransferDetail(
  transferId: string,
): Promise<TransferDetail | null> {
  if (!transferId) return null;

  const supabase = createServerSupabaseClient();

  const { data: transfer, error: tErr } = await supabase
    .from("inventory_transfers")
    .select(
      `
        *,
        from_location:locations!from_location_id(id, name),
        to_location:locations!to_location_id(id, name)
      `,
    )
    .eq("id", transferId)
    .single();

  if (tErr || !transfer) {
    console.error("[transfers] GetTransferDetail header failed:", tErr);
    return null;
  }

  const { data: items, error: iErr } = await supabase
    .from("inventory_transfer_items")
    .select(
      `
        *,
        inventory_item:inventory_items!inventory_item_id(id, name, unit_type, category)
      `,
    )
    .eq("transfer_id", transferId);

  if (iErr) {
    console.error("[transfers] GetTransferDetail items failed:", iErr);
    return null;
  }

  const sorted = (items ?? []).sort((a, b) =>
    (a.inventory_item?.name ?? "").localeCompare(b.inventory_item?.name ?? ""),
  );

  return {
    transfer: transfer as InventoryTransfer,
    items: sorted as InventoryTransferItem[],
  };
}

// ============================================================================
// MUTATION — Initiate a transfer (decrements source stock)
// ============================================================================

export async function InitiateTransfer(
  clerkOrgId: string,
  input: InitiateTransferInput,
): Promise<{
  success?: boolean;
  transferId?: string;
  transferNumber?: string;
  error?: string;
}> {
  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!input.from_location_id || !input.to_location_id) {
    return { error: "Source and destination locations are required" };
  }
  if (input.from_location_id === input.to_location_id) {
    return { error: "Source and destination must be different locations" };
  }
  if (!input.items || input.items.length === 0) {
    return { error: "Add at least one item to transfer" };
  }
  if (input.items.some((i) => !i.quantity || i.quantity <= 0)) {
    return { error: "Every transfer line needs a quantity greater than zero" };
  }

  const supabase = createServerSupabaseClient();

  const merchantId = await resolveMerchantId(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const user = await currentUser();
  const userId = user?.id || null;
  const userName = user?.fullName || user?.firstName || "Unknown User";

  const { data, error } = await supabase.rpc("initiate_transfer", {
    p_merchant_id: merchantId,
    p_from_location_id: input.from_location_id,
    p_to_location_id: input.to_location_id,
    p_items: input.items,
    p_notes: input.notes ?? null,
    p_user_id: userId,
    p_user_name: userName,
  });

  if (error) {
    console.error("[transfers] initiate_transfer RPC failed:", error);
    return { error: error.message };
  }
  if (data && data.success === false) {
    return { error: data.error || "Failed to initiate transfer" };
  }

  await LogAuditEvent({
    clerkOrgId,
    merchantId,
    locationId: input.from_location_id,
    action: "initiated_transfer",
    actionCategory: "inventory",
    severity: "info",
    resourceType: "inventory_transfer",
    resourceId: data?.transfer_id,
    resourceName: data?.transfer_number,
    changes: {
      after: {
        transfer_number: data?.transfer_number,
        from_location_id: input.from_location_id,
        to_location_id: input.to_location_id,
        items: data?.items_count,
      },
    },
  });

  return {
    success: true,
    transferId: data?.transfer_id,
    transferNumber: data?.transfer_number,
  };
}

// ============================================================================
// MUTATION — Receive a transfer (increments destination stock)
// ============================================================================

export async function ReceiveTransfer(
  clerkOrgId: string,
  transferId: string,
  receivedItems: { inventory_item_id: string; quantity_received: number }[],
): Promise<{
  success?: boolean;
  discrepancies?: { inventory_item_id: string; sent: number; received: number }[];
  error?: string;
}> {
  if (!transferId) return { error: "Transfer ID is required" };
  if (!receivedItems || receivedItems.length === 0) {
    return { error: "No received quantities were provided" };
  }

  const supabase = createServerSupabaseClient();

  const user = await currentUser();
  const userId = user?.id || null;
  const userName = user?.fullName || user?.firstName || "Unknown User";

  const { data, error } = await supabase.rpc("receive_transfer", {
    p_transfer_id: transferId,
    p_received_items: receivedItems,
    p_user_id: userId,
    p_user_name: userName,
  });

  if (error) {
    console.error("[transfers] receive_transfer RPC failed:", error);
    return { error: error.message };
  }
  if (data && data.success === false) {
    return { error: data.error || "Failed to receive transfer" };
  }

  await LogAuditEvent({
    clerkOrgId,
    action: "received_transfer",
    actionCategory: "inventory",
    severity: "info",
    resourceType: "inventory_transfer",
    resourceId: transferId,
    resourceName: data?.transfer_number,
    changes: {
      after: {
        discrepancies: data?.discrepancies,
      },
    },
  });

  return { success: true, discrepancies: data?.discrepancies ?? [] };
}

// ============================================================================
// MUTATION — Cancel an in-transit transfer (returns stock to source)
// ============================================================================

export async function CancelTransfer(
  clerkOrgId: string,
  transferId: string,
): Promise<{ success?: boolean; error?: string }> {
  if (!transferId) return { error: "Transfer ID is required" };

  const supabase = createServerSupabaseClient();

  const user = await currentUser();
  const userId = user?.id || null;
  const userName = user?.fullName || user?.firstName || "Unknown User";

  const { data, error } = await supabase.rpc("cancel_transfer", {
    p_transfer_id: transferId,
    p_user_id: userId,
    p_user_name: userName,
  });

  if (error) {
    console.error("[transfers] cancel_transfer RPC failed:", error);
    return { error: error.message };
  }
  if (data && data.success === false) {
    return { error: data.error || "Failed to cancel transfer" };
  }

  await LogAuditEvent({
    clerkOrgId,
    action: "cancelled_transfer",
    actionCategory: "inventory",
    severity: "info",
    resourceType: "inventory_transfer",
    resourceId: transferId,
    resourceName: data?.transfer_number,
    changes: { after: { status: "cancelled" } },
  });

  return { success: true };
}

// ============================================================================
// T3.6 — Auto-PO generation from par levels
// Suggests draft purchase orders for items below par at a location, grouped by
// the item's default vendor (items with no vendor are skipped).
// ============================================================================

export interface ParShortfallItem {
  inventory_item_id: string;
  name: string;
  unit_type: string;
  vendor_id: string;
  vendor_name: string;
  current_stock: number;
  /** Quantity already on order in open (draft/pending) POs at this location. */
  on_order: number;
  par_level: number;
  suggested_quantity: number;
  unit_cost: number;
}

export async function GetParLevelShortfalls(
  clerkOrgId: string,
  locationId?: string | null,
): Promise<ParShortfallItem[]> {
  if (!clerkOrgId) return [];
  if (!locationId || locationId === "all") return [];

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase, clerkOrgId);
  if (!merchantId) return [];

  // Tracked items (global + this location) that have a par level and a vendor.
  const { data: items, error } = await supabase
    .from("inventory_items")
    .select(
      "id, name, unit_type, par_level, cost_per_unit, vendor_id, stock_mode, location_id",
    )
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .or(`location_id.is.null,location_id.eq.${locationId}`);

  if (error || !items) {
    console.error("[transfers] GetParLevelShortfalls items failed:", error);
    return [];
  }

  const candidateIds = items.map((i) => i.id);
  const { data: stockRows } = await supabase
    .from("location_inventory_stock")
    .select("inventory_item_id, stock_quantity")
    .eq("location_id", locationId)
    .in("inventory_item_id", candidateIds.length > 0 ? candidateIds : [""]);

  const stockMap = new Map(
    (stockRows ?? []).map((s) => [s.inventory_item_id, s.stock_quantity ?? 0]),
  );

  const vendorIds = [
    ...new Set(items.map((i) => i.vendor_id).filter(Boolean) as string[]),
  ];
  const { data: vendorRows } = await supabase
    .from("vendors")
    .select("id, name")
    .in("id", vendorIds.length > 0 ? vendorIds : [""]);
  const vendorMap = new Map((vendorRows ?? []).map((v) => [v.id, v.name]));

  // Sum quantities already on order at this location in open POs (draft/pending),
  // so repeat clicks of "Generate Draft POs" don't create duplicate reorders.
  // We treat (quantity_ordered − quantity_received) as the outstanding amount
  // expected to arrive — that's what reduces the par shortfall.
  const onOrderMap = new Map<string, number>();
  if (candidateIds.length > 0) {
    const { data: openPOs } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("location_id", locationId)
      .in("status", ["draft", "pending"]);

    const openPOIds = (openPOs ?? []).map((p) => p.id);
    if (openPOIds.length > 0) {
      const { data: openLines } = await supabase
        .from("purchase_order_items")
        .select("inventory_item_id, quantity_ordered, quantity_received")
        .in("purchase_order_id", openPOIds)
        .in("inventory_item_id", candidateIds);

      for (const line of openLines ?? []) {
        if (!line.inventory_item_id) continue;
        const outstanding =
          (line.quantity_ordered ?? 0) - (line.quantity_received ?? 0);
        if (outstanding <= 0) continue;
        onOrderMap.set(
          line.inventory_item_id,
          (onOrderMap.get(line.inventory_item_id) ?? 0) + outstanding,
        );
      }
    }
  }

  const shortfalls: ParShortfallItem[] = [];
  for (const item of items) {
    const par = item.par_level ?? 0;
    if (par <= 0) continue;
    if (item.stock_mode !== "stock_tracking") continue;
    if (!item.vendor_id) continue;

    const stock = stockMap.get(item.id) ?? 0;
    const onOrder = onOrderMap.get(item.id) ?? 0;
    // Subtract anything already on order — open POs will replenish the gap.
    const effectiveStock = stock + onOrder;
    if (effectiveStock >= par) continue;

    shortfalls.push({
      inventory_item_id: item.id,
      name: item.name,
      unit_type: item.unit_type,
      vendor_id: item.vendor_id,
      vendor_name: vendorMap.get(item.vendor_id) ?? "Unknown vendor",
      current_stock: stock,
      on_order: onOrder,
      par_level: par,
      suggested_quantity: par - effectiveStock,
      unit_cost: item.cost_per_unit ?? 0,
    });
  }

  return shortfalls.sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));
}

export async function GenerateParLevelPurchaseOrders(
  clerkOrgId: string,
  locationId: string,
): Promise<{
  success?: boolean;
  ordersCreated?: number;
  itemsOrdered?: number;
  error?: string;
}> {
  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!locationId || locationId === "all") {
    return { error: "Select a specific location to generate purchase orders" };
  }

  const shortfalls = await GetParLevelShortfalls(clerkOrgId, locationId);
  if (shortfalls.length === 0) {
    return { error: "No items are below their par level at this location" };
  }

  // Group shortfalls by vendor → one draft PO per vendor.
  const byVendor = new Map<string, ParShortfallItem[]>();
  for (const s of shortfalls) {
    const list = byVendor.get(s.vendor_id) ?? [];
    list.push(s);
    byVendor.set(s.vendor_id, list);
  }

  let ordersCreated = 0;
  let itemsOrdered = 0;
  for (const [vendorId, vendorItems] of byVendor) {
    const result = await CreatePurchaseOrder(clerkOrgId, {
      location_id: locationId,
      vendor_id: vendorId,
      items: vendorItems.map((i) => ({
        inventory_item_id: i.inventory_item_id,
        quantity_ordered: i.suggested_quantity,
        unit_cost: i.unit_cost,
      })),
    });
    if (!result?.error) {
      ordersCreated += 1;
      itemsOrdered += vendorItems.length;
    }
  }

  if (ordersCreated === 0) {
    return { error: "Failed to create purchase orders" };
  }

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: "generated_par_level_pos",
    actionCategory: "inventory",
    severity: "info",
    resourceType: "purchase_order",
    changes: {
      after: { orders_created: ordersCreated, items_ordered: itemsOrdered },
    },
  });

  return { success: true, ordersCreated, itemsOrdered };
}
