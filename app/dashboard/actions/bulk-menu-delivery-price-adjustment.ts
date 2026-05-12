"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import { LogAuditEvent } from "./audit-logs";

export type BulkMenuDeliveryOp =
  | "markup_pct"
  | "markup_amt"
  | "set_fixed"
  | "reset";

export type BulkMenuDeliveryRounding = "cent" | "nickel_up" | "ninety_nine_up";

export interface BulkMenuDeliveryChange {
  item_id: string;
  name: string;
  old_price: number | null;
  new_price: number | null;
}

export interface BulkMenuDeliveryResult {
  updated: number;
  skipped: number;
  changes: BulkMenuDeliveryChange[];
}

const MAX_ITEMS = 500;

export async function BulkAdjustMenuItemMenuDeliveryPrices(input: {
  clerkOrgId: string;
  menuId: string;
  locationId: string | null; // null => fan-out to all merchant locations
  itemIds: string[];
  operation: BulkMenuDeliveryOp;
  value: number;
  rounding: BulkMenuDeliveryRounding;
}): Promise<{ data?: BulkMenuDeliveryResult; error?: string }> {
  const { clerkOrgId, menuId, locationId, itemIds, operation, value, rounding } = input;

  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!menuId) return { error: "Menu ID is required" };
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
    "bulk_adjust_menu_item_menu_delivery_prices",
    {
      p_merchant_id: merchant.id,
      p_menu_id: menuId,
      p_location_id: locationId,
      p_item_ids: itemIds,
      p_operation: operation,
      p_value: operation === "reset" ? 0 : value,
      p_rounding: rounding,
      p_actor_user_id: actorUserId,
    },
  );

  if (rpcError) {
    console.error("[BulkAdjustMenuItemMenuDeliveryPrices] RPC error", rpcError);
    return { error: rpcError.message };
  }

  const result = rpcData as unknown as BulkMenuDeliveryResult;

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
      scope: locationId ? "menu_location" : "menu_all_locations",
      menu_id: menuId,
      updated: result.updated,
      skipped: result.skipped,
      item_count: itemIds.length,
    },
  });

  return { data: result };
}
