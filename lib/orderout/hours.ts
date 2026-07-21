// ============================================================================
// OrderOut availability fallback: location operating hours
// ============================================================================
// When a menu has NO assigned schedule, its OrderOut service_availability should
// mirror the location's operating hours instead of defaulting to 24/7. This util
// reads online_store_config.operating_hours (stored as a WeeklySchedule object,
// location-scoped) and converts it to OrderOut's per-day shape.
//
// Takes the Supabase client as a param so it works with both the authenticated
// client (merchant path) and the service-role client (internal auto-resync).

import type { SupabaseClient } from "@supabase/supabase-js";
import { weeklyScheduleToServiceAvailability } from "./transform-menu";
import type { OrderOutServiceAvailability } from "./types";

/**
 * Resolve the per-day availability fallback for a location from its operating
 * hours. Returns undefined when nothing usable is configured, so callers can
 * pass it straight through to transformMenuToOrderOut (which keeps the 24/7
 * default on undefined/empty).
 */
export async function fetchOperatingHoursFallback(
  supabase: SupabaseClient,
  locationId: string
): Promise<OrderOutServiceAvailability[] | undefined> {
  const { data } = await supabase
    .from("online_store_config")
    .select("operating_hours")
    .eq("location_id", locationId)
    .maybeSingle();

  const availability = weeklyScheduleToServiceAvailability(
    data?.operating_hours as
      | Parameters<typeof weeklyScheduleToServiceAvailability>[0]
      | undefined
  );

  return availability.length > 0 ? availability : undefined;
}
