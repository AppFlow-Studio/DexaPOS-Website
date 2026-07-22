"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";
import {
  pushMenuToOrderOut,
  pushMenuToConnectedChannels,
  resolvePrimaryOnlineMenu,
} from "./orderout";

// ============================================================================
// Category-level 86ing (temporary "Sold Out"), per location.
//
// Mirrors item/modifier 86 (./item-snooze) but scoped to a whole category. Writes
// ONLY snoozed_until/snooze_reason via set_location_category_snooze_v1 — never
// is_active — because a snoozed category must STAY on the menu (its items marked
// Sold Out downstream) instead of being filtered out like a deliberate hide.
// get_menu_with_categories surfaces the category snooze; the OrderOut transform
// turns it into per-item suspension_info. There is no per-category OrderOut
// endpoint, so propagation is a full menu resync (same as modifiers).
//
// snoozedUntil contract: null -> clear/un-86; ISO -> timed; "infinity" -> manual.
// ============================================================================

type SnoozeUntil = string | null;

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
 * Full-menu OrderOut re-push so a category 86 reaches connected delivery apps.
 * Availability-only change, so bypass the manual cooldown. Never throws — a failed
 * re-push must not fail the snooze itself.
 */
async function triggerOrderOutFullResync(
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

    const online = await resolvePrimaryOnlineMenu(supabase, restaurant.id);
    if (!online) return;

    await pushMenuToOrderOut({ clerkOrgId, menuId: online.menu_id, locationId });
    await pushMenuToConnectedChannels({
      clerkOrgId,
      menuId: online.menu_id,
      locationId,
      skipCooldown: true,
    });
  } catch (e) {
    console.warn("[category-snooze] OrderOut full resync (non-fatal):", e);
  }
}

// ----------------------------------------------------------------------------
// Category snooze
// ----------------------------------------------------------------------------

export async function snoozeCategory(
  clerkOrgId: string,
  categoryId: string,
  locationId: string,
  snoozedUntil: SnoozeUntil,
  reason?: string,
): Promise<SnoozeResult> {
  if (!locationId || locationId === "all") {
    return { success: false, error: "A specific location is required to 86 a category." };
  }

  const supabase = createServerSupabaseClient();

  // Prior snooze state for the audit diff.
  const { data: prev } = await supabase
    .from("location_category_overrides")
    .select("snoozed_until")
    .eq("location_id", locationId)
    .eq("category_id", categoryId)
    .maybeSingle();

  const { error } = await supabase.rpc("set_location_category_snooze_v1", {
    p_location_id: locationId,
    p_category_id: categoryId,
    p_snoozed_until: snoozedUntil,
    p_reason: reason ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const { data: category } = await supabase
    .from("categories")
    .select("name")
    .eq("id", categoryId)
    .maybeSingle();

  const categoryName = category?.name ?? categoryId;

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: snoozedUntil
      ? `86'd Category: ${categoryName}`
      : `Restored Category: ${categoryName}`,
    actionCategory: "menu",
    severity: "info",
    resourceType: "category",
    resourceId: categoryId,
    resourceName: categoryName,
    changes: {
      before: { snoozed_until: prev?.snoozed_until ?? null },
      after: { snoozed_until: snoozedUntil },
      reason,
    },
    metadata: {
      snooze_mode: snoozeMode(snoozedUntil),
      source: "dashboard",
      scope: "category",
    },
  });

  // No per-category OrderOut suspension endpoint — full menu resync so every item
  // in the category propagates as Sold Out (or un-Sold-Out on restore).
  await triggerOrderOutFullResync(clerkOrgId, locationId);

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

/** 86 a category until the end of the location's business day. */
export async function snoozeCategoryUntilEndOfDay(
  clerkOrgId: string,
  categoryId: string,
  locationId: string,
  reason?: string,
): Promise<SnoozeResult> {
  const tz = await locationTimezone(locationId);
  return snoozeCategory(clerkOrgId, categoryId, locationId, localEndOfDayISO(tz), reason);
}

/** 86 a category for a fixed number of hours from now. */
export async function snoozeCategoryForHours(
  clerkOrgId: string,
  categoryId: string,
  locationId: string,
  hours: number,
  reason?: string,
): Promise<SnoozeResult> {
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  return snoozeCategory(clerkOrgId, categoryId, locationId, until, reason);
}

/** 86 a category until manually restored. */
export async function snoozeCategoryUntilManual(
  clerkOrgId: string,
  categoryId: string,
  locationId: string,
  reason?: string,
): Promise<SnoozeResult> {
  return snoozeCategory(clerkOrgId, categoryId, locationId, "infinity", reason);
}

/** Clear a category's 86 (restore). */
export async function unsnoozeCategory(
  clerkOrgId: string,
  categoryId: string,
  locationId: string,
): Promise<SnoozeResult> {
  return snoozeCategory(clerkOrgId, categoryId, locationId, null);
}

/**
 * Current snooze state for a single category at a location. Mirrors getItemSnooze
 * so a category snooze control can self-fetch.
 */
export async function getCategorySnooze(
  categoryId: string,
  locationId: string,
): Promise<{ snoozed_until: string | null; snooze_reason: string | null }> {
  if (!categoryId || !locationId || locationId === "all") {
    return { snoozed_until: null, snooze_reason: null };
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("location_category_overrides")
    .select("snoozed_until, snooze_reason")
    .eq("location_id", locationId)
    .eq("category_id", categoryId)
    .maybeSingle();

  return {
    snoozed_until: data?.snoozed_until ?? null,
    snooze_reason: data?.snooze_reason ?? null,
  };
}
