import type { BookableLocation } from "./protocol";

/**
 * Which branch a booking surface should book, given what the page prefers.
 *
 * **One definition, two callers**, and that is the whole point. `ReservationsSection`
 * and `HeaderSection` both hand a config to the same widget, and when only the
 * section knew how to resolve a branch the header's dialog opened onto an empty
 * picker — a "Book a table" button that could not book. The rule has to live
 * somewhere both can reach it.
 *
 * The rule, in order:
 *
 *  1. **The preferred branch, but only if it is genuinely bookable.** A surface
 *     pinned to a branch that has since switched bookings off, or lost its last
 *     service period, must not be honoured: the widget would query forever and
 *     report "No tables available", telling a guest the restaurant is full when
 *     nothing was ever asked.
 *  2. **The only bookable branch**, when there is exactly one. The overwhelmingly
 *     common case is a single restaurant, and asking a guest to choose from a
 *     list of one is a step that exists only because the code could not tell.
 *     This is also what rescues a brand page whose pricing location is null
 *     because the merchant turned on "never show prices before a branch is
 *     chosen" — a pricing policy must not disable bookings.
 *  3. **Nothing**, which makes the widget ask.
 */
export interface BookingTarget {
  /** The settled branch, or null when the guest must choose. */
  resolved: BookableLocation | null;
  /**
   * What to serialise for the widget.
   *
   * The single resolved branch when there is one — so the widget always has that
   * branch's policy, party bounds and timezone without a second lookup — and the
   * full list when the guest has a real choice to make.
   */
  offered: BookableLocation[];
  /** No branch anywhere takes bookings. Surfaces show a phone number instead. */
  missing: boolean;
}

export function resolveBookingTarget(
  bookable: BookableLocation[],
  preferredLocationId: string | null | undefined,
): BookingTarget {
  const preferred = preferredLocationId
    ? bookable.find((l) => l.id === preferredLocationId)
    : undefined;

  const resolved = preferred ?? (bookable.length === 1 ? bookable[0] : null);

  return {
    resolved,
    offered: resolved ? [resolved] : bookable,
    missing: bookable.length === 0,
  };
}
