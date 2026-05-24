"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// TYPES
// ============================================================================

export type WasteReason =
  | "spoilage"
  | "overproduction"
  | "spill"
  | "theft"
  | "damaged"
  | "expired"
  | "other";

export interface WasteLogWithItem {
  id: string;
  merchant_id: string;
  location_id: string;
  inventory_item_id: string;
  quantity: number;
  reason: WasteReason;
  notes: string | null;
  waste_date: string;
  estimated_cost: number;
  logged_by_user_id: string | null;
  logged_by_name: string | null;
  created_at: string;
  inventory_item: {
    id: string;
    name: string;
    unit_type: string;
    category: string | null;
  } | null;
}

export interface LogWasteInput {
  inventory_item_id: string;
  quantity: number;
  reason: WasteReason;
  notes?: string;
  waste_date?: string; // ISO date (YYYY-MM-DD); defaults to today
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
    console.error("[waste] merchant lookup failed:", error);
    return null;
  }
  return data.id;
}

// ============================================================================
// GET — Waste logs for a location
// ============================================================================

export async function GetWasteLogs(
  clerkOrgId: string,
  locationId?: string | null,
  dateRange?: { from?: string; to?: string },
): Promise<WasteLogWithItem[]> {
  if (!clerkOrgId) return [];
  if (!locationId || locationId === "all") return [];

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("waste_logs")
    .select(
      `
        *,
        inventory_item:inventory_items!inventory_item_id(id, name, unit_type, category)
      `,
    )
    .eq("location_id", locationId)
    .order("waste_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (dateRange?.from) query = query.gte("waste_date", dateRange.from);
  if (dateRange?.to) query = query.lte("waste_date", dateRange.to);

  const { data, error } = await query;

  if (error) {
    console.error("[waste] GetWasteLogs failed:", error);
    return [];
  }

  return (data ?? []) as WasteLogWithItem[];
}

// ============================================================================
// MUTATION — Log a waste event
// ============================================================================

export async function LogWaste(
  clerkOrgId: string,
  locationId: string,
  input: LogWasteInput,
): Promise<{
  success?: boolean;
  wasteLogId?: string;
  estimatedCost?: number;
  newStock?: number;
  error?: string;
}> {
  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!locationId || locationId === "all") {
    return { error: "Please select a specific location to log waste" };
  }
  if (!input.inventory_item_id) return { error: "An inventory item is required" };
  if (!input.quantity || input.quantity <= 0) {
    return { error: "Quantity must be greater than zero" };
  }

  const supabase = createServerSupabaseClient();

  const merchantId = await resolveMerchantId(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const user = await currentUser();
  const userId = user?.id || null;
  const userName = user?.fullName || user?.firstName || "Unknown User";

  const { data, error } = await supabase.rpc("log_waste", {
    p_merchant_id: merchantId,
    p_location_id: locationId,
    p_inventory_item_id: input.inventory_item_id,
    p_quantity: input.quantity,
    p_reason: input.reason,
    p_notes: input.notes ?? null,
    p_logged_by_user_id: userId,
    p_logged_by_name: userName,
    p_waste_date: input.waste_date ?? new Date().toISOString().slice(0, 10),
  });

  if (error) {
    console.error("[waste] log_waste RPC failed:", error);
    return { error: error.message };
  }

  // The RPC returns { success, error?, waste_log_id, estimated_cost, new_stock }
  if (data && data.success === false) {
    return { error: data.error || "Failed to log waste" };
  }

  await LogAuditEvent({
    clerkOrgId,
    merchantId,
    locationId,
    action: "logged_waste",
    actionCategory: "inventory",
    severity: "info",
    resourceType: "waste_log",
    resourceId: data?.waste_log_id,
    changes: {
      after: {
        inventory_item_id: input.inventory_item_id,
        quantity: input.quantity,
        reason: input.reason,
        estimated_cost: data?.estimated_cost,
      },
      reason: input.notes,
    },
  });

  return {
    success: true,
    wasteLogId: data?.waste_log_id,
    estimatedCost: data?.estimated_cost,
    newStock: data?.new_stock,
  };
}
