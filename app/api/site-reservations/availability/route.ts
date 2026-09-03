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
  MAX_REQUESTABLE_DAYS_AHEAD,
  MAX_REQUESTABLE_PARTY,
  UUID_RE,
  type AvailabilitySlot,
} from "@/lib/site-builder/reservations/protocol";

/**
 * What times are free.
 *
 * **A POST, not a GET, despite being a read.** Availability is re-queried every
 * time the guest touches the party size, the date or the location, so a GET
 * would put a merchant's opening pattern into browser history, proxy logs and
 * CDN caches. A POST also keeps it off any edge cache by default, which matters
 * because a cached grid is a grid that offers tables somebody has since booked.
 *
 * The rate limit is the loosest of the four — this fires on every picker change
 * — but it is not absent: without one, this endpoint is a free scraper for how
 * busy every restaurant on the platform is, every night.
 */

export const runtime = "nodejs";
/** Never cache. A stale grid offers tables that are already gone. */
export const dynamic = "force-dynamic";

const RATE_LIMIT = { max: 60, windowSeconds: 300 };

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return fail("invalid");

  const siteId = str(body.siteId, 40);
  const locationId = str(body.locationId, 40);
  const date = str(body.date, 10);
  const partySize = int(body.partySize);

  if (!UUID_RE.test(siteId) || !UUID_RE.test(locationId)) return fail("invalid");
  if (!DATE_RE.test(date)) return fail("invalid");
  if (partySize === null || partySize < 1 || partySize > MAX_REQUESTABLE_PARTY) {
    return fail("invalid");
  }

  // A sanity bound, not a business rule — the real window is `max_advance_days`
  // per service period, enforced in the function. This only stops a request for
  // the year 9999 reaching the database at all.
  const daysAhead = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z")) /
      86_400_000,
  );
  if (!Number.isFinite(daysAhead) || daysAhead > MAX_REQUESTABLE_DAYS_AHEAD) {
    return fail("invalid");
  }

  // Keyed per site, so one busy restaurant cannot lock out another's guests.
  if (!(await withinRateLimit(request, `site-reservations:availability:${siteId}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds))) {
    return fail("rate_limited");
  }

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc("get_public_reservation_availability", {
    p_site_id: siteId,
    p_location_id: locationId,
    p_date: date,
    p_party_size: partySize,
  });

  if (error) {
    console.error("[site-reservations] availability failed:", error.message);
    // Deliberately not distinguishable from "this venue takes no bookings". A
    // caller must not be able to tell a database fault from a closed kitchen.
    return fail("unavailable");
  }

  const rows = (data ?? []) as { slot_time: string; service_period_id: string; service_name: string }[];

  const slots: AvailabilitySlot[] = rows.map((row) => ({
    // Postgres renders `time` as HH:MM:SS; the widget and the button label both
    // want HH:MM.
    time: String(row.slot_time).slice(0, 5),
    servicePeriodId: row.service_period_id,
    serviceName: row.service_name,
  }));

  return ok({ slots });
}
