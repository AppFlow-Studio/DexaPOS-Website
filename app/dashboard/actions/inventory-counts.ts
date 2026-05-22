"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// TYPES
// ============================================================================

export type CountStatus = "draft" | "in_progress" | "completed" | "approved";

export interface InventoryCount {
  id: string;
  merchant_id: string;
  location_id: string;
  count_name: string;
  status: CountStatus;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  approved_by_user_id: string | null;
  approved_by_name: string | null;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  // Computed
  items_count?: number;
}

export interface InventoryCountItem {
  id: string;
  count_id: string;
  inventory_item_id: string;
  expected_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
  variance_cost: number | null;
  created_at: string;
  inventory_item: {
    id: string;
    name: string;
    unit_type: string;
    category: string | null;
    cost_per_unit: number | null;
  } | null;
}

export interface CountDetail {
  count: InventoryCount;
  items: InventoryCountItem[];
}

export interface CreateCountInput {
  count_name: string;
  assigned_to_user_id?: string;
  assigned_to_name?: string;
  item_ids?: string[]; // optional scope; omit/empty = all active items
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
    console.error("[counts] merchant lookup failed:", error);
    return null;
  }
  return data.id;
}

// ============================================================================
// GET — Count sessions for a location
// ============================================================================

export async function GetInventoryCounts(
  clerkOrgId: string,
  locationId?: string | null,
): Promise<InventoryCount[]> {
  if (!clerkOrgId) return [];
  if (!locationId || locationId === "all") return [];

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("inventory_counts")
    .select("*, inventory_count_items(count)")
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[counts] GetInventoryCounts failed:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const items = row.inventory_count_items as { count: number }[] | undefined;
    const { inventory_count_items, ...rest } = row;
    void inventory_count_items;
    return {
      ...(rest as unknown as InventoryCount),
      items_count: items?.[0]?.count ?? 0,
    };
  });
}

// ============================================================================
// GET — Single count session with line items
// ============================================================================

export async function GetInventoryCountDetail(
  countId: string,
): Promise<CountDetail | null> {
  if (!countId) return null;

  const supabase = createServerSupabaseClient();

  const { data: count, error: countError } = await supabase
    .from("inventory_counts")
    .select("*")
    .eq("id", countId)
    .single();

  if (countError || !count) {
    console.error("[counts] GetInventoryCountDetail header failed:", countError);
    return null;
  }

  const { data: items, error: itemsError } = await supabase
    .from("inventory_count_items")
    .select(
      `
        *,
        inventory_item:inventory_items!inventory_item_id(id, name, unit_type, category, cost_per_unit)
      `,
    )
    .eq("count_id", countId);

  if (itemsError) {
    console.error("[counts] GetInventoryCountDetail items failed:", itemsError);
    return null;
  }

  // Sort by category then name for a kitchen-friendly walk order
  const sorted = (items ?? []).sort((a, b) => {
    const catA = a.inventory_item?.category ?? "";
    const catB = b.inventory_item?.category ?? "";
    if (catA !== catB) return catA.localeCompare(catB);
    return (a.inventory_item?.name ?? "").localeCompare(
      b.inventory_item?.name ?? "",
    );
  });

  return {
    count: count as InventoryCount,
    items: sorted as InventoryCountItem[],
  };
}

// ============================================================================
// MUTATION — Create a count session (snapshots current stock)
// ============================================================================

export async function CreateInventoryCount(
  clerkOrgId: string,
  locationId: string,
  input: CreateCountInput,
): Promise<{
  success?: boolean;
  countId?: string;
  itemsCount?: number;
  error?: string;
}> {
  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!locationId || locationId === "all") {
    return { error: "Please select a specific location to create a count" };
  }
  if (!input.count_name?.trim()) {
    return { error: "A count name is required" };
  }

  const supabase = createServerSupabaseClient();

  const merchantId = await resolveMerchantId(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const { data, error } = await supabase.rpc("create_inventory_count", {
    p_merchant_id: merchantId,
    p_location_id: locationId,
    p_count_name: input.count_name.trim(),
    p_assigned_to_user_id: input.assigned_to_user_id ?? null,
    p_assigned_to_name: input.assigned_to_name ?? null,
    p_item_ids:
      input.item_ids && input.item_ids.length > 0 ? input.item_ids : null,
  });

  if (error) {
    console.error("[counts] create_inventory_count RPC failed:", error);
    return { error: error.message };
  }
  if (data && data.success === false) {
    return { error: data.error || "Failed to create count" };
  }

  await LogAuditEvent({
    clerkOrgId,
    merchantId,
    locationId,
    action: "created_inventory_count",
    actionCategory: "inventory",
    severity: "info",
    resourceType: "inventory_count",
    resourceId: data?.count_id,
    resourceName: input.count_name.trim(),
    changes: {
      after: { count_name: input.count_name.trim(), items: data?.items_count },
    },
  });

  return {
    success: true,
    countId: data?.count_id,
    itemsCount: data?.items_count,
  };
}

// ============================================================================
// MUTATION — Submit counted quantities
// ============================================================================

export async function SubmitInventoryCount(
  clerkOrgId: string,
  countId: string,
  countedItems: { inventory_item_id: string; counted_quantity: number }[],
  applyAdjustments: boolean,
): Promise<{
  success?: boolean;
  itemsCounted?: number;
  totalVarianceCost?: number;
  adjustmentsApplied?: number;
  error?: string;
}> {
  if (!countId) return { error: "Count ID is required" };
  if (!countedItems || countedItems.length === 0) {
    return { error: "No counted quantities were provided" };
  }

  const supabase = createServerSupabaseClient();

  const user = await currentUser();
  const userId = user?.id || null;
  const userName = user?.fullName || user?.firstName || "Unknown User";

  const { data, error } = await supabase.rpc("submit_inventory_count", {
    p_count_id: countId,
    p_counted_items: countedItems,
    p_user_id: userId,
    p_user_name: userName,
    p_apply_adjustments: applyAdjustments,
  });

  if (error) {
    console.error("[counts] submit_inventory_count RPC failed:", error);
    return { error: error.message };
  }
  if (data && data.success === false) {
    return { error: data.error || "Failed to submit count" };
  }

  await LogAuditEvent({
    clerkOrgId,
    action: "submitted_inventory_count",
    actionCategory: "inventory",
    severity: "info",
    resourceType: "inventory_count",
    resourceId: countId,
    changes: {
      after: {
        items_counted: data?.items_counted,
        total_variance_cost: data?.total_variance_cost,
        adjustments_applied: data?.adjustments_applied,
        apply_adjustments: applyAdjustments,
      },
    },
  });

  return {
    success: true,
    itemsCounted: data?.items_counted,
    totalVarianceCost: data?.total_variance_cost,
    adjustmentsApplied: data?.adjustments_applied,
  };
}

// ============================================================================
// MUTATION — Approve a completed count
// ============================================================================

export async function ApproveInventoryCount(
  clerkOrgId: string,
  countId: string,
): Promise<{ success?: boolean; error?: string }> {
  if (!countId) return { error: "Count ID is required" };

  const supabase = createServerSupabaseClient();

  const user = await currentUser();
  const userId = user?.id || null;
  const userName = user?.fullName || user?.firstName || "Unknown User";

  // Only completed counts can be approved
  const { data: existing, error: fetchError } = await supabase
    .from("inventory_counts")
    .select("status")
    .eq("id", countId)
    .single();

  if (fetchError || !existing) {
    return { error: "Count session not found" };
  }
  if (existing.status !== "completed") {
    return {
      error: `Only completed counts can be approved (current status: ${existing.status})`,
    };
  }

  const { error } = await supabase
    .from("inventory_counts")
    .update({
      status: "approved",
      approved_by_user_id: userId,
      approved_by_name: userName,
      approved_at: new Date().toISOString(),
    })
    .eq("id", countId);

  if (error) {
    console.error("[counts] ApproveInventoryCount failed:", error);
    return { error: error.message };
  }

  await LogAuditEvent({
    clerkOrgId,
    action: "approved_inventory_count",
    actionCategory: "inventory",
    severity: "info",
    resourceType: "inventory_count",
    resourceId: countId,
    changes: { before: { status: "completed" }, after: { status: "approved" } },
  });

  return { success: true };
}
