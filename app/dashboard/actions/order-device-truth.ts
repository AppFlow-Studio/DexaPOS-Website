"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// KDS device truth for one order (read-only, merchant-facing).
//
// Surfaces what each kitchen display REPORTED it received and painted for this
// order, diffed against what the server routed. Backed by the tenant-scoped
// `get_kds_device_truth_for_order` RPC, which derives tenancy from the order
// and enforces access itself (SECURITY DEFINER + user_merchant_id / admin) —
// the same contract as `GetOrderRoutingTrace`, so callers need not pre-resolve
// the merchant.
//
// The verdict is the whole point:
//   CONFIRMED       server routed, device acked (it really showed)
//   RENDER_SUSPECT  server routed, device received but never acked
//   NEVER_SHOWED    server routed, device online, device never reported it
//   OFFLINE         server routed while the device was offline (expected)
//   NO_DEVICE_DATA  the display has never reported (emitter not shipped yet)
// ---------------------------------------------------------------------------

export type KdsDeviceTruthVerdict =
  | "NO_DEVICE_DATA"
  | "NOT_ROUTED"
  | "CONFIRMED"
  | "RENDER_SUSPECT"
  | "OFFLINE"
  | "NEVER_SHOWED"
  | "GHOST";

export interface OrderDeviceTruthItem {
  order_item_id: string;
  item_name: string | null;
  kds_display_id: string | null;
  kds_display_name: string | null;
  server_outcome: string | null;
  server_fired_at: string | null;
  kitchen_status: string | null;
  arrived_at: string | null;
  ack_at: string | null;
  bumped_at: string | null;
  device_online_at_fire: boolean | null;
  verdict: KdsDeviceTruthVerdict;
}

export interface OrderDeviceTruth {
  order_id: string;
  merchant_id: string;
  location_id: string;
  has_any_device_data: boolean;
  items: OrderDeviceTruthItem[];
}

/**
 * Returns the device-truth diff for one order, or null when the order has no
 * trace / is not accessible. Access control is enforced by the RPC, so callers
 * do not need to pre-resolve the merchant.
 */
export async function GetOrderDeviceTruth(
  orderId: string
): Promise<OrderDeviceTruth | null> {
  if (!orderId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase.rpc(
      "get_kds_device_truth_for_order",
      { p_order_id: orderId }
    );

    if (error) {
      // Order-not-accessible is raised as a Postgres exception; treat any
      // failure as "no device truth to show" rather than surfacing a hard
      // error in this read-only diagnostic panel.
      console.error("[GetOrderDeviceTruth] RPC error:", error);
      return null;
    }

    return (data as unknown as OrderDeviceTruth | null) ?? null;
  } catch (error) {
    console.error("[GetOrderDeviceTruth] Unexpected error:", error);
    return null;
  }
}
