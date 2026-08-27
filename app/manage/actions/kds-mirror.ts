"use server";

// ---------------------------------------------------------------------------
// HQ KDS board mirror (read-only support tooling).
//
// Every read here goes through an hq_* RPC that gates on is_dexapos_admin().
// The assertHQPermission("hq.support.view") calls below are the second half of
// that check, not the only one: get_kds_tickets_v3 is SECURITY DEFINER with no
// tenancy predicate of its own, so the database-side gate is what actually
// stops a non-HQ session projecting an arbitrary location's board.
//
// The mirror reconstructs what the SERVER says a station should be showing. It
// is not proof of what the tablet rendered -- a dropped socket or a stale cache
// produces a perfect mirror and a blank kitchen screen. Anything user-facing
// built on this must say so.
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertHQPermission } from "@/lib/admin/auth";

export interface KdsMirrorModifier {
  modifier_name: string | null;
  modifier_group_name: string | null;
  price_modifier: number | null;
  is_no: boolean;
}

export interface KdsMirrorItem {
  id: string;
  name: string | null;
  quantity: number;
  seat_number: number | null;
  kitchen_status: string;
  special_instructions: string | null;
  category_name: string | null;
  category_id: string | null;
  menu_name: string | null;
  menu_id: string | null;
  prep_station: string | null;
  rush: boolean;
  is_prioritized: boolean;
  is_to_go: boolean;
  fire_time: string | null;
  is_voided: boolean;
  acknowledged: boolean;
  is_refunded: boolean;
  refunded_quantity: number;
  modifiers: KdsMirrorModifier[];
}

/**
 * One ticket card as get_kds_tickets_v3 projects it.
 *
 * `status` is the board column: 'pending' | 'cooking' | 'ready' | 'done'.
 * Note that it is NOT the same vocabulary as an item's `kitchen_status`
 * ('sent' | 'preparing' | 'ready' | 'served') -- v3 derives the ticket status
 * from the aggregate of its items, and a ticket whose items are all 'ready'
 * can still read 'pending' if the KDS rows were never bumped. That divergence
 * is exactly the anomaly this tool exists to show.
 *
 * `ticket_id` is NOT stable across environments (documented staging/prod
 * millisecond-vs-second drift). Correlate on order_item_id.
 */
export interface KdsMirrorTicket {
  ticket_id: string;
  order_id: string;
  db_order_id: string;
  order_number: string | null;
  display_number: string | null;
  course_number: number;
  status: "pending" | "cooking" | "ready" | "done";
  order_type: string | null;
  order_source: string | null;
  delivery_platform: string | null;
  platform_order_number: string | null;
  server_id: string | null;
  server_name: string | null;
  table_name: string | null;
  customer_name: string | null;
  order_notes: string | null;
  start_time: string | null;
  ready_time: string | null;
  done_time: string | null;
  item_count: number;
  any_rush: boolean;
  prioritized: boolean;
  session_id: string | null;
  items: KdsMirrorItem[];
}

/**
 * A KDS display's identity, routing config, and the layout config the mirror
 * needs to draw the station the way the station draws itself.
 *
 * Fidelity notes, because not every flag here is one the mirror should act on:
 * - `show_server_name` is applied SERVER-side inside get_kds_tickets_v3, which
 *   nulls `server_name` when it is false. The mirror inherits that through the
 *   RPC and must not re-apply it.
 * - `show_order_notes` is applied CLIENT-side on the tablet, so the mirror has
 *   to apply it itself.
 * - `alert_minutes`, `warning_minutes` and `show_allergy_flags` are stored and
 *   plumbed into the POS config object but are not consumed by any tablet
 *   rendering today. They are surfaced in the config readout only; inventing
 *   colouring the kitchen cannot actually see would make the mirror lie.
 */
export interface KdsDisplaySummary {
  id: string;
  display_name: string;
  station_id: string | null;
  merchant_id: string;
  location_id: string;
  is_active: boolean;
  routing_mode: string | null;
  show_all_items: boolean;
  display_mode: string | null;
  display_color: string | null;
  columns: number;
  font_scale: number;
  show_order_notes: boolean;
  show_server_name: boolean;
  show_order_source: boolean;
  show_allergy_flags: boolean;
  alert_minutes: number | null;
  warning_minutes: number | null;
  auto_bump_minutes: number | null;
  /** '3-step' shows a Pending tab; '2-step' hides it and starts on Cooking. */
  kds_workflow_mode: string;
}

export interface KdsBoardSnapshotIndexEntry {
  id: string;
  captured_at: string;
  reason: "item_arrived" | "item_ready" | "item_served" | "manual";
  order_id: string | null;
  ticket_count: number;
  item_count: number;
  board_hash: string;
}

export interface KdsBoardSnapshotDetail extends KdsBoardSnapshotIndexEntry {
  location_id: string;
  kds_display_id: string;
  board: KdsMirrorTicket[];
}

export interface KdsRoutingHealth {
  merchant_id: string;
  location_id: string;
  items_fired: number;
  items_dropped: number;
  items_routed_by_fallback: number;
  partial_sends: number;
  status_divergence_count: number;
  observed_at: string;
}

export interface SupportMerchantOption {
  id: string;
  name: string;
  dba_name: string | null;
}

export interface SupportLocationOption {
  id: string;
  name: string;
  city: string | null;
  is_active: boolean;
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
 * PostgREST `or=` takes a comma-separated filter list, so a raw query
 * containing , ( ) or a wildcard would break out of the filter it is embedded
 * in. Strip those rather than escaping: this is a name search box, and none of
 * them are meaningful in a merchant name.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()%*\\]/g, " ").trim();
}

/**
 * Merchant search for the mirror picker.
 *
 * Deliberately search-driven and capped rather than "select all merchants":
 * the platform is multi-tenant and this list only grows. An empty query
 * returns the first page alphabetically so the dropdown is useful on open.
 */
export async function hqSearchSupportMerchants(
  query: string,
  limit = 20
): Promise<ActionResult<SupportMerchantOption[]>> {
  try {
    await assertHQPermission("hq.support.view");

    const supabase = createServerSupabaseClient();
    const term = sanitizeSearchTerm(query ?? "");
    const cappedLimit = Math.min(Math.max(limit, 1), 50);

    let request = supabase
      .from("merchants")
      .select("id, name, dba_name")
      .order("name", { ascending: true })
      .limit(cappedLimit);

    if (term.length > 0) {
      request = request.or(`name.ilike.%${term}%,dba_name.ilike.%${term}%`);
    }

    const { data, error } = await request;

    if (error) throw new Error(error.message);

    return {
      success: true,
      error: null,
      data: (data ?? []) as SupportMerchantOption[],
    };
  } catch (err) {
    return fail("hqSearchSupportMerchants", err);
  }
}

/**
 * Resolves one merchant by id, so the picker can label the current selection
 * even when it falls outside the active search results (or the page was opened
 * from a deep link and nothing has been searched yet).
 */
export async function hqGetSupportMerchantById(
  merchantId: string
): Promise<ActionResult<SupportMerchantOption | null>> {
  try {
    await assertHQPermission("hq.support.view");

    if (!merchantId) {
      return { success: true, error: null, data: null };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("merchants")
      .select("id, name, dba_name")
      .eq("id", merchantId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return {
      success: true,
      error: null,
      data: (data ?? null) as SupportMerchantOption | null,
    };
  } catch (err) {
    return fail("hqGetSupportMerchantById", err);
  }
}

/**
 * Locations for one merchant. Gated on hq.support.view rather than
 * hq.merchant.view so a support-only role can reach the mirror.
 */
export async function hqGetSupportMerchantLocations(
  merchantId: string
): Promise<ActionResult<SupportLocationOption[]>> {
  try {
    await assertHQPermission("hq.support.view");

    if (!merchantId) {
      return { success: true, error: null, data: [] };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, city, is_active")
      .eq("merchant_id", merchantId)
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);

    return {
      success: true,
      error: null,
      data: (data ?? []) as SupportLocationOption[],
    };
  } catch (err) {
    return fail("hqGetSupportMerchantLocations", err);
  }
}

/**
 * KDS displays configured at a location, including the two settings that
 * explain most "the wrong things are on my screen" reports: show_all_items
 * and routing_mode.
 */
export async function hqGetLocationKdsDisplays(
  locationId: string
): Promise<ActionResult<KdsDisplaySummary[]>> {
  try {
    await assertHQPermission("hq.support.view");

    if (!locationId) {
      return { success: true, error: null, data: [] };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc(
      "hq_get_location_kds_displays_v1",
      { p_location_id: locationId }
    );

    if (error) throw new Error(error.message);

    return {
      success: true,
      error: null,
      data: (data ?? []) as unknown as KdsDisplaySummary[],
    };
  } catch (err) {
    return fail("hqGetLocationKdsDisplays", err);
  }
}

/**
 * The live board for one station, byte-identical to what the tablet fetches.
 *
 * Pass kdsDisplayId to mirror a single station. Passing null mirrors the
 * whole location, which is useful for answering "did this reach ANY display?"
 * but is not what any physical screen shows.
 */
export async function hqGetKdsBoardMirror(
  locationId: string,
  kdsDisplayId: string | null
): Promise<ActionResult<KdsMirrorTicket[]>> {
  try {
    await assertHQPermission("hq.support.view");

    if (!locationId) {
      return { success: true, error: null, data: [] };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc("hq_get_kds_board_mirror_v1", {
      p_location_id: locationId,
      p_kds_display_id: kdsDisplayId,
    });

    if (error) throw new Error(error.message);

    return {
      success: true,
      error: null,
      data: (data ?? []) as unknown as KdsMirrorTicket[],
    };
  } catch (err) {
    return fail("hqGetKdsBoardMirror", err);
  }
}

/**
 * Snapshot index for the replay scrubber. Metadata only -- boards are whole
 * jsonb documents and a busy hour would be megabytes over the wire.
 */
export async function hqGetKdsBoardSnapshots(
  kdsDisplayId: string,
  fromIso: string | null,
  toIso: string | null,
  limit = 200
): Promise<ActionResult<KdsBoardSnapshotIndexEntry[]>> {
  try {
    await assertHQPermission("hq.support.view");

    if (!kdsDisplayId) {
      return { success: true, error: null, data: [] };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc("hq_get_kds_board_snapshots_v1", {
      p_kds_display_id: kdsDisplayId,
      p_from: fromIso,
      p_to: toIso,
      p_limit: limit,
    });

    if (error) throw new Error(error.message);

    return {
      success: true,
      error: null,
      data: (data ?? []) as unknown as KdsBoardSnapshotIndexEntry[],
    };
  } catch (err) {
    return fail("hqGetKdsBoardSnapshots", err);
  }
}

/**
 * One full snapshot, including the stored board, for the scrubber's current
 * position.
 */
export async function hqGetKdsBoardSnapshot(
  snapshotId: string
): Promise<ActionResult<KdsBoardSnapshotDetail | null>> {
  try {
    await assertHQPermission("hq.support.view");

    if (!snapshotId) {
      return { success: true, error: null, data: null };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc("hq_get_kds_board_snapshot_v1", {
      p_snapshot_id: snapshotId,
    });

    if (error) throw new Error(error.message);

    return {
      success: true,
      error: null,
      data: (data ?? null) as unknown as KdsBoardSnapshotDetail | null,
    };
  } catch (err) {
    return fail("hqGetKdsBoardSnapshot", err);
  }
}

/**
 * Rolling seven-day routing health for one location, used to hint whether a
 * complaint is likely routing-side before anyone reads the board.
 * v_kds_routing_health is security_invoker, so HQ reaches it through the
 * is_dexapos_admin() branch of the kds_routing_log policy.
 */
export async function hqGetKdsRoutingHealth(
  locationId: string
): Promise<ActionResult<KdsRoutingHealth | null>> {
  try {
    await assertHQPermission("hq.support.view");

    if (!locationId) {
      return { success: true, error: null, data: null };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("v_kds_routing_health")
      .select("*")
      .eq("location_id", locationId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return {
      success: true,
      error: null,
      data: (data ?? null) as unknown as KdsRoutingHealth | null,
    };
  } catch (err) {
    return fail("hqGetKdsRoutingHealth", err);
  }
}
