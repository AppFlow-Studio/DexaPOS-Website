"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// KDS routing traceability (read-only).
//
// Surfaces the routing decision recorded for every fired order item: which
// prep station it resolved to, how that station was resolved, which KDS
// displays it was evaluated against, what rule matched, and where it landed.
// Backed by the tenant-scoped `get_order_routing_trace` RPC, which enforces
// merchant/location access itself (SECURITY DEFINER + user_merchant_id / admin).
// ---------------------------------------------------------------------------

export type KdsRoutingOutcome = "routed" | "skipped" | "dropped";

export type KdsMatchReason =
  | "rule_prep_station"
  | "rule_category_id"
  | "rule_category_name"
  | "rule_order_type"
  | "routing_mode_all"
  | "show_all_items"
  | "fallback_expo"
  | "fallback_blast"
  | "no_rule_match"
  | "no_active_display"
  | "backfill_unknown";

export type KdsPrepStationSource =
  | "item_override"
  | "category_default"
  | "item_column"
  | "none";

export interface OrderRoutingDecision {
  kds_display_id: string | null;
  kds_display_name: string | null;
  outcome: KdsRoutingOutcome;
  match_reason: KdsMatchReason;
  matched_rule_id: string | null;
  matched_rule_type: string | null;
  matched_rule_value: string | null;
  current_kds_status: string | null;
  displays_evaluated: number;
  displays_matched: number;
  fired_at: string | null;
  created_at: string | null;
}

export interface OrderRoutingTraceItem {
  order_item_id: string;
  item_name: string | null;
  category_id: string | null;
  category_name: string | null;
  kitchen_status: string | null;
  resolved_prep_station: string | null;
  prep_station_source: KdsPrepStationSource;
  divergence: boolean;
  routing: OrderRoutingDecision[];
}

export interface OrderRoutingTrace {
  order_id: string;
  order_number: string | null;
  merchant_id: string;
  location_id: string;
  order_type: string | null;
  sent_to_kitchen_at: string | null;
  has_divergence: boolean;
  items: OrderRoutingTraceItem[];
}

/**
 * Returns the KDS routing decision history for one order, or null when the
 * order has no trace / is not accessible. Access control is enforced by the
 * RPC, so callers do not need to pre-resolve the merchant.
 */
export async function GetOrderRoutingTrace(
  orderId: string
): Promise<OrderRoutingTrace | null> {
  if (!orderId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase.rpc("get_order_routing_trace", {
      p_order_id: orderId,
    });

    if (error) {
      // Order-not-accessible is raised as a Postgres exception; treat any
      // failure as "no trace to show" rather than surfacing a hard error in
      // this read-only diagnostic panel.
      console.error("[GetOrderRoutingTrace] RPC error:", error);
      return null;
    }

    return (data as unknown as OrderRoutingTrace | null) ?? null;
  } catch (error) {
    console.error("[GetOrderRoutingTrace] Unexpected error:", error);
    return null;
  }
}
