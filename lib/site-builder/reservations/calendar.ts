/**
 * Month-grid arithmetic for the booking date picker.
 *
 * Pure and separate from the widget for the same reason `slot-view` is: the
 * edge cases here — a month that starts on a Saturday, a leap February, the
 * boundary between the last bookable day and the first unbookable one — are
 * exactly the things that are tedious to check by clicking and trivial to
 * assert.
 *
 * **Everything is UTC.** The dates a guest picks are calendar days at the
 * restaurant, not instants, so a grid built from local time would shift by a day
 * for anyone west of the venue and quietly offer them yesterday. The rest of the
 * widget already takes this line — `addDays` and `prettyDate` both build through
 * `Date.UTC` — and this follows it.
 */

/** Sunday-first, matching `EXTRACT(DOW)` and the service-period day numbers. */
export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export interface MonthGrid {
  /** ISO date of the first of the month — the anchor for stepping. */
  firstDay: string;
  /** e.g. `August 2026`. */
  label: string;
  /**
   * Six rows of seven, `null` where the cell belongs to a neighbouring month.
   *
   * Padded with blanks rather than filled with the adjacent month's days: a
   * bookable-looking 31st sitting in September's grid is a date a guest can
   * click by accident, and the panel is small enough that the extra row costs
   * nothing.
   */
  weeks: (string | null)[][];
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The first of the month containing `anchorIso`, `delta` months away. */
export function shiftMonth(anchorIso: string, delta: number): string {
  const [y, m] = anchorIso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return iso(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Builds the calendar grid for whichever month `anchorIso` falls in. */
export function monthGrid(anchorIso: string): MonthGrid {
  const [y, m] = anchorIso.split("-").map(Number);
  const year = y;
  const month = m - 1;

  const first = new Date(Date.UTC(year, month, 1));
  const leading = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: (string | null)[] = Array(leading).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(iso(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  // A fixed six-row grid. A month that fits in five rows would otherwise make
  // the panel change height as you step through the year, moving the arrows
  // out from under the pointer.
  while (cells.length < 42) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    firstDay: iso(year, month, 1),
    label: first.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    weeks,
  };
}

/**
 * Whether a day may be chosen.
 *
 * ISO dates compare correctly as strings, which is the whole reason the wire
 * format is `YYYY-MM-DD`.
 */
export function isSelectable(day: string, min: string, max: string): boolean {
  return day >= min && day <= max;
}

/** Whether stepping to the next/previous month could reach anything bookable. */
export function monthHasSelectableDay(
  anchorIso: string,
  min: string,
  max: string,
): boolean {
  const { weeks } = monthGrid(anchorIso);
  return weeks.some((week) =>
    week.some((day) => day !== null && isSelectable(day, min, max)),
  );
}

/** `2026-08-30` → `Sun, Aug 30`. The pill's own label for the chosen day. */
export function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
