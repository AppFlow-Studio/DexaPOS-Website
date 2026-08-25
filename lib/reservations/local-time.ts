/**
 * Wall-clock helpers for reservations.
 *
 * `reservations.reservation_date` / `.reservation_time` are stored as bare
 * date/time values with NO offset — they mean "7pm at the restaurant". So every
 * comparison against "now" has to happen in the LOCATION's timezone, never the
 * browser's and never UTC.
 *
 * The bug this exists to prevent: `new Date().toISOString().split('T')[0]`
 * yields the UTC date. For a US venue that flips to tomorrow's date at 8pm
 * local (7pm during standard time), so the reservations page would open on the
 * wrong day every evening and default new bookings to a date the host did not
 * choose.
 */

/** Falls back to Eastern, matching `DEFAULT_REPORTING_TIMEZONE`. */
export const DEFAULT_RESERVATION_TIMEZONE = "America/New_York";

/**
 * `YYYY-MM-DD` / `HH:MM` for an instant, rendered in `timeZone`.
 *
 * `sv-SE` is the trick here: Swedish locale formatting is already ISO-shaped,
 * so this avoids hand-assembling parts from `Intl.DateTimeFormat`.
 */
export function zonedDateTimeParts(
  timeZone: string = DEFAULT_RESERVATION_TIMEZONE,
  instant: Date = new Date(),
): { date: string; time: string } {
  const formatted = instant.toLocaleString("sv-SE", { timeZone });
  return { date: formatted.slice(0, 10), time: formatted.slice(11, 16) };
}

/** Today's calendar date at the location — the correct default for the page. */
export function zonedToday(
  timeZone: string = DEFAULT_RESERVATION_TIMEZONE,
  instant: Date = new Date(),
): string {
  return zonedDateTimeParts(timeZone, instant).date;
}

/**
 * Is `date` + `time` in the past at the location?
 *
 * Mirrors the `create_reservation` RPC guard so the form can reject a past
 * booking inline, with a field-level message, instead of round-tripping to
 * Postgres and surfacing a raw `P0001`.
 *
 * Compared as strings deliberately: both sides are zero-padded and
 * lexicographically ordered, so this needs no Date parsing and cannot pick up
 * the browser's offset on the way through.
 */
export function isPastAtLocation(
  date: string,
  time: string,
  timeZone: string = DEFAULT_RESERVATION_TIMEZONE,
  instant: Date = new Date(),
): boolean {
  const now = zonedDateTimeParts(timeZone, instant);
  if (date < now.date) return true;
  if (date > now.date) return false;
  return time < now.time;
}
