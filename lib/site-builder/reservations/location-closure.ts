import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { notifyWebsiteReservationCancelled } from "./notify";

/**
 * What happens to bookings when a branch stops existing.
 *
 * Archiving a location is not a data-model event to a guest — it is a locked
 * door. A confirmed website booking at an archived branch is the worst possible
 * outcome of this whole feature: the restaurant never sees it (the dashboard
 * scopes to active locations), the guest is never told, and they turn up on a
 * Friday night to a closed dining room holding a confirmation number the
 * business itself issued.
 *
 * So archiving cancels every future booking at that location and tells each
 * guest why. `cancelled_by = 'system'`, which is exactly the distinction that
 * column was added for: this was neither the guest changing their mind nor a
 * host on the phone.
 *
 * **Never touches the past.** A booking that has already happened is a record
 * of something that happened, and rewriting it to `cancelled` would corrupt
 * every report built on it.
 */

/** The statuses that still represent a table someone expects to walk up to. */
const CANCELLABLE_STATUSES = ["pending", "confirmed", "reminded"] as const;

export interface ClosureResult {
  cancelled: number;
  /** Ids to notify. Empty when nothing needed cancelling. */
  reservationIds: string[];
  error: string | null;
}

/**
 * "Now" at the restaurant, not on the server.
 *
 * A location archived at 23:00 UTC is closing on a date its own guests may not
 * have reached yet. Using the server's clock would cancel tomorrow's lunch in
 * Auckland and leave tonight's dinner in Los Angeles standing — precisely
 * backwards.
 */
function localNow(timezone: string | null): { date: string; time: string } {
  const tz = timezone && timezone.trim() !== "" ? timezone : "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      time: `${get("hour")}:${get("minute")}`,
    };
  } catch {
    // An unknown timezone string must not stop a merchant archiving a branch.
    // UTC over-cancels by at most a day, which is the safe direction: a guest
    // told their booking is cancelled can rebook, a guest not told cannot.
    const now = new Date();
    return { date: now.toISOString().slice(0, 10), time: now.toISOString().slice(11, 16) };
  }
}

/**
 * Cancels every still-live booking at a location from this moment forward.
 *
 * Returns the ids rather than notifying, so the caller decides when that
 * happens — archiving a branch should not make a merchant wait on a mail
 * provider, and `notifyClosureCancellations` exists to be run after the
 * response.
 */
export async function cancelFutureReservationsForLocation(
  locationId: string,
  reason = "This location has closed.",
): Promise<ClosureResult> {
  try {
    const supabase = createServiceRoleClient();

    const { data: location } = await supabase
      .from("locations")
      .select("timezone")
      .eq("id", locationId)
      .maybeSingle();

    const { date, time } = localNow(location?.timezone ?? null);

    // Today's remaining sittings and everything after. Expressed as one `or`
    // rather than two round trips so the read and the write see the same set.
    const { data: rows, error } = await supabase
      .from("reservations")
      .select("id")
      .eq("location_id", locationId)
      .in("status", CANCELLABLE_STATUSES as unknown as string[])
      .or(`reservation_date.gt.${date},and(reservation_date.eq.${date},reservation_time.gte.${time})`);

    if (error) return { cancelled: 0, reservationIds: [], error: error.message };

    const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return { cancelled: 0, reservationIds: [], error: null };

    const { error: updateError } = await supabase
      .from("reservations")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        // Neither the guest nor a host. This is the one case the column's third
        // value exists for.
        cancelled_by: "system",
        cancellation_reason: reason,
      })
      .in("id", ids);

    if (updateError) return { cancelled: 0, reservationIds: [], error: updateError.message };

    return { cancelled: ids.length, reservationIds: ids, error: null };
  } catch (err: unknown) {
    return {
      cancelled: 0,
      reservationIds: [],
      error: (err as { message?: string })?.message ?? "Unknown error",
    };
  }
}

/**
 * Tells each affected guest, one at a time.
 *
 * **Sequential, deliberately.** A branch closing may cancel dozens of bookings,
 * and firing dozens of concurrent Telnyx and Resend calls is how a provider
 * rate-limits the whole merchant — at which point the guests who most need
 * telling are the ones who are not told. Slow and complete beats fast and
 * partial, and this already runs after the response.
 */
export async function notifyClosureCancellations(reservationIds: string[]): Promise<void> {
  for (const reservationId of reservationIds) {
    const result = await notifyWebsiteReservationCancelled({ reservationId });
    if (result.errors.length > 0) {
      console.error(
        "[site-reservations] closure notice failed:",
        reservationId,
        result.errors.join("; "),
      );
    }
  }
}
