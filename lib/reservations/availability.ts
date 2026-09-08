/**
 * The availability engine — which times a stranger may book, and nothing else.
 *
 * Written as pure functions over plain data, with no Supabase client and no
 * `Date.now()`, for three reasons:
 *
 *  1. **It is the riskiest logic in the feature.** Every screen downstream
 *     trusts its output, and a wrong answer is either a double-booked dining
 *     room or a restaurant that looks full when it is empty. Logic this
 *     load-bearing needs to be testable exhaustively, which means testable
 *     without a database.
 *  2. **It has to exist twice.** The public read path is a SQL
 *     `SECURITY DEFINER` function, because an availability query must not be a
 *     round trip through application code that anon can influence. This module
 *     is the reference implementation the SQL is ported from, and a parity test
 *     asserts the two agree on the same fixtures.
 *  3. **It is the thing to profile.** A combination search per slot, re-run on
 *     every picker change, is where this feature gets slow. Pure functions can
 *     be benchmarked against a realistic 40-table floor plan without standing
 *     anything up.
 *
 * Everything here is wall-clock: minutes past midnight and `YYYY-MM-DD`
 * strings, never `Date` instants. `reservations.reservation_time` is a bare
 * `time` with no offset — it means "7pm at the restaurant" — so converting to
 * an instant would attach whichever timezone the runtime is in. The only
 * timezone-aware step is deciding what "now" is at the location, and the caller
 * does that with `zonedDateTimeParts` and passes the result in.
 *
 * See docs/features/website-builder/PLAN-2026-08-27-RESERVATIONS-SECTION.md §2.7.
 */

import { hhmmFromMinutes, minutesFromHHMM, rangesOverlap } from "./conflict-detection";

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

/** One row of `reservation_service_periods`, in application shape. */
export interface ServicePeriod {
  id: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday, matching Postgres `EXTRACT(DOW)`. */
  daysOfWeek: number[];
  /** `HH:MM`. */
  startTime: string;
  /** `HH:MM`. The LAST seating, not closing time — this slot is offered. */
  endTime: string;
  slotIntervalMin: number;
  turnTimeMin: number;
  minPartySize: number;
  maxPartySize: number;
  leadTimeMin: number;
  maxAdvanceDays: number;
  /** `null` = derive capacity from tables. A number is a pacing cap on top. */
  maxCoversPerSlot: number | null;
}

/** A reservable `floor_plan_objects` row. */
export interface ReservableTable {
  id: string;
  capacity: number;
  /** Smallest party that may occupy it. Stops a deuce taking a twelve-top. */
  minCapacity: number;
  isCombinable: boolean;
}

/**
 * Anything already occupying tables in the window: a booked reservation, a
 * seated walk-in, or a live hold. The engine does not care which — they occupy
 * a table identically, and collapsing them here is what stops the three from
 * being handled inconsistently.
 */
export interface Occupancy {
  tableIds: string[];
  /** Minutes past midnight. */
  startMinutes: number;
  endMinutes: number;
  partySize: number;
}

/** One row of `reservation_blackouts`. Both times null = the whole day. */
export interface Blackout {
  startTime: string | null;
  endTime: string | null;
}

export interface Slot {
  /** `HH:MM`. */
  time: string;
  servicePeriodId: string;
  serviceName: string;
}

export interface AvailabilityInput {
  /** `YYYY-MM-DD`, the date being asked about. */
  date: string;
  partySize: number;
  periods: ServicePeriod[];
  blackouts: Blackout[];
  tables: ReservableTable[];
  occupancy: Occupancy[];
  /**
   * "Now" at the LOCATION, from `zonedDateTimeParts(location.timezone)`.
   * Passed in rather than read, so this module has no clock of its own and
   * every test is deterministic.
   */
  now: { date: string; time: string };
  /**
   * How many tables may be pushed together for one party.
   *
   * Three is a deliberate ceiling, not a guess: the search is combinatorial, so
   * an unbounded limit turns a 40-table floor plan into millions of candidate
   * sets per query, and no restaurant pushes four tables together for a walk-up
   * web booking anyway. Parties that need more are the ones the "call us" path
   * exists for.
   */
  maxTablesPerParty?: number;
}

const DEFAULT_MAX_TABLES_PER_PARTY = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Day of week for a `YYYY-MM-DD` string, 0 = Sunday.
 *
 * Built through `Date.UTC` and read with `getUTCDay` so the answer cannot shift
 * with the runtime's timezone. `new Date("2026-08-28")` is parsed as UTC
 * midnight, which in any negative-offset zone is *the previous day* locally —
 * so the obvious `new Date(date).getDay()` returns Thursday for a Friday across
 * the whole of the Americas.
 */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every candidate time a period offers on a date, before any availability is
 * considered.
 *
 * `endTime` is inclusive because it is the last seating rather than closing
 * time — a period running 17:00–22:00 at 15-minute intervals offers 22:00.
 *
 * Pure wall-clock arithmetic, which is also why this is correct on a
 * daylight-saving transition day: the restaurant still seats 17:00 to 22:00 by
 * the clock on the wall, whatever UTC did overnight.
 */
export function generateSlots(period: ServicePeriod, date: string): Slot[] {
  if (!period.daysOfWeek.includes(dayOfWeek(date))) return [];

  const start = minutesFromHHMM(period.startTime);
  const end = minutesFromHHMM(period.endTime);
  const step = period.slotIntervalMin;

  // Defensive: a zero or negative interval would loop forever. The DB CHECK
  // constrains this to a known set, but this module is also fed by tests and
  // by whatever the SQL port hands it.
  if (step <= 0 || end < start) return [];

  const slots: Slot[] = [];
  for (let t = start; t <= end; t += step) {
    slots.push({
      time: hhmmFromMinutes(t),
      servicePeriodId: period.id,
      serviceName: period.name,
    });
  }
  return slots;
}

/** Is a slot start inside any blackout window on this date? */
export function isBlackedOut(slotMinutes: number, blackouts: Blackout[]): boolean {
  return blackouts.some((b) => {
    // Both null is the whole day closed — a private buyout, a holiday.
    if (b.startTime === null || b.endTime === null) return true;
    return (
      slotMinutes >= minutesFromHHMM(b.startTime) &&
      slotMinutes < minutesFromHHMM(b.endTime)
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Table fitting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every set of tables that could seat this party, best fit first.
 *
 * **Computed once per query and reused across every slot.** Doing it per slot
 * is the naive shape and the reason a first cut of this feature is slow: the
 * candidate sets depend only on the floor plan and the party size, neither of
 * which changes between 17:00 and 22:00.
 *
 * Fit rules:
 *  - total capacity must seat the party;
 *  - the party must meet the largest `minCapacity` in the set, so a deuce is
 *    not given a table reserved for six;
 *  - a set of more than one table may only contain combinable tables.
 *
 * Ordering is real restaurant logic rather than cosmetics: fewest tables first,
 * then least wasted capacity. Seating a deuce at a two-top before a six-top
 * keeps the six-top for a party of six, which is the difference between a
 * dining room that fills and one that strands its large tables.
 */
export function tableCombinations(
  tables: ReservableTable[],
  partySize: number,
  maxTables: number = DEFAULT_MAX_TABLES_PER_PARTY,
): string[][] {
  const usable = tables.filter((t) => t.capacity > 0);
  const results: { ids: string[]; waste: number; count: number }[] = [];

  const consider = (set: ReservableTable[]) => {
    const total = set.reduce((sum, t) => sum + t.capacity, 0);
    if (total < partySize) return;

    const minRequired = Math.max(...set.map((t) => t.minCapacity));
    if (partySize < minRequired) return;

    results.push({
      ids: set.map((t) => t.id),
      waste: total - partySize,
      count: set.length,
    });
  };

  // Singles first — always allowed, combinable or not.
  for (const table of usable) consider([table]);

  // Then combinations, which only combinable tables may join.
  //
  // The recursion prunes on "already big enough": a set that seats the party
  // needs no further tables, because adding one can only waste capacity and
  // occupy inventory a larger party might need. That is a strict improvement
  // rather than a heuristic — every set it skips is dominated by a subset it
  // already produced — and it is what keeps a deuce from enumerating every
  // three-table set on a forty-table floor plan.
  const combinable = usable.filter((t) => t.isCombinable);
  const walk = (startIndex: number, chosen: ReservableTable[], seats: number) => {
    if (chosen.length >= maxTables || seats >= partySize) return;
    for (let i = startIndex; i < combinable.length; i++) {
      const next = [...chosen, combinable[i]];
      const nextSeats = seats + combinable[i].capacity;
      if (next.length > 1) consider(next);
      walk(i + 1, next, nextSeats);
    }
  };
  walk(0, [], 0);

  results.sort((a, b) => a.count - b.count || a.waste - b.waste);
  return results.map((r) => r.ids);
}

/**
 * Is any of these table sets entirely free for `[start, end)`?
 *
 * Returns the winning set so the caller can hold exactly those tables — which
 * is what makes the five-minute hold mean something rather than being a timer
 * over a number.
 */
export function firstFreeCombination(
  combinations: string[][],
  occupancy: Occupancy[],
  startMinutes: number,
  endMinutes: number,
): string[] | null {
  const busy = new Set<string>();
  for (const o of occupancy) {
    if (rangesOverlap(startMinutes, endMinutes, o.startMinutes, o.endMinutes)) {
      for (const id of o.tableIds) busy.add(id);
    }
  }

  for (const combo of combinations) {
    if (combo.every((id) => !busy.has(id))) return combo;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/** A slot that survived every filter, with the tables that would be held. */
export interface AvailableSlot extends Slot {
  /** Empty in the cover-pacing fallback, where there is no floor plan. */
  tableIds: string[];
}

/**
 * The seven steps of §2.7, in order.
 *
 * Ordered cheapest-first on purpose: the date-window and blackout checks reject
 * whole queries before the combination search — the only expensive step — is
 * reached.
 */
export function computeAvailability(input: AvailabilityInput): AvailableSlot[] {
  const {
    date,
    partySize,
    periods,
    blackouts,
    tables,
    occupancy,
    now,
    maxTablesPerParty = DEFAULT_MAX_TABLES_PER_PARTY,
  } = input;

  if (partySize < 1) return [];

  // A whole-day blackout ends the query before anything else runs.
  if (blackouts.some((b) => b.startTime === null || b.endTime === null)) return [];

  const daysAhead = daysBetween(now.date, date);
  if (daysAhead < 0) return [];

  const nowMinutes = minutesFromHHMM(now.time);
  const out: AvailableSlot[] = [];

  for (const period of periods) {
    // Party size is a property of the period, not the venue: a bar period may
    // cap at 4 while the dining room takes 10.
    if (partySize < period.minPartySize || partySize > period.maxPartySize) continue;
    if (daysAhead > period.maxAdvanceDays) continue;

    // Combinations depend on the floor plan and the party, so they are computed
    // per period (turn time differs) but NOT per slot.
    const combinations =
      tables.length > 0 ? tableCombinations(tables, partySize, maxTablesPerParty) : [];

    // A floor plan that exists but cannot seat this party at all — every table
    // too small, or too large a minimum. No slot on this period can work.
    if (tables.length > 0 && combinations.length === 0) continue;

    for (const slot of generateSlots(period, date)) {
      const slotMinutes = minutesFromHHMM(slot.time);

      if (isBlackedOut(slotMinutes, blackouts)) continue;

      // Lead time, and "already past", are the same comparison: a slot must be
      // at least `leadTimeMin` from now. Only meaningful on today's date —
      // a future date is by definition beyond any lead time.
      if (daysAhead === 0 && slotMinutes < nowMinutes + period.leadTimeMin) continue;

      const slotEnd = slotMinutes + period.turnTimeMin;

      // Cover pacing, when set. Counts covers SEATED AT this slot time rather
      // than everyone in the room — the constraint being expressed is the
      // kitchen's ability to fire a wave of tables at once, not the size of the
      // dining room, which is what the table inventory already models.
      if (period.maxCoversPerSlot !== null) {
        const seatedHere = occupancy
          .filter((o) => o.startMinutes === slotMinutes)
          .reduce((sum, o) => sum + o.partySize, 0);
        if (seatedHere + partySize > period.maxCoversPerSlot) continue;
      }

      if (tables.length === 0) {
        // No floor plan: the merchant is on the cover-pacing fallback, which
        // the pacing check above has already applied. A period reaching here
        // with no cap and no tables is a misconfiguration the settings screen
        // is required to prevent, and offering nothing is the safe reading.
        if (period.maxCoversPerSlot === null) continue;
        out.push({ ...slot, tableIds: [] });
        continue;
      }

      const free = firstFreeCombination(combinations, occupancy, slotMinutes, slotEnd);
      if (!free) continue;

      out.push({ ...slot, tableIds: free });
    }
  }

  // One flat grid in clock order, whichever period each slot came from — the
  // guest sees a single list of times, with the service name on the button.
  out.sort((a, b) => minutesFromHHMM(a.time) - minutesFromHHMM(b.time));
  return out;
}
