import { describe, expect, it } from "vitest";

import {
  computeAvailability,
  dayOfWeek,
  daysBetween,
  firstFreeCombination,
  generateSlots,
  isBlackedOut,
  tableCombinations,
  type AvailabilityInput,
  type Blackout,
  type Occupancy,
  type ReservableTable,
  type ServicePeriod,
} from "../availability";
import { minutesFromHHMM, rangesOverlap } from "../conflict-detection";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** 2026-08-28 is a Friday; 2026-08-30 a Sunday. */
const FRIDAY = "2026-08-28";
const SUNDAY = "2026-08-30";

const dinner = (over: Partial<ServicePeriod> = {}): ServicePeriod => ({
  id: "period-dinner",
  name: "Dinner",
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startTime: "17:00",
  endTime: "22:00",
  slotIntervalMin: 15,
  turnTimeMin: 90,
  minPartySize: 1,
  maxPartySize: 8,
  leadTimeMin: 60,
  maxAdvanceDays: 60,
  maxCoversPerSlot: null,
  ...over,
});

const table = (
  id: string,
  capacity: number,
  over: Partial<ReservableTable> = {},
): ReservableTable => ({
  id,
  capacity,
  minCapacity: 1,
  isCombinable: true,
  ...over,
});

const busy = (
  tableIds: string[],
  start: string,
  durationMin = 90,
  partySize = 2,
): Occupancy => ({
  tableIds,
  startMinutes: minutesFromHHMM(start),
  endMinutes: minutesFromHHMM(start) + durationMin,
  partySize,
});

/** Well before any slot, so lead time never interferes unless a test wants it. */
const MORNING = { date: FRIDAY, time: "09:00" };

const input = (over: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  date: FRIDAY,
  partySize: 2,
  periods: [dinner()],
  blackouts: [],
  tables: [table("t1", 2), table("t2", 2), table("t3", 4)],
  occupancy: [],
  now: MORNING,
  ...over,
});

const times = (slots: { time: string }[]) => slots.map((s) => s.time);

// ─────────────────────────────────────────────────────────────────────────────

describe("date helpers", () => {
  /**
   * The bug this pins: `new Date("2026-08-28").getDay()` parses as UTC midnight,
   * which is Thursday evening anywhere west of Greenwich — so the obvious
   * spelling returns the wrong weekday across the whole of the Americas and a
   * Friday-only dinner service would vanish from every US merchant's page.
   */
  it("reads a weekday without letting the runtime timezone shift it", () => {
    expect(dayOfWeek("2026-08-28")).toBe(5); // Friday
    expect(dayOfWeek("2026-08-30")).toBe(0); // Sunday
    expect(dayOfWeek("2026-08-31")).toBe(1); // Monday
  });

  it("counts whole days in both directions", () => {
    expect(daysBetween(FRIDAY, FRIDAY)).toBe(0);
    expect(daysBetween(FRIDAY, SUNDAY)).toBe(2);
    expect(daysBetween(SUNDAY, FRIDAY)).toBe(-2);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  /**
   * A daylight-saving boundary. 2026-03-08 is the US spring-forward date, and
   * `daysBetween` must still call it one day — a UTC-millisecond subtraction
   * across a 23-hour local day is exactly where naive arithmetic returns 0.
   */
  it("counts a daylight-saving day as one day", () => {
    expect(daysBetween("2026-03-07", "2026-03-08")).toBe(1);
    expect(daysBetween("2026-03-08", "2026-03-09")).toBe(1);
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1);
  });
});

describe("generateSlots", () => {
  it("offers nothing on a day the period does not run", () => {
    expect(generateSlots(dinner({ daysOfWeek: [1, 2] }), FRIDAY)).toEqual([]);
  });

  /** end_time is the LAST SEATING, so it is offered rather than excluded. */
  it("includes the closing slot", () => {
    const slots = generateSlots(dinner({ startTime: "17:00", endTime: "18:00" }), FRIDAY);
    expect(times(slots)).toEqual(["17:00", "17:15", "17:30", "17:45", "18:00"]);
  });

  it("carries the service name onto every slot, for the second line on the button", () => {
    const slots = generateSlots(dinner({ name: "Lunch", endTime: "17:30" }), FRIDAY);
    expect(slots.every((s) => s.serviceName === "Lunch")).toBe(true);
  });

  it("refuses to loop forever on a nonsense interval", () => {
    expect(generateSlots(dinner({ slotIntervalMin: 0 }), FRIDAY)).toEqual([]);
    expect(generateSlots(dinner({ startTime: "22:00", endTime: "17:00" }), FRIDAY)).toEqual([]);
  });

  /**
   * Wall-clock arithmetic means a DST date is not special: the restaurant seats
   * 17:00 to 22:00 by the clock on the wall whatever UTC did overnight.
   */
  it("produces the same grid on a daylight-saving transition date", () => {
    const normal = generateSlots(dinner(), "2026-03-07");
    const springForward = generateSlots(dinner(), "2026-03-08");
    expect(times(springForward)).toEqual(times(normal));
  });
});

describe("rangesOverlap", () => {
  /**
   * Half-open intervals. A table turning at 19:00 is free for a 19:00 booking —
   * treating the touch point as a clash loses a seating every single turn.
   */
  it("does not treat a clean turnover as a clash", () => {
    expect(rangesOverlap(1140, 1230, 1050, 1140)).toBe(false); // ends exactly at start
    expect(rangesOverlap(1050, 1140, 1140, 1230)).toBe(false);
  });

  it("catches a genuine overlap from either side", () => {
    expect(rangesOverlap(1140, 1230, 1139, 1200)).toBe(true);
    expect(rangesOverlap(1140, 1230, 1200, 1300)).toBe(true);
  });
});

describe("tableCombinations", () => {
  it("seats a party at a single table that fits", () => {
    const combos = tableCombinations([table("t1", 2), table("t2", 4)], 2);
    expect(combos[0]).toEqual(["t1"]);
  });

  /**
   * Best-fit ordering is real restaurant logic: give the deuce the two-top so
   * the four-top survives for a party of four. Without it a dining room strands
   * its large tables early in service.
   */
  it("prefers the tightest fit, then the fewest tables", () => {
    const combos = tableCombinations([table("big", 8), table("small", 2)], 2);
    expect(combos[0]).toEqual(["small"]);
  });

  it("combines two two-tops for a party of four", () => {
    const combos = tableCombinations([table("t1", 2), table("t2", 2)], 4);
    expect(combos).toContainEqual(["t1", "t2"]);
  });

  it("never combines a table the merchant marked non-combinable", () => {
    const combos = tableCombinations(
      [table("t1", 2, { isCombinable: false }), table("t2", 2, { isCombinable: false })],
      4,
    );
    expect(combos).toEqual([]);
  });

  /** A non-combinable table is still perfectly usable on its own. */
  it("still offers a non-combinable table to a party that fits it alone", () => {
    const combos = tableCombinations([table("booth", 4, { isCombinable: false })], 4);
    expect(combos).toEqual([["booth"]]);
  });

  it("respects a minimum capacity, so a deuce cannot take the big round", () => {
    const combos = tableCombinations([table("round", 12, { minCapacity: 6 })], 2);
    expect(combos).toEqual([]);
    expect(tableCombinations([table("round", 12, { minCapacity: 6 })], 6)).toEqual([["round"]]);
  });

  it("returns nothing when the party is larger than the whole room", () => {
    expect(tableCombinations([table("t1", 2), table("t2", 2)], 20)).toEqual([]);
  });

  /** The combinatorial ceiling — three tables, never four. */
  it("stops at the maximum number of pushed-together tables", () => {
    const four = [table("a", 2), table("b", 2), table("c", 2), table("d", 2)];
    expect(tableCombinations(four, 8, 3)).toEqual([]);
    expect(tableCombinations(four, 6, 3)).toContainEqual(["a", "b", "c"]);
  });
});

describe("firstFreeCombination", () => {
  it("skips a set whose table is occupied and returns the next that is free", () => {
    const combos = [["t1"], ["t2"]];
    const free = firstFreeCombination(combos, [busy(["t1"], "19:00")], 1140, 1230);
    expect(free).toEqual(["t2"]);
  });

  it("returns null when everything overlaps", () => {
    const free = firstFreeCombination(
      [["t1"], ["t2"]],
      [busy(["t1"], "19:00"), busy(["t2"], "19:00")],
      1140,
      1230,
    );
    expect(free).toBeNull();
  });

  it("frees a table the moment the previous party's turn ends", () => {
    // Occupied 17:30–19:00; a 19:00 booking is fine.
    const free = firstFreeCombination([["t1"]], [busy(["t1"], "17:30")], 1140, 1230);
    expect(free).toEqual(["t1"]);
  });
});

describe("isBlackedOut", () => {
  it("closes the whole day when both times are null", () => {
    const all: Blackout[] = [{ startTime: null, endTime: null }];
    expect(isBlackedOut(minutesFromHHMM("19:00"), all)).toBe(true);
  });

  it("closes only the window when one is given", () => {
    const evening: Blackout[] = [{ startTime: "18:00", endTime: "20:00" }];
    expect(isBlackedOut(minutesFromHHMM("17:45"), evening)).toBe(false);
    expect(isBlackedOut(minutesFromHHMM("18:00"), evening)).toBe(true);
    expect(isBlackedOut(minutesFromHHMM("20:00"), evening)).toBe(false);
  });
});

describe("computeAvailability", () => {
  it("offers the full grid for an empty restaurant", () => {
    const slots = computeAvailability(input());
    expect(times(slots)).toContain("17:00");
    expect(times(slots)).toContain("22:00");
    expect(slots).toHaveLength(21); // 17:00–22:00 at 15 min
  });

  it("hands back the tables it would hold, so the hold means something", () => {
    const slots = computeAvailability(input({ partySize: 4 }));
    expect(slots[0].tableIds).toEqual(["t3"]); // the four-top, not two deuces
  });

  it("drops a slot whose only table is taken", () => {
    const slots = computeAvailability(
      input({
        partySize: 4,
        tables: [table("t3", 4)],
        occupancy: [busy(["t3"], "19:00", 90, 4)],
      }),
    );
    // 19:00 is blocked, and so is anything whose turn overlaps it.
    expect(times(slots)).not.toContain("19:00");
    expect(times(slots)).toContain("20:30"); // exactly when the turn ends
  });

  /** A live hold occupies a table identically to a booking. */
  it("treats a live hold as occupied", () => {
    const withHold = computeAvailability(
      input({ partySize: 4, tables: [table("t3", 4)], occupancy: [busy(["t3"], "19:00")] }),
    );
    expect(times(withHold)).not.toContain("19:00");
  });

  /**
   * An expired hold is not passed in at all — the query that loads occupancy
   * filters on `expires_at`. This asserts the engine's half of that contract:
   * absent means available, so correctness never depends on the sweeper.
   */
  it("offers a slot again once an expired hold is no longer supplied", () => {
    const slots = computeAvailability(
      input({ partySize: 4, tables: [table("t3", 4)], occupancy: [] }),
    );
    expect(times(slots)).toContain("19:00");
  });

  it("honours a blackout window inside an otherwise open service", () => {
    const slots = computeAvailability(
      input({ blackouts: [{ startTime: "18:00", endTime: "20:00" }] }),
    );
    expect(times(slots)).toContain("17:45");
    expect(times(slots)).not.toContain("18:00");
    expect(times(slots)).not.toContain("19:45");
    expect(times(slots)).toContain("20:00");
  });

  it("offers nothing at all on a whole-day blackout", () => {
    expect(
      computeAvailability(input({ blackouts: [{ startTime: null, endTime: null }] })),
    ).toEqual([]);
  });

  it("hides slots inside the lead time, but only on today", () => {
    const today = computeAvailability(input({ now: { date: FRIDAY, time: "18:30" } }));
    // 60 minutes' lead from 18:30 → first bookable slot is 19:30.
    expect(times(today)).not.toContain("19:15");
    expect(times(today)).toContain("19:30");
  });

  it("applies no lead time to a future date", () => {
    const slots = computeAvailability(
      input({ date: SUNDAY, now: { date: FRIDAY, time: "23:00" } }),
    );
    expect(times(slots)).toContain("17:00");
  });

  it("refuses a date in the past", () => {
    expect(computeAvailability(input({ now: { date: SUNDAY, time: "09:00" } }))).toEqual([]);
  });

  it("refuses a date beyond the booking window", () => {
    const slots = computeAvailability(
      input({ periods: [dinner({ maxAdvanceDays: 1 })], date: SUNDAY, now: MORNING }),
    );
    expect(slots).toEqual([]);
  });

  it("refuses a party outside the period's range", () => {
    expect(computeAvailability(input({ partySize: 9 }))).toEqual([]);
    expect(computeAvailability(input({ partySize: 0 }))).toEqual([]);
  });

  /**
   * Two services on one day become ONE grid in clock order, each slot carrying
   * its own name — which is what lets the button show "12:30 PM / LUNCH" above
   * "7:00 PM / DINNER" without a separate service selector.
   */
  it("merges two services into one grid in clock order", () => {
    const slots = computeAvailability(
      input({
        periods: [
          dinner({ id: "d", name: "Dinner", startTime: "19:00", endTime: "19:30" }),
          dinner({ id: "l", name: "Lunch", startTime: "12:00", endTime: "12:30" }),
        ],
      }),
    );
    expect(times(slots)).toEqual(["12:00", "12:15", "12:30", "19:00", "19:15", "19:30"]);
    expect(slots[0].serviceName).toBe("Lunch");
    expect(slots[3].serviceName).toBe("Dinner");
  });

  describe("the no-floor-plan fallback", () => {
    it("offers slots on the cover cap when there are no tables", () => {
      const slots = computeAvailability(
        input({ tables: [], periods: [dinner({ maxCoversPerSlot: 10 })] }),
      );
      expect(times(slots)).toContain("19:00");
      expect(slots[0].tableIds).toEqual([]);
    });

    it("stops offering a slot once the cap is reached", () => {
      const slots = computeAvailability(
        input({
          tables: [],
          partySize: 4,
          periods: [dinner({ maxCoversPerSlot: 6 })],
          occupancy: [busy([], "19:00", 90, 4)],
        }),
      );
      expect(times(slots)).not.toContain("19:00"); // 4 seated + 4 > 6
      expect(times(slots)).toContain("19:15");
    });

    /**
     * The misconfiguration the settings screen is required to prevent: native
     * booking on with no floor plan and no cap. Offering nothing is the safe
     * reading — the alternative is a page that takes bookings against capacity
     * nobody has declared.
     */
    it("offers nothing with neither tables nor a cap", () => {
      expect(computeAvailability(input({ tables: [], periods: [dinner()] }))).toEqual([]);
    });
  });

  it("offers nothing when the floor plan cannot seat the party at all", () => {
    const slots = computeAvailability(
      input({ partySize: 8, tables: [table("t1", 2, { isCombinable: false })] }),
    );
    expect(slots).toEqual([]);
  });
});

/**
 * Parity with the SQL port, as golden output.
 *
 * `get_public_reservation_availability` answers the fit question differently
 * from this module and has to: enumerating every table combination in SQL would
 * be miserable, so it filters to tables whose `min_capacity` the party meets and
 * asks whether the three largest free ones have enough total capacity. That is
 * provably the same question — every table in a valid set must satisfy the
 * minimum, and the largest k maximise the total — but "provably" is not
 * "proven", and the two could drift apart in a later edit.
 *
 * So each `expected` list below was produced by RUNNING the SQL against
 * Postgres on the fixture beside it, then pasted here. The test asserts this
 * module reproduces it. If either implementation changes behaviour, this fails.
 *
 * Regenerate by running the fit query from
 * supabase/migrations/20260828140000_reservation_availability_function.sql
 * against the same fixture. Fixtures are synthetic so they need no seed data.
 */
describe("parity with the SQL port", () => {
  const period = dinner({ leadTimeMin: 60, turnTimeMin: 90 });
  const at = (hhmm: string) => minutesFromHHMM(hhmm);

  it("matches on a single table blocked mid-service", () => {
    const slots = computeAvailability({
      date: FRIDAY,
      partySize: 4,
      periods: [period],
      blackouts: [],
      tables: [table("11111111-1111-4111-8111-111111111111", 4)],
      occupancy: [
        {
          tableIds: ["11111111-1111-4111-8111-111111111111"],
          startMinutes: at("19:00"),
          endMinutes: at("20:30"),
          partySize: 4,
        },
      ],
      now: MORNING,
    });

    expect(times(slots)).toEqual([
      "17:00", "17:15", "17:30",
      "20:30", "20:45", "21:00", "21:15", "21:30", "21:45", "22:00",
    ]);
  });

  /**
   * The harder one, and the reason the first is not enough on its own: it turns
   * on a non-combinable table, a minimum-capacity exclusion and a two-table
   * combination at once. Between 17:45 and 20:15 the only free tables are one
   * two-top and a twelve-top the party of four is too small for — so neither a
   * single nor a combination fits, which is a conclusion the two
   * implementations reach by quite different routes.
   */
  it("matches with a non-combinable table, a minimum-capacity exclusion and a combination", () => {
    const slots = computeAvailability({
      date: FRIDAY,
      partySize: 4,
      periods: [period],
      blackouts: [],
      tables: [
        table("aaaaaaaa-0000-4000-8000-000000000001", 2),
        table("aaaaaaaa-0000-4000-8000-000000000002", 2),
        table("aaaaaaaa-0000-4000-8000-000000000003", 4, { isCombinable: false }),
        table("aaaaaaaa-0000-4000-8000-000000000004", 12, { minCapacity: 6 }),
      ],
      occupancy: [
        {
          tableIds: ["aaaaaaaa-0000-4000-8000-000000000003"],
          startMinutes: at("19:00"),
          endMinutes: at("20:30"),
          partySize: 4,
        },
        {
          tableIds: ["aaaaaaaa-0000-4000-8000-000000000001"],
          startMinutes: at("19:00"),
          endMinutes: at("20:30"),
          partySize: 2,
        },
      ],
      now: MORNING,
    });

    expect(times(slots)).toEqual([
      "17:00", "17:15", "17:30",
      "20:30", "20:45", "21:00", "21:15", "21:30", "21:45", "22:00",
    ]);
  });
});
