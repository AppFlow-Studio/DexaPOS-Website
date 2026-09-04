/**
 * Blackout shapes and validation.
 *
 * A plain module for the same hard reason `service-periods.ts` is one: a
 * `"use server"` file may export async functions and nothing else, so the shape
 * and the validator cannot live beside the actions that use them. The editor
 * also imports this directly, to reject an impossible window before paying for
 * a round trip.
 *
 * **What a blackout is for.** Service periods say when a location seats in the
 * ordinary run of a week. A blackout is the exception on top: New Year's Eve is
 * a private buyout, the dining room is closed for a wedding on the 14th, the
 * kitchen shuts at 8 on Christmas Eve. Without it a merchant's only recourse is
 * to delete a service period and remember to put it back — which is how a
 * restaurant ends up closed for the whole of January.
 */

export interface BlackoutInput {
  id?: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /**
   * `HH:MM`, or null for a whole-day closure.
   *
   * The two times move together and the database enforces it
   * (`reservation_blackouts_window`): both null, or both set with start before
   * end. A half-specified window has no meaning — "closed from 7pm until
   * unspecified" is either the rest of the day or nothing at all.
   */
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

/** A whole day closed, which is what a merchant almost always means. */
export const BLANK_BLACKOUT: BlackoutInput = {
  date: "",
  startTime: null,
  endTime: null,
  reason: "",
};

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Returns a merchant-facing message, or null when the blackout is valid.
 *
 * Every rule here restates a CHECK constraint on `reservation_blackouts`. The
 * constraint is still the real guarantee — it is the only thing a direct SQL
 * write passes through — but a merchant should read a sentence, not
 * `violates check constraint "reservation_blackouts_window"`.
 */
export function validateBlackout(input: BlackoutInput): string | null {
  if (!DATE_RE.test(input.date)) {
    return "Pick a date.";
  }

  const hasStart = input.startTime !== null && input.startTime !== "";
  const hasEnd = input.endTime !== null && input.endTime !== "";

  // Whole day. The common case, and the one with nothing left to check.
  if (!hasStart && !hasEnd) return null;

  if (hasStart !== hasEnd) {
    return "Give both a start and an end time, or leave both empty to close the whole day.";
  }
  if (!TIME_RE.test(input.startTime!) || !TIME_RE.test(input.endTime!)) {
    return "Times should look like 17:00.";
  }
  if (input.startTime! >= input.endTime!) {
    return "The closed period has to end after it starts.";
  }

  return null;
}

/** `2026-12-31` → `Thursday, 31 December 2026`. Parsed as a plain date. */
export function formatBlackoutDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** How the list describes what is closed. */
export function describeBlackout(blackout: BlackoutInput): string {
  if (!blackout.startTime || !blackout.endTime) return "Closed all day";
  return `Closed ${blackout.startTime}–${blackout.endTime}`;
}

/**
 * A blackout whose date has passed still occupies a row, but it can no longer
 * affect anything a guest sees.
 *
 * Used to sort spent entries out of the merchant's way rather than to delete
 * them: last year's New Year's Eve is evidence of what happened, and a list
 * that silently drops rows is one a merchant stops trusting.
 */
export function isPastBlackout(blackout: BlackoutInput, today: string): boolean {
  return blackout.date < today;
}
