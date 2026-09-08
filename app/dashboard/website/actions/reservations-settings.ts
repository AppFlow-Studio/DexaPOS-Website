"use server";

import { revalidatePath } from "next/cache";

import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import type { ActionResult } from "@/lib/site-builder/db-types";
import { validateBlackout, type BlackoutInput } from "@/lib/site-builder/reservations/blackouts";
import {
  DEFAULT_SERVICE_PERIOD,
  describeBlockers,
  validatePeriod,
  type LocationReservationConfig,
  type ServicePeriodInput,
} from "@/lib/site-builder/reservations/service-periods";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Per-location reservation configuration.
 *
 * **This module exports async functions and nothing else.** A `"use server"`
 * file is compiled into a server-action manifest, and Turbopack treats every
 * export as a callable action — including `export type`, which it cannot see
 * through. The shapes, defaults and validation therefore live in
 * `lib/site-builder/reservations/service-periods.ts`; import them from there.
 *
 * The split this file lives on either side of: the *site* decides whether the
 * business takes bookings on its own website at all (`brand.reservationMode`,
 * which also creates the page and the nav link), while everything here is per
 * **location** — whether this branch takes bookings, when it seats, and the
 * policy text a guest agrees to. A merchant whose Downtown branch books online
 * and whose Airport kiosk does not needs both levels, and conflating them is
 * the mistake the plan calls out in §2.0.
 */

async function merchantIdFor(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clerkOrgId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .maybeSingle();
  return data ? (data as { id: string }).id : null;
}

/**
 * Everything the settings screen needs, for every location the merchant has.
 *
 * One call rather than one per location: the screen shows them all at once, and
 * a merchant with six branches should not pay six round trips to open a panel.
 */
export async function GetReservationConfig(
  clerkOrgId: string,
): Promise<ActionResult<LocationReservationConfig[]>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const merchantId = await merchantIdFor(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const [
    { data: locations },
    { data: settings },
    { data: periods },
    { data: tables },
    { data: blackouts },
  ] = await Promise.all([
      supabase
        .from("locations")
        .select("id, name")
        .eq("merchant_id", merchantId)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase.from("reservation_settings").select("*").eq("merchant_id", merchantId),
      supabase
        .from("reservation_service_periods")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("start_time", { ascending: true }),
      supabase
        .from("floor_plan_objects")
        .select("location_id")
        .eq("merchant_id", merchantId)
        .eq("is_active", true)
        .in("category", ["table", "booth"]),
      // Past blackouts are fetched too, not filtered in SQL. The screen sorts
      // them out of the way itself, and a list that silently drops rows is one
      // a merchant stops trusting — "did I add New Year's Eve or not?"
      supabase
        .from("reservation_blackouts")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("date", { ascending: true }),
    ]);

  const rows = (locations ?? []) as { id: string; name: string }[];
  const settingsByLocation = new Map(
    ((settings ?? []) as Record<string, unknown>[]).map((s) => [s.location_id as string, s]),
  );
  const periodsByLocation = new Map<string, ServicePeriodInput[]>();
  for (const p of (periods ?? []) as Record<string, unknown>[]) {
    const key = p.location_id as string;
    const list = periodsByLocation.get(key) ?? [];
    list.push(toPeriodInput(p));
    periodsByLocation.set(key, list);
  }

  const blackoutsByLocation = new Map<string, BlackoutInput[]>();
  for (const b of (blackouts ?? []) as Record<string, unknown>[]) {
    const key = b.location_id as string;
    const list = blackoutsByLocation.get(key) ?? [];
    list.push(toBlackoutInput(b));
    blackoutsByLocation.set(key, list);
  }

  const tableCounts = new Map<string, number>();
  for (const t of (tables ?? []) as { location_id: string }[]) {
    tableCounts.set(t.location_id, (tableCounts.get(t.location_id) ?? 0) + 1);
  }

  return {
    data: rows.map((location) => {
      const s = settingsByLocation.get(location.id) ?? {};
      const locationPeriods = periodsByLocation.get(location.id) ?? [];
      const reservableTables = tableCounts.get(location.id) ?? 0;

      return {
        locationId: location.id,
        locationName: location.name,
        acceptsReservations: s.accepts_reservations === true,
        bookingPolicy: (s.booking_policy as string) ?? null,
        notifyEmails: (s.notify_emails as string[]) ?? [],
        collectBirthday: s.collect_birthday === true,
        occasionTags: (s.occasion_tags as string[]) ?? [],
        dietaryTags: (s.dietary_tags as string[]) ?? [],
        cancellationCutoffMin: (s.cancellation_cutoff_min as number) ?? 120,
        largePartyPhone: (s.large_party_phone as string) ?? null,
        periods: locationPeriods,
        blackouts: blackoutsByLocation.get(location.id) ?? [],
        reservableTables,
        blockers: describeBlockers(locationPeriods, reservableTables),
      };
    }),
  };
}

function toBlackoutInput(row: Record<string, unknown>): BlackoutInput {
  return {
    id: row.id as string,
    date: String(row.date).slice(0, 10),
    // Postgres renders `time` as HH:MM:SS and every form field here is HH:MM.
    // Null stays null: it is the difference between a closed window and a
    // closed day, and coercing it to "" would make the whole day disappear.
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
    reason: (row.reason as string) ?? null,
  };
}

function toPeriodInput(row: Record<string, unknown>): ServicePeriodInput {
  return {
    id: row.id as string,
    name: row.name as string,
    daysOfWeek: (row.days_of_week as number[]) ?? [],
    // Postgres renders `time` as HH:MM:SS; every form field here is HH:MM.
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    slotIntervalMin: row.slot_interval_min as number,
    turnTimeMin: row.turn_time_min as number,
    minPartySize: row.min_party_size as number,
    maxPartySize: row.max_party_size as number,
    leadTimeMin: row.lead_time_min as number,
    maxAdvanceDays: row.max_advance_days as number,
    maxCoversPerSlot: (row.max_covers_per_slot as number) ?? null,
    isActive: row.is_active === true,
  };
}

/**
 * Turns bookings on or off for one branch, and seeds a working service the
 * first time.
 *
 * The seed is the point: switching a location on and being handed an empty
 * service-times list is how a merchant ends up with a published booking page
 * that offers nothing. They can edit or delete the default immediately, but
 * they never start from nothing.
 */
export async function SetLocationAcceptsReservations(
  clerkOrgId: string,
  locationId: string,
  accepts: boolean,
): Promise<ActionResult<LocationReservationConfig[]>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const merchantId = await merchantIdFor(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const { error } = await supabase
    .from("reservation_settings")
    // `merchant_id` is filled by the tenancy trigger, never sent.
    .upsert({ location_id: locationId, accepts_reservations: accepts }, { onConflict: "location_id" });

  if (error) return { error: error.message, code: "db_error" };

  if (accepts) {
    const { count } = await supabase
      .from("reservation_service_periods")
      .select("id", { count: "exact", head: true })
      .eq("location_id", locationId);

    if ((count ?? 0) === 0) {
      const { error: seedError } = await supabase
        .from("reservation_service_periods")
        .insert(toPeriodRow(locationId, DEFAULT_SERVICE_PERIOD));
      if (seedError) return { error: seedError.message, code: "db_error" };
    }
  }

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: accepts ? "enabled_location_reservations" : "disabled_location_reservations",
    actionCategory: "website",
    severity: "info",
    resourceType: "reservation_settings",
    resourceId: locationId,
  });

  revalidatePath("/dashboard/website", "layout");
  return GetReservationConfig(clerkOrgId);
}

export async function UpdateLocationReservationSettings(
  clerkOrgId: string,
  locationId: string,
  patch: Partial<
    Pick<
      LocationReservationConfig,
      | "bookingPolicy"
      | "notifyEmails"
      | "collectBirthday"
      | "occasionTags"
      | "dietaryTags"
      | "cancellationCutoffMin"
      | "largePartyPhone"
    >
  >,
): Promise<ActionResult<LocationReservationConfig[]>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const merchantId = await merchantIdFor(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const row: Record<string, unknown> = { location_id: locationId };
  if (patch.bookingPolicy !== undefined) row.booking_policy = patch.bookingPolicy || null;
  if (patch.notifyEmails !== undefined) row.notify_emails = patch.notifyEmails;
  if (patch.collectBirthday !== undefined) row.collect_birthday = patch.collectBirthday;
  if (patch.occasionTags !== undefined) row.occasion_tags = patch.occasionTags;
  if (patch.dietaryTags !== undefined) row.dietary_tags = patch.dietaryTags;
  if (patch.cancellationCutoffMin !== undefined) {
    row.cancellation_cutoff_min = patch.cancellationCutoffMin;
  }
  if (patch.largePartyPhone !== undefined) row.large_party_phone = patch.largePartyPhone || null;

  const { error } = await supabase
    .from("reservation_settings")
    .upsert(row, { onConflict: "location_id" });

  if (error) return { error: error.message, code: "db_error" };

  revalidatePath("/dashboard/website", "layout");
  return GetReservationConfig(clerkOrgId);
}

export async function SaveServicePeriod(
  clerkOrgId: string,
  locationId: string,
  input: ServicePeriodInput,
): Promise<ActionResult<LocationReservationConfig[]>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const invalid = validatePeriod(input);
  if (invalid) return { error: invalid, code: "invalid_document" };

  const supabase = createServerSupabaseClient();
  const merchantId = await merchantIdFor(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const row = toPeriodRow(locationId, input);

  const { error } = input.id
    ? await supabase
        .from("reservation_service_periods")
        .update(row)
        .eq("id", input.id)
        // Scoped, so a crafted id cannot edit another merchant's service times.
        .eq("merchant_id", merchantId)
    : await supabase.from("reservation_service_periods").insert(row);

  if (error) return { error: error.message, code: "db_error" };

  revalidatePath("/dashboard/website", "layout");
  return GetReservationConfig(clerkOrgId);
}

export async function DeleteServicePeriod(
  clerkOrgId: string,
  periodId: string,
): Promise<ActionResult<LocationReservationConfig[]>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const merchantId = await merchantIdFor(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const { error } = await supabase
    .from("reservation_service_periods")
    .delete()
    .eq("id", periodId)
    .eq("merchant_id", merchantId);

  if (error) return { error: error.message, code: "db_error" };

  revalidatePath("/dashboard/website", "layout");
  return GetReservationConfig(clerkOrgId);
}

/**
 * A day, or a window within a day, that this branch does not seat.
 *
 * Writes nothing the availability function has to learn about: it already
 * excludes any slot overlapping a blackout, so a saved row takes effect on the
 * public grid immediately — which is exactly what a merchant fielding a private
 * buyout enquiry needs.
 */
export async function SaveBlackout(
  clerkOrgId: string,
  locationId: string,
  input: BlackoutInput,
): Promise<ActionResult<LocationReservationConfig[]>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const invalid = validateBlackout(input);
  if (invalid) return { error: invalid, code: "invalid_document" };

  const supabase = createServerSupabaseClient();
  const merchantId = await merchantIdFor(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const row = {
    location_id: locationId,
    merchant_id: merchantId,
    date: input.date,
    // Empty string is not the same as null here. `''::time` is a cast error,
    // and a half-set window violates `reservation_blackouts_window` — so the
    // pair is normalised to all-or-nothing before it reaches the database.
    start_time: input.startTime || null,
    end_time: input.endTime || null,
    reason: input.reason?.trim() || null,
  };

  const { error } = input.id
    ? await supabase
        .from("reservation_blackouts")
        .update(row)
        .eq("id", input.id)
        // Scoped, so a crafted id cannot close another merchant's dining room.
        .eq("merchant_id", merchantId)
    : await supabase.from("reservation_blackouts").insert(row);

  if (error) return { error: error.message, code: "db_error" };

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: input.id ? "updated_reservation_blackout" : "created_reservation_blackout",
    actionCategory: "website",
    severity: "info",
    resourceType: "reservation_blackout",
    resourceId: input.id,
    resourceName: input.date,
  });

  revalidatePath("/dashboard/website", "layout");
  return GetReservationConfig(clerkOrgId);
}

export async function DeleteBlackout(
  clerkOrgId: string,
  blackoutId: string,
): Promise<ActionResult<LocationReservationConfig[]>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const merchantId = await merchantIdFor(supabase, clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const { error } = await supabase
    .from("reservation_blackouts")
    .delete()
    .eq("id", blackoutId)
    .eq("merchant_id", merchantId);

  if (error) return { error: error.message, code: "db_error" };

  revalidatePath("/dashboard/website", "layout");
  return GetReservationConfig(clerkOrgId);
}

// ─────────────────────────────────────────────────────────────────────────────

function toPeriodRow(locationId: string, input: Omit<ServicePeriodInput, "id">) {
  return {
    location_id: locationId,
    name: input.name.trim() || "Dinner",
    days_of_week: input.daysOfWeek,
    start_time: input.startTime,
    end_time: input.endTime,
    slot_interval_min: input.slotIntervalMin,
    turn_time_min: input.turnTimeMin,
    min_party_size: input.minPartySize,
    max_party_size: input.maxPartySize,
    lead_time_min: input.leadTimeMin,
    max_advance_days: input.maxAdvanceDays,
    max_covers_per_slot: input.maxCoversPerSlot,
    is_active: input.isActive,
  };
}
