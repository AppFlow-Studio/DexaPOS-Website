"use server";

// ---------------------------------------------------------------------------
// HQ KDS device truth (read-only support tooling, Architecture B).
//
// The board mirror (kds-mirror.ts) reconstructs what the SERVER says a station
// should be showing. It cannot see the screen: a tablet whose socket dropped,
// whose app crashed, or whose cache went stale still produces a perfect mirror
// while the kitchen sees nothing. These actions read the OTHER half -- the
// device-attested `kds_device_events` ledger -- and diff it against
// `kds_routing_log` to classify every complaint.
//
// Every read here goes through a SECURITY DEFINER RPC that derives tenancy
// from the display/order and gates on is_dexapos_admin() (or the owning
// merchant). assertHQPermission("hq.support.view") is the second half of that
// check. See 20260827130000_kds_device_truth.sql for the verdict CASE.
//
// The classification this exists to produce:
//   server routed + device ack                        -> CONFIRMED
//   server routed + arrived, no ack                    -> RENDER_SUSPECT
//   server routed + nothing, item active, dev online   -> NEVER_SHOWED <-- bug
//   server routed + nothing, device offline at fire    -> OFFLINE (expected)
//   no routing log + device event exists               -> GHOST (stale cache)
//
// NO_DEVICE_DATA is NOT a verdict on the device: it means this display has
// never reported at all (the POS emitter has not shipped to it yet), so
// absence of device evidence is not evidence of a fault. Anything user-facing
// built on this must keep saying that.
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertHQPermission } from "@/lib/admin/auth";

export type KdsDeviceTruthVerdict =
  | "NO_DEVICE_DATA"
  | "NOT_ROUTED"
  | "CONFIRMED"
  | "RENDER_SUSPECT"
  | "OFFLINE"
  | "NEVER_SHOWED"
  | "GHOST";

/**
 * One item in a device-truth diff: what the server routed vs what the device
 * reported, plus the resulting verdict.
 *
 * `arrived` / `acked` are booleans folded from the device event ledger for the
 * item (window-scoped for the window RPC, lifetime for the order RPC).
 * `device_online_at_fire` distinguishes "the kitchen was offline" (expected)
 * from "the kitchen was online and still never saw it" (the actual bug).
 */
export interface KdsDeviceTruthItem {
  order_item_id: string;
  order_id: string | null;
  order_number: string | null;
  item_name: string | null;
  kitchen_status: string | null;
  server_outcome: string | null;
  server_fired_at: string | null;
  arrived: boolean;
  acked: boolean;
  device_event_count: number;
  device_online_at_fire: boolean | null;
  has_any_device_data: boolean;
  verdict: KdsDeviceTruthVerdict;
}

export interface KdsDeviceTruthOrder {
  order_id: string;
  merchant_id: string;
  location_id: string;
  has_any_device_data: boolean;
  items: KdsDeviceTruthItem[];
}

/** One raw device event, for the device lane of the truth timeline. */
export interface KdsDeviceTruthEvent {
  order_item_id: string;
  order_id: string | null;
  event_type: string;
  client_event_at: string | null;
  received_at: string;
  clock_skew_ms: number | null;
  app_version: string | null;
}

/** Snapshot metadata for one point in the device truth timeline. */
export interface KdsDeviceSnapshotEntry {
  id: string;
  received_at: string;
  client_captured_at: string | null;
  ticket_count: number;
  item_count: number;
  payload_hash: string;
  clock_skew_ms: number | null;
  app_version: string | null;
}

export interface KdsDisplayTruthWindow {
  kds_display_id: string;
  merchant_id: string;
  location_id: string;
  window_from: string;
  window_to: string;
  has_any_device_data: boolean;
  /** verdict -> count, e.g. { CONFIRMED: 12, NEVER_SHOWED: 1 } */
  summary: Record<string, number>;
  items: KdsDeviceTruthItem[];
  device_events: KdsDeviceTruthEvent[];
  snapshots: KdsDeviceSnapshotEntry[];
}

/** One display row of the rolling 7-day health view. */
export interface KdsDeviceTruthHealthRow {
  merchant_id: string | null;
  location_id: string | null;
  kds_display_id: string | null;
  display_name: string | null;
  routed_items: number | null;
  arrived_items: number | null;
  acked_items: number | null;
  render_suspect_items: number | null;
  unreported_items: number | null;
  ack_rate_pct: number | null;
  device_reporting: boolean | null;
  observed_at: string | null;
}

interface ActionResult<T> {
  success: boolean;
  error: string | null;
  data: T | null;
}

function fail<T>(scope: string, err: unknown): ActionResult<T> {
  console.error(`[${scope}]`, err);
  return {
    success: false,
    error: err instanceof Error ? err.message : `${scope} failed`,
    data: null,
  };
}

/**
 * Per-item routed-vs-seen diff for one order, with the display as the
 * correlation unit (routing log rows carry the display the item went to).
 *
 * This is what a "Device view" tab on the order sheet renders: the server lane
 * (what routing decided) next to the device lane (what the tablet reported it
 * received and painted).
 */
export async function hqGetKdsDeviceTruthForOrder(
  orderId: string
): Promise<ActionResult<KdsDeviceTruthOrder | null>> {
  try {
    await assertHQPermission("hq.support.view");

    if (!orderId) {
      return { success: true, error: null, data: null };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc(
      "get_kds_device_truth_for_order",
      { p_order_id: orderId }
    );

    if (error) throw new Error(error.message);

    return {
      success: true,
      error: null,
      data: (data ?? null) as unknown as KdsDeviceTruthOrder | null,
    };
  } catch (err) {
    return fail("hqGetKdsDeviceTruthForOrder", err);
  }
}

/**
 * Full routed-vs-seen window for one display: per-item verdicts, the raw
 * device-event timeline, snapshot metadata, and an aggregated summary.
 *
 * `fromIso`/`toIso` are ISO timestamps; the RPC enforces from <= to and derives
 * tenancy from the display. Support windows are 1h/6h/24h, so the raw event
 * list stays small enough to ship whole.
 */
export async function hqGetKdsDisplayTruthWindow(
  kdsDisplayId: string,
  fromIso: string,
  toIso: string
): Promise<ActionResult<KdsDisplayTruthWindow | null>> {
  try {
    await assertHQPermission("hq.support.view");

    if (!kdsDisplayId || !fromIso || !toIso) {
      return { success: true, error: null, data: null };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc("get_kds_display_truth_window", {
      p_kds_display_id: kdsDisplayId,
      p_from: fromIso,
      p_to: toIso,
    });

    if (error) throw new Error(error.message);

    return {
      success: true,
      error: null,
      data: (data ?? null) as unknown as KdsDisplayTruthWindow | null,
    };
  } catch (err) {
    return fail("hqGetKdsDisplayTruthWindow", err);
  }
}

/**
 * Rolling seven-day per-display routed/arrived/acked health for one location.
 *
 * v_kds_device_truth_health is security_invoker, so HQ reaches it through the
 * is_dexapos_admin() branch of the kds_device_events policy -- the same way
 * v_kds_routing_health is read on the mirror page.
 *
 * `device_reporting = false` on a row means that display has NEVER reported,
 * so its other columns are not evidence of a fault -- the header cards must
 * keep saying that.
 */
export async function hqGetKdsDeviceTruthHealth(
  locationId: string
): Promise<ActionResult<KdsDeviceTruthHealthRow[]>> {
  try {
    await assertHQPermission("hq.support.view");

    if (!locationId) {
      return { success: true, error: null, data: [] };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("v_kds_device_truth_health")
      .select("*")
      .eq("location_id", locationId);

    if (error) throw new Error(error.message);

    return {
      success: true,
      error: null,
      data: (data ?? []) as KdsDeviceTruthHealthRow[],
    };
  } catch (err) {
    return fail("hqGetKdsDeviceTruthHealth", err);
  }
}
