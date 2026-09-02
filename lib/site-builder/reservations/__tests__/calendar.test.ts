import { describe, expect, it } from "vitest";

import {
  isSelectable,
  monthGrid,
  monthHasSelectableDay,
  shiftMonth,
  shortDate,
  WEEKDAY_INITIALS,
} from "../calendar";

describe("monthGrid", () => {
  it("pads the first week so the 1st lands on its real weekday", () => {
    // 1 Aug 2026 is a Saturday, so six blanks precede it.
    const { weeks } = monthGrid("2026-08-30");
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-08-01"]);
  });

  it("starts a month that begins on a Sunday with no padding", () => {
    // 1 Nov 2026 is a Sunday.
    const { weeks } = monthGrid("2026-11-15");
    expect(weeks[0][0]).toBe("2026-11-01");
  });

  it("holds every day of the month exactly once, in order", () => {
    const days = monthGrid("2026-08-01")
      .weeks.flat()
      .filter((d): d is string => d !== null);

    expect(days).toHaveLength(31);
    expect(days[0]).toBe("2026-08-01");
    expect(days[30]).toBe("2026-08-31");
    expect([...days].sort()).toEqual(days);
  });

  it("handles a leap February", () => {
    const days = monthGrid("2028-02-10")
      .weeks.flat()
      .filter((d): d is string => d !== null);

    expect(days).toHaveLength(29);
    expect(days[28]).toBe("2028-02-29");
  });

  it("handles a common February", () => {
    const days = monthGrid("2027-02-10")
      .weeks.flat()
      .filter((d): d is string => d !== null);

    expect(days).toHaveLength(28);
  });

  /** A grid that changes height moves the arrows out from under the pointer. */
  it("is always six rows of seven", () => {
    for (const anchor of ["2026-02-01", "2026-08-01", "2026-11-01", "2028-02-01"]) {
      const { weeks } = monthGrid(anchor);
      expect(weeks).toHaveLength(6);
      for (const week of weeks) expect(week).toHaveLength(7);
    }
  });

  it("never borrows a day from a neighbouring month", () => {
    const days = monthGrid("2026-08-01")
      .weeks.flat()
      .filter((d): d is string => d !== null);

    expect(days.every((d) => d.startsWith("2026-08"))).toBe(true);
  });

  it("reports the first of the month as its anchor whatever day was passed", () => {
    expect(monthGrid("2026-08-30").firstDay).toBe("2026-08-01");
    expect(monthGrid("2026-08-01").firstDay).toBe("2026-08-01");
  });

  it("has seven weekday initials, Sunday first", () => {
    expect(WEEKDAY_INITIALS).toHaveLength(7);
    expect(WEEKDAY_INITIALS[0]).toBe("S");
    expect(WEEKDAY_INITIALS[6]).toBe("S");
  });
});

describe("shiftMonth", () => {
  it("steps forward and back", () => {
    expect(shiftMonth("2026-08-30", 1)).toBe("2026-09-01");
    expect(shiftMonth("2026-08-30", -1)).toBe("2026-07-01");
  });

  it("crosses a year boundary in both directions", () => {
    expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-01");
  });

  it("lands on the first even from the 31st", () => {
    // Stepping from 31 Jan must not spill into March.
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-01");
  });
});

describe("isSelectable", () => {
  it("includes both ends of the window", () => {
    expect(isSelectable("2026-08-30", "2026-08-30", "2026-10-29")).toBe(true);
    expect(isSelectable("2026-10-29", "2026-08-30", "2026-10-29")).toBe(true);
  });

  it("excludes the day either side of it", () => {
    expect(isSelectable("2026-08-29", "2026-08-30", "2026-10-29")).toBe(false);
    expect(isSelectable("2026-10-30", "2026-08-30", "2026-10-29")).toBe(false);
  });
});

describe("monthHasSelectableDay", () => {
  const min = "2026-08-30";
  const max = "2026-10-29";

  it("is true for a month with any bookable day", () => {
    expect(monthHasSelectableDay("2026-08-01", min, max)).toBe(true);
    expect(monthHasSelectableDay("2026-09-01", min, max)).toBe(true);
    expect(monthHasSelectableDay("2026-10-01", min, max)).toBe(true);
  });

  it("is false for a month entirely outside the window", () => {
    expect(monthHasSelectableDay("2026-07-01", min, max)).toBe(false);
    expect(monthHasSelectableDay("2026-11-01", min, max)).toBe(false);
  });
});

describe("shortDate", () => {
  it("names the day the way the pill shows it", () => {
    expect(shortDate("2026-08-30")).toBe("Sun, Aug 30");
  });

  /** Built through UTC, so it cannot slide to the previous day. */
  it("does not shift across the date line", () => {
    expect(shortDate("2026-01-01")).toContain("Jan 1");
  });
});
