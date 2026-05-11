"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import { LogAuditEvent } from "./audit-logs";

// Mirrors the bulk POS price action. Operations are online-specific:
// - markup_pct / markup_amt always recompute from the CURRENT card price
// - set_fixed writes the literal value
// - reset clears delivery_price + flips use_delivery_price=false at L1, or
//   nulls custom_delivery_price at L2.
export type BulkDeliveryOp =
  | "markup_pct"
  | "markup_amt"
  | "set_fixed"
  | "reset";

export type BulkDeliveryRounding = "cent" | "nickel_up" | "ninety_nine_up";

export interface BulkDeliveryChange {
  item_id: string;
  name: string;
  old_price: number | null;
  new_price: number | null;
}

export interface BulkDeliveryResult {
  updated: number;
  skipped: number;
  changes: BulkDeliveryChange[];
}

const MAX_ITEMS = 500;

export async function BulkAdjustMenuItemDeliveryPrices(input: {
  clerkOrgId: string;
  locationId: string | null;
  itemIds: string[];
  operation: BulkDeliveryOp;
  value: number;
  rounding: BulkDeliveryRounding;
}): Promise<{ data?: BulkDeliveryResult; error?: string }> {
  const { clerkOrgId, locationId, itemIds, operation, value, rounding } = input;

  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return { error: "Select at least one item" };
  }
  if (itemIds.length > MAX_ITEMS) {
    return { error: `Cannot adjust more than ${MAX_ITEMS} items at once` };
  }
  if (operation !== "reset" && (!Number.isFinite(value) || value < 0)) {
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
    "bulk_adjust_menu_item_delivery_prices",
    {
      p_merchant_id: merchant.id,
      p_location_id: locationId,
      p_item_ids: itemIds,
      p_operation: operation,
      p_value: operation === "reset" ? 0 : value,
      p_rounding: rounding,
      p_actor_user_id: actorUserId,
    },
  );

  if (rpcError) {
    console.error("[BulkAdjustMenuItemDeliveryPrices] RPC error", rpcError);
    return { error: rpcError.message };
  }

  const result = rpcData as unknown as BulkDeliveryResult;

  await LogAuditEvent({
    merchantId: merchant.id,
    locationId: locationId ?? null,
    action: "bulk_delivery_price_adjust",
    actionCategory: "menu",
    severity: "info",
    resourceType: "menu_item",
    changes: {
      after: { changes: result.changes } as Record<string, unknown>,
    },
    metadata: {
      operation,
      value: operation === "reset" ? null : value,
      rounding,
      scope: locationId ? "override" : "base",
      updated: result.updated,
      skipped: result.skipped,
      item_count: itemIds.length,
    },
  });

  return { data: result };
}
