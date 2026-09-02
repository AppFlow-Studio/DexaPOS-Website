import {
  fail,
  int,
  ok,
  readJsonBody,
  serviceClient,
  str,
  withinRateLimit,
} from "@/lib/site-builder/reservations/endpoint";
import {
  DATE_RE,
  MAX_REQUESTABLE_PARTY,
  TIME_RE,
  UUID_RE,
} from "@/lib/site-builder/reservations/protocol";

/**
 * Claim a slot for five minutes.
 *
 * This is what makes the countdown in the checkout header honest: the tables
 * really are the guest's while it runs, because `create_public_reservation_hold`
 * takes an advisory lock on (location, date), re-checks availability inside it,
 * and inserts. Two guests tapping 7:00 PM at the same instant serialise, and
 * the second is told the slot is gone rather than both being sent to a checkout
 * that only one can complete.
 *
 * Tighter limit than availability: a hold consumes real inventory, so a flood
 * of them is a denial-of-service against a restaurant's evening. Five minutes
 * of abandoned holds is the worst a single address can do here.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = { max: 10, windowSeconds: 300 };

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return fail("invalid");

  const siteId = str(body.siteId, 40);
  const locationId = str(body.locationId, 40);
  const date = str(body.date, 10);
  const time = str(body.time, 5);
  const partySize = int(body.partySize);

  if (!UUID_RE.test(siteId) || !UUID_RE.test(locationId)) return fail("invalid");
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return fail("invalid");
  if (partySize === null || partySize < 1 || partySize > MAX_REQUESTABLE_PARTY) {
    return fail("invalid");
  }

  if (!(await withinRateLimit(request, `site-reservations:hold:${siteId}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds))) {
    return fail("rate_limited");
  }

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc("create_public_reservation_hold", {
    p_site_id: siteId,
    p_location_id: locationId,
    p_date: date,
    p_time: time,
    p_party_size: partySize,
  });

  if (error) {
    console.error("[site-reservations] hold failed:", error.message);
    return fail("unavailable");
  }

  // NULL is the function's "cannot hold this" — a closed venue, a slot the grid
  // would not offer, or one that has just gone. All the same answer on purpose:
  // telling them apart would let a caller probe a restaurant's inventory one
  // request at a time.
  if (!data) return fail("slot_taken");

  const held = data as { token: string; expires_at: string; hold_minutes: number };

  return ok({
    token: held.token,
    // The absolute instant, never a duration. A countdown derived from
    // "5 minutes from when you got this" drifts by however long the response
    // took and by whatever the client clock thinks — and then the timer hits
    // zero at a different moment than the hold actually expires.
    expiresAt: held.expires_at,
    holdMinutes: held.hold_minutes,
  });
}
