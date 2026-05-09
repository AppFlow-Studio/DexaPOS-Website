"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import { LogAuditEvent } from "./audit-logs";

export type BulkPriceOp =
  | "increase_pct"
  | "decrease_pct"
  | "increase_amt"
  | "decrease_amt"
  | "set_fixed";

export type BulkPriceRounding = "cent" | "nickel_up" | "ninety_nine_up";

export interface BulkPriceChange {
  item_id: string;
  name: string;
  old_price: number;
  new_price: number;
}

export interface BulkPriceResult {
  updated: number;
  skipped: number;
  changes: BulkPriceChange[];
}

const MAX_ITEMS = 500;

export async function BulkAdjustMenuItemPrices(input: {
  clerkOrgId: string;
  locationId: string | null; // null => base price (all locations)
  itemIds: string[];
  operation: BulkPriceOp;
  value: number;
  rounding: BulkPriceRounding;
}): Promise<{ data?: BulkPriceResult; error?: string }> {
  const { clerkOrgId, locationId, itemIds, operation, value, rounding } = input;

  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return { error: "Select at least one item" };
  }
  if (itemIds.length > MAX_ITEMS) {
    return { error: `Cannot adjust more than ${MAX_ITEMS} items at once` };
  }
  if (!Number.isFinite(value) || value < 0) {
    return { error: "Value must be a non-negative number" };
  }

  const supabase = createServerSupabaseClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  if (merchantError || !merchant) return { error: "Merchant not found" };

  const user = await currentUser();
  const actorUserId = user?.id ?? null;

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "bulk_adjust_menu_item_prices",
    {
      p_merchant_id: merchant.id,
      p_location_id: locationId,
      p_item_ids: itemIds,
      p_operation: operation,
      p_value: value,
      p_rounding: rounding,
      p_actor_user_id: actorUserId,
    },
  );

  if (rpcError) {
    console.error("[BulkAdjustMenuItemPrices] RPC error", rpcError);
    return { error: rpcError.message };
  }

  const result = rpcData as unknown as BulkPriceResult;

  // One audit row per bulk op — full changes payload enables one-step undo later.
  await LogAuditEvent({
    merchantId: merchant.id,
    locationId: locationId ?? null,
    action: "bulk_price_adjust",
    actionCategory: "menu",
    severity: "info",
    resourceType: "menu_item",
    changes: {
      after: { changes: result.changes } as Record<string, unknown>,
    },
    metadata: {
      operation,
      value,
      rounding,
      scope: locationId ? "override" : "base",
      updated: result.updated,
      skipped: result.skipped,
      item_count: itemIds.length,
    },
  });

  return { data: result };
}
