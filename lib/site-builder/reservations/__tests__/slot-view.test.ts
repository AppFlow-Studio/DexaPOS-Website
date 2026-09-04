import { describe, expect, it } from "vitest";

import type { AvailabilitySlot } from "../protocol";
import {
  availableHours,
  filterSlotsNearHour,
  groupSlotsByService,
  prettyHour,
} from "../slot-view";

const DINNER = "11111111-1111-1111-1111-111111111111";
const LUNCH = "22222222-2222-2222-2222-222222222222";
const BAR = "33333333-3333-3333-3333-333333333333";
const DINNER_WEEKEND = "44444444-4444-4444-4444-444444444444";

function slot(time: string, servicePeriodId: string, serviceName: string): AvailabilitySlot {
  return { time, servicePeriodId, serviceName };
}

/**
 * The endpoint hands the widget rows straight from a function that ends
 * `ORDER BY 1` on slot time, so every fixture here is built time-ascending
 * across all periods — including where two services overlap.
 */
describe("groupSlotsByService", () => {
  it("returns nothing for a day with no tables", () => {
    expect(groupSlotsByService([])).toEqual([]);
  });

  it("puts a single service in one group and carries its name", () => {
    const groups = groupSlotsByService([
      slot("17:00", DINNER, "Dinner"),
      slot("17:15", DINNER, "Dinner"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Dinner");
    expect(groups[0].slots.map((s) => s.time)).toEqual(["17:00", "17:15"]);
  });

  it("splits two services, earliest first, keeping each name", () => {
    const groups = groupSlotsByService([
      slot("12:00", LUNCH, "Lunch"),
      slot("12:15", LUNCH, "Lunch"),
      slot("17:00", DINNER, "Dinner"),
      slot("17:15", DINNER, "Dinner"),
    ]);

    expect(groups.map((g) => g.name)).toEqual(["Lunch", "Dinner"]);
    expect(groups[0].slots).toHaveLength(2);
    expect(groups[1].slots).toHaveLength(2);
  });

  /**
   * The case that rules out collecting adjacent runs: a bar service alongside
   * dinner makes the RPC alternate between two periods on every row, which a
   * single pass would turn into four one-slot groups.
   */
  it("gathers overlapping services rather than alternating between them", () => {
    const groups = groupSlotsByService([
      slot("17:00", DINNER, "Dinner"),
      slot("17:00", BAR, "Bar"),
      slot("17:15", DINNER, "Dinner"),
      slot("17:15", BAR, "Bar"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.name)).toEqual(["Dinner", "Bar"]);
    expect(groups[0].slots.map((s) => s.time)).toEqual(["17:00", "17:15"]);
    expect(groups[1].slots.map((s) => s.time)).toEqual(["17:00", "17:15"]);
  });

  it("keeps the same clock time offered by two services as two bookable slots", () => {
    const groups = groupSlotsByService([
      slot("17:00", DINNER, "Dinner"),
      slot("17:00", BAR, "Bar"),
    ]);

    expect(groups.flatMap((g) => g.slots)).toHaveLength(2);
  });

  it("merges two periods that share a name into one heading", () => {
    const groups = groupSlotsByService([
      slot("17:00", DINNER, "Dinner"),
      slot("17:15", DINNER_WEEKEND, "Dinner"),
      slot("17:30", DINNER, "Dinner"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Dinner");
    expect(groups[0].slots.map((s) => s.time)).toEqual(["17:00", "17:15", "17:30"]);
  });

  it("does not merge unnamed periods, having nothing to call them", () => {
    const groups = groupSlotsByService([
      slot("17:00", DINNER, ""),
      slot("17:15", BAR, ""),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.name === "")).toBe(true);
  });

  it("treats a whitespace-only service name as unnamed", () => {
    const groups = groupSlotsByService([slot("17:00", DINNER, "   ")]);
    expect(groups[0].name).toBe("");
  });

  it("keeps slot order inside a group", () => {
    const groups = groupSlotsByService([
      slot("18:00", DINNER, "Dinner"),
      slot("18:15", DINNER, "Dinner"),
      slot("18:30", DINNER, "Dinner"),
    ]);

    expect(groups[0].slots.map((s) => s.time)).toEqual(["18:00", "18:15", "18:30"]);
  });
});

describe("availableHours", () => {
  it("offers only hours that actually have a table", () => {
    const hours = availableHours([
      slot("12:45", LUNCH, "Lunch"),
      slot("13:00", LUNCH, "Lunch"),
      slot("19:00", DINNER, "Dinner"),
    ]);

    expect(hours).toEqual([12, 13, 19]);
  });

  it("de-duplicates and sorts", () => {
    const hours = availableHours([
      slot("19:45", DINNER, "Dinner"),
      slot("19:00", DINNER, "Dinner"),
      slot("18:30", DINNER, "Dinner"),
    ]);

    expect(hours).toEqual([18, 19]);
  });

  it("has nothing to offer for an empty day", () => {
    expect(availableHours([])).toEqual([]);
  });
});

describe("filterSlotsNearHour", () => {
  const day = [
    slot("17:00", DINNER, "Dinner"),
    slot("17:45", DINNER, "Dinner"),
    slot("18:00", DINNER, "Dinner"),
    slot("19:00", DINNER, "Dinner"),
    slot("20:00", DINNER, "Dinner"),
    slot("21:00", DINNER, "Dinner"),
  ];

  it("keeps an hour either side of the chosen time", () => {
    expect(filterSlotsNearHour(day, 19).map((s) => s.time)).toEqual([
      "18:00",
      "19:00",
      "20:00",
    ]);
  });

  it("includes the window edges", () => {
    expect(filterSlotsNearHour(day, 18).map((s) => s.time)).toEqual([
      "17:00",
      "17:45",
      "18:00",
      "19:00",
    ]);
  });

  /** A guest wanting seven should still be shown the 6:45 table. */
  it("looks earlier as well as later", () => {
    const times = filterSlotsNearHour(
      [slot("18:45", DINNER, "Dinner"), slot("19:15", DINNER, "Dinner")],
      19,
    ).map((s) => s.time);

    expect(times).toEqual(["18:45", "19:15"]);
  });

  it("can legitimately match nothing", () => {
    expect(filterSlotsNearHour(day, 12)).toEqual([]);
  });

  it("honours a custom window", () => {
    expect(filterSlotsNearHour(day, 19, 15).map((s) => s.time)).toEqual(["19:00"]);
  });

  it("preserves the period each surviving slot came from", () => {
    const mixed = [slot("18:00", LUNCH, "Lunch"), slot("18:15", DINNER, "Dinner")];
    expect(filterSlotsNearHour(mixed, 18).map((s) => s.servicePeriodId)).toEqual([
      LUNCH,
      DINNER,
    ]);
  });
});

describe("prettyHour", () => {
  it("names hours the way a guest reads a clock", () => {
    expect(prettyHour(0)).toBe("12 AM");
    expect(prettyHour(11)).toBe("11 AM");
    expect(prettyHour(12)).toBe("12 PM");
    expect(prettyHour(19)).toBe("7 PM");
    expect(prettyHour(23)).toBe("11 PM");
  });
});
