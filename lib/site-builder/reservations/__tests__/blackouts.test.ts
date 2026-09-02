import { describe, expect, it } from "vitest";

import {
  BLANK_BLACKOUT,
  describeBlackout,
  formatBlackoutDate,
  isPastBlackout,
  validateBlackout,
  type BlackoutInput,
} from "../blackouts";

/**
 * Every rule here mirrors the `reservation_blackouts_window` CHECK constraint.
 * The constraint is the real guarantee; these tests exist so the merchant-facing
 * validator cannot drift away from it and start accepting rows the database
 * then rejects with a message nobody can read.
 */

const WHOLE_DAY: BlackoutInput = {
  date: "2026-12-31",
  startTime: null,
  endTime: null,
  reason: "New Year's Eve buyout",
};

const WINDOW: BlackoutInput = {
  date: "2026-09-14",
  startTime: "17:00",
  endTime: "23:00",
  reason: "Wedding",
};

describe("validateBlackout", () => {
  it("accepts a whole day with both times null", () => {
    expect(validateBlackout(WHOLE_DAY)).toBeNull();
  });

  it("accepts a window inside a day", () => {
    expect(validateBlackout(WINDOW)).toBeNull();
  });

  it("rejects a date that is not a date", () => {
    expect(validateBlackout({ ...WHOLE_DAY, date: "" })).toContain("date");
    expect(validateBlackout({ ...WHOLE_DAY, date: "31/12/2026" })).toContain("date");
  });

  /**
   * The constraint's exact shape: both times, or neither. "Closed from 7pm
   * until unspecified" is either the rest of the day or nothing at all, and the
   * database will not store the ambiguity.
   */
  it("rejects a half-specified window in either direction", () => {
    expect(validateBlackout({ ...WINDOW, endTime: null })).toContain("both");
    expect(validateBlackout({ ...WINDOW, startTime: null })).toContain("both");
  });

  /** Empty string is how a cleared `<input type="time">` reports itself. */
  it("treats a cleared time field as absent, not as a malformed time", () => {
    expect(validateBlackout({ ...WINDOW, startTime: "", endTime: "" })).toBeNull();
    expect(validateBlackout({ ...WINDOW, endTime: "" })).toContain("both");
  });

  it("rejects a window that ends before it starts", () => {
    expect(validateBlackout({ ...WINDOW, startTime: "23:00", endTime: "17:00" })).toContain(
      "end after it starts",
    );
  });

  /** Equal times close nothing at all, which the constraint also refuses. */
  it("rejects a zero-length window", () => {
    expect(validateBlackout({ ...WINDOW, startTime: "19:00", endTime: "19:00" })).toContain(
      "end after it starts",
    );
  });

  it("rejects a time that is not a time", () => {
    expect(validateBlackout({ ...WINDOW, startTime: "5pm" })).toContain("17:00");
    expect(validateBlackout({ ...WINDOW, startTime: "25:00" })).toContain("17:00");
  });

  it("starts from a valid whole-day blank", () => {
    expect(BLANK_BLACKOUT.startTime).toBeNull();
    expect(BLANK_BLACKOUT.endTime).toBeNull();
    // The blank has no date yet, so it is not saveable — the screen gates on
    // that separately rather than showing an error before anything is typed.
    expect(validateBlackout(BLANK_BLACKOUT)).toContain("date");
  });
});

describe("describeBlackout", () => {
  it("says all day when there is no window", () => {
    expect(describeBlackout(WHOLE_DAY)).toBe("Closed all day");
  });

  it("names the window when there is one", () => {
    expect(describeBlackout(WINDOW)).toBe("Closed 17:00–23:00");
  });
});

describe("formatBlackoutDate", () => {
  /**
   * Parsed as a plain calendar date, never as an instant. `new Date("2026-01-01")`
   * is midnight UTC, which in any negative offset renders as 31 December — and a
   * merchant told they closed the wrong day stops trusting the screen.
   */
  it("does not roll back a day in a western timezone", () => {
    expect(formatBlackoutDate("2026-01-01")).toContain("2026");
    expect(formatBlackoutDate("2026-01-01")).toContain("1");
    expect(formatBlackoutDate("2026-01-01")).not.toContain("2025");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(formatBlackoutDate("not-a-date")).toBe("not-a-date");
  });
});

describe("isPastBlackout", () => {
  it("counts today as still upcoming", () => {
    expect(isPastBlackout({ ...WHOLE_DAY, date: "2026-08-28" }, "2026-08-28")).toBe(false);
  });

  it("counts yesterday as past", () => {
    expect(isPastBlackout({ ...WHOLE_DAY, date: "2026-08-27" }, "2026-08-28")).toBe(true);
  });
});
