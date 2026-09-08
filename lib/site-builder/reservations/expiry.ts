import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { notifyReservationRequestAnswered } from "./notify";

/**
 * What happens to a request the restaurant never answers.
 *
 * §10 of PLAN-2026-08-29-RESERVATION-APPROVAL-MODE, and the one risk §7 named
 * that the approval-mode build deliberately left open.
 *
 * A guest asks for a table tonight. The restaurant is in manual review and
 * nobody opens the dashboard. Today that request holds a table indefinitely and
 * the guest is left reading "we'll answer shortly" right up until they turn up
 * to a booking that does not exist. Neither side is served by a question that
 * is never closed, so past a point the platform answers on the restaurant's
 * behalf — and, crucially, *tells the guest*, with the venue's phone number.
 *
 * The selection and the cancellation happen in one statement inside
 * `expire_stale_reservation_requests`, which carries the three guards that make
 * this safe (website-sourced only, bounded lookback, branch-local clock) and
 * the reasoning for each. This module exists for the half SQL cannot do:
 * telling the guest.
 *
 * Structured exactly like {@link file://./location-closure.ts} — cancel a set,
 * return the ids, notify separately — because it is the same shape of event:
 * something outside the guest's control removed their booking, and the platform
 * owes them a message about it.
 */

/**
 * How close to the sitting a request may get before it is answered for them.
 *
 * Two hours. Short enough that a guest still has an evening to rescue, long
 * enough that a restaurant working through a lunch rush has not lost the chance
 * to say yes. This is a platform default rather than a merchant setting on
 * purpose: it is the *guest's* protection, and a merchant who is not answering
 * requests is exactly the merchant who would not have tuned it.
 */
export const REQUEST_GRACE_MINUTES = 120;

/**
 * How far back the sweep will reach.
 *
 * Nothing older than a day. A request whose sitting is long past is not a guest
 * waiting on an answer — it is a stale row, and cancelling it would rewrite
 * history and fire an apology about a dinner that is over. Staging proved this
 * is not hypothetical: it holds ten `pending` rows, the oldest from April.
 */
export const REQUEST_LOOKBACK_HOURS = 24;

/** What the guest is told, verbatim. The declined template adds the phone number. */
export const EXPIRY_REASON = "We were not able to confirm this table in time.";

export interface ExpiryResult {
  expired: number;
  reservationIds: string[];
  /** Guests the sweep could not reach. Cancelling without telling is the bad case. */
  notifyErrors: string[];
  error: string | null;
}

/**
 * Cancels every request that has run out of time, then tells each guest.
 *
 * Sequential notification, for the reason `notifyClosureCancellations` gives:
 * firing a burst of concurrent Telnyx and Resend calls is how a provider
 * rate-limits the whole merchant, at which point the guests who most need
 * telling are the ones who are not told. This runs on a schedule with nobody
 * waiting on it, so slow and complete is strictly better than fast and partial.
 */
export async function expireStaleReservationRequests(options?: {
  graceMinutes?: number;
  lookbackHours?: number;
}): Promise<ExpiryResult> {
  const result: ExpiryResult = {
    expired: 0,
    reservationIds: [],
    notifyErrors: [],
    error: null,
  };

  try {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase.rpc("expire_stale_reservation_requests", {
      p_grace_minutes: options?.graceMinutes ?? REQUEST_GRACE_MINUTES,
      p_lookback_hours: options?.lookbackHours ?? REQUEST_LOOKBACK_HOURS,
      p_reason: EXPIRY_REASON,
    });

    if (error) {
      result.error = error.message;
      return result;
    }

    const ids = ((data ?? []) as { reservation_id: string }[])
      .map((row) => row.reservation_id)
      .filter(Boolean);

    result.expired = ids.length;
    result.reservationIds = ids;
    if (ids.length === 0) return result;

    for (const reservationId of ids) {
      /*
        The decline the guest already understands.

        An expiry is a decline from where the guest is standing — they asked,
        and the answer is no — so it reuses the template pair rather than
        inventing a fourth voice for the same outcome. What differs is the
        reason, which the template prints verbatim, and the audit action, so
        that reporting can still tell "the restaurant said no" apart from
        "nobody answered". Those are very different facts about a business.
      */
      const outcome = await notifyReservationRequestAnswered({
        reservationId,
        accepted: false,
        reason: EXPIRY_REASON,
        expired: true,
      });

      if (outcome.errors.length > 0) {
        const detail = `${reservationId}: ${outcome.errors.join("; ")}`;
        result.notifyErrors.push(detail);
        console.error("[site-reservations] expiry notice failed:", detail);
      }
    }

    return result;
  } catch (err: unknown) {
    result.error = (err as { message?: string })?.message ?? "Unknown error";
    return result;
  }
}
