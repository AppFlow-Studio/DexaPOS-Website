"use server";

import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { LogAuditEvent } from "./audit-logs";
import {
  pushMenuToOrderOut,
  pushMenuToConnectedChannels,
  resolvePrimaryOnlineMenu,
  suspendOrderOutItem,
} from "./orderout";
import { setItemAvailability } from "./menu-items-rpc";

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
 * Full-menu OrderOut re-push so 86ing reaches connected delivery apps
 * (UberEats/DoorDash/Grubhub). Rebuilds and re-pushes the whole menu, then fans
 * out to channels. This is the heavy path — used for modifiers (no per-modifier
 * suspension endpoint exists) and as the item fast-path's fallback when the menu
 * isn't live on OrderOut yet. Availability-only change, so we bypass the manual
 * cooldown. Never throws — a failed re-push must not fail the snooze itself.
 * NOTE: POS-direct RPC calls do not pass through here; that propagation path is a
 * documented follow-up.
 */
async function triggerOrderOutFullResync(
  clerkOrgId: string,
  locationId: string,
  internal = false,
): Promise<void> {
  try {
    const supabase = internal
      ? createServiceRoleClient()
      : createServerSupabaseClient();

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
    await pushMenuToOrderOut({ clerkOrgId, menuId: online.menu_id, locationId, internal });

    // 2) Best-effort fan-out to any connected channels (no-ops if none). skipCooldown
    //    so a burst of 86s all propagate.
    await pushMenuToConnectedChannels({
      clerkOrgId,
      menuId: online.menu_id,
      locationId,
      skipCooldown: true,
      internal,
    });
  } catch (e) {
    console.warn("[item-snooze] OrderOut full resync (non-fatal):", e);
  }
}

/**
 * Item 86 fast-path: a single surgical per-item suspension PUT instead of a full
 * menu rebuild + channel fan-out. Falls back to a full resync only when the menu
 * isn't live on OrderOut yet (skipped) or the surgical call fails, so out-of-stock
 * still propagates. Best-effort — never throws.
 */
async function triggerOrderOutItemSuspension(
  clerkOrgId: string,
  locationId: string,
  menuItemId: string,
  snoozedUntil: SnoozeUntil,
  internal = false,
): Promise<void> {
  try {
    const res = await suspendOrderOutItem({
      clerkOrgId,
      locationId,
      menuItemId,
      snoozedUntil,
      internal,
    });

    // Surgical path unavailable (no live menu) or errored — stage via full push so
    // the 86 still reaches OrderOut with suspension_info embedded in the payload.
    if (!res.success) {
      await triggerOrderOutFullResync(clerkOrgId, locationId, internal);
      return;
    }

    // Suspension is staged on OrderOut. Best-effort fan-out so the "Sold Out"
    // reaches the connected marketplaces promptly (skipCooldown for a burst of
    // 86s). A "no connected channels" result is a normal no-op here, NOT a
    // failure — never fall back to a full resync or surface an error for it.
    if (res.menuId) {
      const fan = await pushMenuToConnectedChannels({
        clerkOrgId,
        menuId: res.menuId,
        locationId,
        skipCooldown: true,
        internal,
      });
      if (!fan.success) {
        console.info(
          "[item-snooze] channel fan-out after suspension skipped (non-fatal):",
          fan.error,
        );
      }
    }
  } catch (e) {
    console.warn("[item-snooze] OrderOut item suspension (non-fatal):", e);
    await triggerOrderOutFullResync(clerkOrgId, locationId, internal);
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

  // Couple availability with 86 (product decision): marking out of stock also
  // turns the item unavailable at this location; restore turns it back on. Scoped
  // to the same location as the snooze (L2). Best-effort — the snooze already
  // succeeded, so a hiccup here shouldn't fail the whole action.
  try {
    const availRes = await setItemAvailability(menuItemId, !snoozedUntil, {
      locationId,
    });
    if (availRes && availRes.success === false) {
      console.warn("[item-snooze] availability coupling failed:", availRes.error);
    }
  } catch (e) {
    console.warn("[item-snooze] availability coupling threw (non-fatal):", e);
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

  // OrderOut propagation runs AFTER the response is sent — the DB write above is
  // already durable, so the 86 persists (and the UI reflects it optimistically)
  // without waiting on the delivery-app round-trip. `internal` (service role) so
  // it doesn't depend on the request's Clerk auth context surviving into after().
  after(() =>
    triggerOrderOutItemSuspension(clerkOrgId, locationId, menuItemId, snoozedUntil, true),
  );

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

  // Modifiers have no per-item OrderOut suspension endpoint (items-only), so a
  // modifier 86 still requires a full menu resync. Follow-up: a dedicated
  // modifier-availability flow once OrderOut exposes one. Runs post-response so
  // the request isn't blocked on the heavy re-push.
  after(() => triggerOrderOutFullResync(clerkOrgId, locationId, true));

  return { success: true };
}

// ----------------------------------------------------------------------------
// Modifier GROUP snooze — 86 a whole group by fanning out to all its options.
// One atomic RPC (set_modifier_group_snooze_v1), one audit entry, one resync.
// No group-level snooze column: per-option snooze already folds into
// get_menu_with_categories, so this reaches POS/storefront/OrderOut for free.
// ----------------------------------------------------------------------------

export async function snoozeModifierGroup(
  clerkOrgId: string,
  modifierGroupId: string,
  locationId: string,
  snoozedUntil: SnoozeUntil,
  reason?: string,
): Promise<SnoozeResult> {
  if (!locationId || locationId === "all") {
    return {
      success: false,
      error: "A specific location is required to 86 a modifier group.",
    };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase.rpc("set_modifier_group_snooze_v1", {
    p_location_id: locationId,
    p_modifier_group_id: modifierGroupId,
    p_snoozed_until: snoozedUntil,
    p_reason: reason ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const { data: group } = await supabase
    .from("modifier_groups")
    .select("name")
    .eq("id", modifierGroupId)
    .maybeSingle();

  const groupName = group?.name ?? modifierGroupId;

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: snoozedUntil
      ? `86'd Modifier Group: ${groupName}`
      : `Restored Modifier Group: ${groupName}`,
    actionCategory: "menu",
    severity: "info",
    resourceType: "modifier_group",
    resourceId: modifierGroupId,
    resourceName: groupName,
    changes: {
      after: { snoozed_until: snoozedUntil },
      reason,
    },
    metadata: {
      snooze_mode: snoozeMode(snoozedUntil),
      source: "dashboard",
      scope: "group",
    },
  });

  after(() => triggerOrderOutFullResync(clerkOrgId, locationId, true));

  return { success: true };
}

/** Clear a modifier group's 86 (restore all its options). */
export async function unsnoozeModifierGroup(
  clerkOrgId: string,
  modifierGroupId: string,
  locationId: string,
): Promise<SnoozeResult> {
  return snoozeModifierGroup(clerkOrgId, modifierGroupId, locationId, null);
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

// ----------------------------------------------------------------------------
// Batch item 86 — one RPC write + one OrderOut resync for N items, so bulk
// out-of-stock doesn't fan out into N slow requests + N delivery re-pushes.
// ----------------------------------------------------------------------------

type BatchDuration =
  | { kind: "end_of_day" }
  | { kind: "hours"; hours: number }
  | { kind: "until_manual" }
  | { kind: "until"; iso: string };

async function resolveDurationIso(
  duration: BatchDuration,
  locationId: string,
): Promise<string> {
  switch (duration.kind) {
    case "until_manual":
      return "infinity";
    case "hours":
      return new Date(Date.now() + duration.hours * 3600_000).toISOString();
    case "until":
      return duration.iso;
    case "end_of_day":
      return localEndOfDayISO(await locationTimezone(locationId));
  }
}

/**
 * 86 (or, with snoozedUntil=null, restore) many items at a location in a single
 * statement. Availability coupling is folded into the RPC so it's atomic, and the
 * statement-level resync trigger fires ONE OrderOut re-push for the whole batch.
 */
async function setItemsSnoozeBatch(
  clerkOrgId: string,
  menuItemIds: string[],
  locationId: string,
  snoozedUntil: SnoozeUntil,
  reason?: string,
): Promise<SnoozeResult> {
  if (!locationId || locationId === "all") {
    return { success: false, error: "A specific location is required to 86 items." };
  }
  if (menuItemIds.length === 0) {
    return { success: true };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase.rpc("set_items_snooze_batch_v1", {
    p_location_id: locationId,
    p_menu_item_ids: menuItemIds,
    p_snoozed_until: snoozedUntil,
    p_reason: reason ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: snoozedUntil
      ? `86'd ${menuItemIds.length} Items`
      : `Restored ${menuItemIds.length} Items`,
    actionCategory: "menu",
    severity: "info",
    resourceType: "menu_item",
    resourceName: `${menuItemIds.length} items`,
    changes: {
      after: { snoozed_until: snoozedUntil, menu_item_ids: menuItemIds },
      reason,
    },
    metadata: {
      snooze_mode: snoozeMode(snoozedUntil),
      source: "dashboard",
      scope: "batch",
      count: menuItemIds.length,
    },
  });

  // One resync for the whole batch (post-response). The statement-level trigger
  // also debounces to one push; this is the belt-and-suspenders in-request path.
  after(() => triggerOrderOutFullResync(clerkOrgId, locationId, true));

  return { success: true };
}

/** Batch 86: mark many items out of stock with a shared duration. */
export async function snoozeItemsBatch(
  clerkOrgId: string,
  menuItemIds: string[],
  locationId: string,
  duration: BatchDuration,
  reason?: string,
): Promise<SnoozeResult> {
  const snoozedUntil = await resolveDurationIso(duration, locationId);
  return setItemsSnoozeBatch(clerkOrgId, menuItemIds, locationId, snoozedUntil, reason);
}

/** Batch restore: clear the 86 on many items. */
export async function unsnoozeItemsBatch(
  clerkOrgId: string,
  menuItemIds: string[],
  locationId: string,
): Promise<SnoozeResult> {
  return setItemsSnoozeBatch(clerkOrgId, menuItemIds, locationId, null);
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
// Modifier duration presets — parity with the item presets above. The rich
// duration picker in the modifier toggles dispatches to these.
// ----------------------------------------------------------------------------

/** 86 a modifier until the end of the location's business day. */
export async function snoozeModifierUntilEndOfDay(
  clerkOrgId: string,
  modifierGroupItemId: string,
  locationId: string,
  reason?: string,
): Promise<SnoozeResult> {
  const tz = await locationTimezone(locationId);
  return snoozeModifier(clerkOrgId, modifierGroupItemId, locationId, localEndOfDayISO(tz), reason);
}

/** 86 a modifier for a fixed number of hours from now. */
export async function snoozeModifierForHours(
  clerkOrgId: string,
  modifierGroupItemId: string,
  locationId: string,
  hours: number,
  reason?: string,
): Promise<SnoozeResult> {
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  return snoozeModifier(clerkOrgId, modifierGroupItemId, locationId, until, reason);
}

/** 86 a modifier until manually restored. */
export async function snoozeModifierUntilManual(
  clerkOrgId: string,
  modifierGroupItemId: string,
  locationId: string,
  reason?: string,
): Promise<SnoozeResult> {
  return snoozeModifier(clerkOrgId, modifierGroupItemId, locationId, "infinity", reason);
}

/** 86 a whole modifier group until the end of the location's business day. */
export async function snoozeModifierGroupUntilEndOfDay(
  clerkOrgId: string,
  modifierGroupId: string,
  locationId: string,
  reason?: string,
): Promise<SnoozeResult> {
  const tz = await locationTimezone(locationId);
  return snoozeModifierGroup(clerkOrgId, modifierGroupId, locationId, localEndOfDayISO(tz), reason);
}

/** 86 a whole modifier group for a fixed number of hours from now. */
export async function snoozeModifierGroupForHours(
  clerkOrgId: string,
  modifierGroupId: string,
  locationId: string,
  hours: number,
  reason?: string,
): Promise<SnoozeResult> {
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  return snoozeModifierGroup(clerkOrgId, modifierGroupId, locationId, until, reason);
}

/** 86 a whole modifier group until manually restored. */
export async function snoozeModifierGroupUntilManual(
  clerkOrgId: string,
  modifierGroupId: string,
  locationId: string,
  reason?: string,
): Promise<SnoozeResult> {
  return snoozeModifierGroup(clerkOrgId, modifierGroupId, locationId, "infinity", reason);
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
  modifier_group_id: string;
  name: string;
  group_name: string;
  snoozed_until: string;
  snooze_reason: string | null;
  updated_at: string;
}

export interface ActiveSnoozeCategory {
  kind: "category";
  category_id: string;
  name: string;
  image: string | null;
  snoozed_until: string;
  snooze_reason: string | null;
  updated_at: string;
}

export interface ActiveSnoozes {
  items: ActiveSnoozeItem[];
  modifiers: ActiveSnoozeModifier[];
  categories: ActiveSnoozeCategory[];
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
    data: (data as ActiveSnoozes) ?? { items: [], modifiers: [], categories: [] },
  };
}

/**
 * Current per-location override state for a single item. Mirrors the
 * GetItemIsPopular/GetItemIsNew per-location read pattern used by the item
 * editor, so the snooze + availability controls can self-fetch without threading
 * this through every page's item mapping.
 *
 * `is_available` is the L2 override's raw value: `null` means "no override row"
 * (inherit the global `menu_items.availability`), so the availability toggle can
 * seed `override.is_available ?? global`. This is what lets a single-location
 * account SEE and CLEAR an item that was turned off at its one store — the case
 * that previously showed "Available" on web while the POS had it off.
 */
export async function getItemSnooze(
  menuItemId: string,
  locationId: string,
): Promise<{
  snoozed_until: string | null;
  snooze_reason: string | null;
  is_available: boolean | null;
}> {
  if (!menuItemId || !locationId || locationId === "all") {
    return { snoozed_until: null, snooze_reason: null, is_available: null };
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("location_item_overrides")
    .select("snoozed_until, snooze_reason, is_available")
    .eq("location_id", locationId)
    .eq("menu_item_id", menuItemId)
    .maybeSingle();

  return {
    snoozed_until: data?.snoozed_until ?? null,
    snooze_reason: data?.snooze_reason ?? null,
    is_available: data?.is_available ?? null,
  };
}

// ----------------------------------------------------------------------------
// Read: items TURNED OFF at a location (deliberate hide, not a timed 86).
//
// A row with is_available=false AND snoozed_until IS NULL is a manager/POS
// "turn off", not an out-of-stock snooze — so the auto-restore cron never touches
// it and, before this, a single-location account had no web surface that even
// showed it (the item card reads the global availability flag). The Out-of-stock
// page renders these in a distinct "Turned off" section so they're always
// visible and one-click restorable.
// ----------------------------------------------------------------------------

export interface TurnedOffItem {
  menu_item_id: string;
  name: string;
  image: string | null;
  updated_at: string;
}

export async function getTurnedOffItems(
  locationId: string,
): Promise<{ success: boolean; data?: TurnedOffItem[]; error?: string }> {
  if (!locationId || locationId === "all") {
    return { success: false, error: "A specific location is required." };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("location_item_overrides")
    .select("menu_item_id, updated_at, menu_items!inner(name, image)")
    .eq("location_id", locationId)
    .eq("is_available", false)
    .is("snoozed_until", null);

  if (error) {
    return { success: false, error: error.message };
  }

  const rows: TurnedOffItem[] = (data ?? []).map((r) => {
    const item = r.menu_items as unknown as { name: string; image: string | null } | null;
    return {
      menu_item_id: r.menu_item_id,
      name: item?.name ?? "",
      image: item?.image ?? null,
      updated_at: r.updated_at,
    };
  });

  return { success: true, data: rows };
}
