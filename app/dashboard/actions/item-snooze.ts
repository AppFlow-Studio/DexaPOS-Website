"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";
import {
  pushMenuToOrderOut,
  pushMenuToConnectedChannels,
  resolvePrimaryOnlineMenu,
} from "./orderout";

// ============================================================================
// 86ing (out-of-stock snooze) — item + modifier, per location.
//
// Writes ONLY snoozed_until/snooze_reason via the set_*_snooze_v1 RPCs — never
// is_available — so a snooze never collides with a manager's deliberate hide.
// Because get_menu_with_categories folds snooze into effective_availability,
// the POS, storefront, and OrderOut menu transform all respect 86ing for free.
//
// snoozedUntil contract:
//   null         -> clear / un-86
//   ISO string   -> snoozed until that instant (timed)
//   "infinity"   -> snoozed until manually cleared
// ============================================================================

type SnoozeUntil = string | null; // ISO | "infinity" | null

interface SnoozeResult {
  success: boolean;
  error?: string;
}

function snoozeMode(snoozedUntil: SnoozeUntil): "timed" | "until_manual" | "cleared" {
  if (snoozedUntil === null) return "cleared";
  if (snoozedUntil === "infinity") return "until_manual";
  return "timed";
}

/**
 * Best-effort OrderOut re-push so 86ing reaches connected delivery apps
 * (UberEats/DoorDash/Grubhub) within seconds. Availability-only change, so we
 * bypass the manual cooldown. Never throws — a failed re-push must not fail the
 * snooze itself. NOTE: POS-direct RPC calls do not pass through here; that
 * propagation path is a documented follow-up.
 */
async function triggerOrderOutResyncForLocation(
  clerkOrgId: string,
  locationId: string,
): Promise<void> {
  try {
    const supabase = createServerSupabaseClient();

    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select("id, status")
      .eq("location_id", locationId)
      .maybeSingle();

    if (!restaurant || restaurant.status !== "active") return;

    // OrderOut serves one menu per store — target only the canonical online menu.
    const online = await resolvePrimaryOnlineMenu(supabase, restaurant.id);
    if (!online) return;

    // 1) Update the menu OrderOut stores so it reflects the 86. This works even
    //    when no delivery channels are connected yet, so the corrected menu is
    //    ready to fan out later. Awaited-but-swallowed (best-effort).
    await pushMenuToOrderOut({ clerkOrgId, menuId: online.menu_id, locationId });

    // 2) Best-effort fan-out to any connected channels (no-ops if none). skipCooldown
    //    so a burst of 86s all propagate.
    await pushMenuToConnectedChannels({
      clerkOrgId,
      menuId: online.menu_id,
      locationId,
      skipCooldown: true,
    });
  } catch (e) {
    console.warn("[item-snooze] OrderOut resync (non-fatal):", e);
  }
}

// ----------------------------------------------------------------------------
// Item snooze
// ----------------------------------------------------------------------------

export async function snoozeItem(
  clerkOrgId: string,
  menuItemId: string,
  locationId: string,
  snoozedUntil: SnoozeUntil,
  reason?: string,
): Promise<SnoozeResult> {
  if (!locationId || locationId === "all") {
    return { success: false, error: "A specific location is required to 86 an item." };
  }

  const supabase = createServerSupabaseClient();

  // Prior snooze state for the audit diff.
  const { data: prev } = await supabase
    .from("location_item_overrides")
    .select("snoozed_until")
    .eq("location_id", locationId)
    .eq("menu_item_id", menuItemId)
    .maybeSingle();

  const { error } = await supabase.rpc("set_item_snooze_v1", {
    p_location_id: locationId,
    p_menu_item_id: menuItemId,
    p_snoozed_until: snoozedUntil,
    p_reason: reason ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const { data: item } = await supabase
    .from("menu_items")
    .select("name")
    .eq("id", menuItemId)
    .maybeSingle();

  const itemName = item?.name ?? menuItemId;

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: snoozedUntil ? `86'd Item: ${itemName}` : `Restored Item: ${itemName}`,
    actionCategory: "menu",
    severity: "info",
    resourceType: "menu_item",
    resourceId: menuItemId,
    resourceName: itemName,
    changes: {
      before: { snoozed_until: prev?.snoozed_until ?? null },
      after: { snoozed_until: snoozedUntil },
      reason,
    },
    metadata: { snooze_mode: snoozeMode(snoozedUntil), source: "dashboard" },
  });

  await triggerOrderOutResyncForLocation(clerkOrgId, locationId);

  return { success: true };
}

// ----------------------------------------------------------------------------
// Modifier snooze
// ----------------------------------------------------------------------------

export async function snoozeModifier(
  clerkOrgId: string,
  modifierGroupItemId: string,
  locationId: string,
  snoozedUntil: SnoozeUntil,
  reason?: string,
): Promise<SnoozeResult> {
  if (!locationId || locationId === "all") {
    return { success: false, error: "A specific location is required to 86 a modifier." };
  }

  const supabase = createServerSupabaseClient();

  const { data: prev } = await supabase
    .from("location_modifier_item_overrides")
    .select("snoozed_until")
    .eq("location_id", locationId)
    .eq("modifier_group_item_id", modifierGroupItemId)
    .maybeSingle();

  const { error } = await supabase.rpc("set_modifier_snooze_v1", {
    p_location_id: locationId,
    p_modifier_group_item_id: modifierGroupItemId,
    p_snoozed_until: snoozedUntil,
    p_reason: reason ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const { data: modifier } = await supabase
    .from("modifier_group_items")
    .select("name")
    .eq("id", modifierGroupItemId)
    .maybeSingle();

  const modifierName = modifier?.name ?? modifierGroupItemId;

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: snoozedUntil
      ? `86'd Modifier: ${modifierName}`
      : `Restored Modifier: ${modifierName}`,
    actionCategory: "menu",
    severity: "info",
    resourceType: "modifier_group_item",
    resourceId: modifierGroupItemId,
    resourceName: modifierName,
    changes: {
      before: { snoozed_until: prev?.snoozed_until ?? null },
      after: { snoozed_until: snoozedUntil },
      reason,
    },
    metadata: { snooze_mode: snoozeMode(snoozedUntil), source: "dashboard" },
  });

  await triggerOrderOutResyncForLocation(clerkOrgId, locationId);

  return { success: true };
}

// ----------------------------------------------------------------------------
// Duration presets — computed server-side (never trust client clocks).
// ----------------------------------------------------------------------------

/** ISO instant for end-of-day (23:59:59.999) in the given IANA timezone. */
function localEndOfDayISO(timeZone: string): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(
    fmt.formatToParts(now).map((x) => [x.type, x.value]),
  ) as Record<string, string>;

  // Offset (ms the tz is ahead of UTC) = wall-clock-as-if-UTC minus real UTC.
  const wallAsUTC = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour === 24 ? 0 : +p.hour,
    +p.minute,
    +p.second,
  );
  const offset = wallAsUTC - now.getTime();
  const endWallAsUTC = Date.UTC(+p.year, +p.month - 1, +p.day, 23, 59, 59, 999);
  return new Date(endWallAsUTC - offset).toISOString();
}

async function locationTimezone(locationId: string): Promise<string> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("locations")
    .select("timezone")
    .eq("id", locationId)
    .maybeSingle();
  return data?.timezone || "America/New_York";
}

/** 86 an item until the end of the location's business day. */
export async function snoozeItemUntilEndOfDay(
  clerkOrgId: string,
  menuItemId: string,
  locationId: string,
  reason?: string,
): Promise<SnoozeResult> {
  const tz = await locationTimezone(locationId);
  return snoozeItem(clerkOrgId, menuItemId, locationId, localEndOfDayISO(tz), reason);
}

/** 86 an item for a fixed number of hours from now. */
export async function snoozeItemForHours(
  clerkOrgId: string,
  menuItemId: string,
  locationId: string,
  hours: number,
  reason?: string,
): Promise<SnoozeResult> {
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  return snoozeItem(clerkOrgId, menuItemId, locationId, until, reason);
}

/** 86 an item until manually restored. */
export async function snoozeItemUntilManual(
  clerkOrgId: string,
  menuItemId: string,
  locationId: string,
  reason?: string,
): Promise<SnoozeResult> {
  return snoozeItem(clerkOrgId, menuItemId, locationId, "infinity", reason);
}

/** Clear an item's 86 (restore). */
export async function unsnoozeItem(
  clerkOrgId: string,
  menuItemId: string,
  locationId: string,
): Promise<SnoozeResult> {
  return snoozeItem(clerkOrgId, menuItemId, locationId, null);
}

/** Clear a modifier's 86 (restore). */
export async function unsnoozeModifier(
  clerkOrgId: string,
  modifierGroupItemId: string,
  locationId: string,
): Promise<SnoozeResult> {
  return snoozeModifier(clerkOrgId, modifierGroupItemId, locationId, null);
}

// ----------------------------------------------------------------------------
// Read: active snoozes for the dashboard "86'd Items" view.
// ----------------------------------------------------------------------------

export interface ActiveSnoozeItem {
  kind: "item";
  menu_item_id: string;
  name: string;
  image: string | null;
  snoozed_until: string;
  snooze_reason: string | null;
  updated_at: string;
}

export interface ActiveSnoozeModifier {
  kind: "modifier";
  modifier_group_item_id: string;
  name: string;
  group_name: string;
  snoozed_until: string;
  snooze_reason: string | null;
  updated_at: string;
}

export interface ActiveSnoozes {
  items: ActiveSnoozeItem[];
  modifiers: ActiveSnoozeModifier[];
}

export async function getActiveSnoozes(
  locationId: string,
): Promise<{ success: boolean; data?: ActiveSnoozes; error?: string }> {
  if (!locationId || locationId === "all") {
    return { success: false, error: "A specific location is required." };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_active_snoozes", {
    p_location_id: locationId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: (data as ActiveSnoozes) ?? { items: [], modifiers: [] },
  };
}

/**
 * Current snooze state for a single item at a location. Mirrors the
 * GetItemIsPopular/GetItemIsNew per-location read pattern used by the item
 * editor, so the snooze control can self-fetch without threading snoozed_until
 * through every page's item mapping.
 */
export async function getItemSnooze(
  menuItemId: string,
  locationId: string,
): Promise<{ snoozed_until: string | null; snooze_reason: string | null }> {
  if (!menuItemId || !locationId || locationId === "all") {
    return { snoozed_until: null, snooze_reason: null };
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("location_item_overrides")
    .select("snoozed_until, snooze_reason")
    .eq("location_id", locationId)
    .eq("menu_item_id", menuItemId)
    .maybeSingle();

  return {
    snoozed_until: data?.snoozed_until ?? null,
    snooze_reason: data?.snooze_reason ?? null,
  };
}
