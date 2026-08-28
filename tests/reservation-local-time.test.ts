import { describe, expect, it } from "vitest";
import {
  isPastAtLocation,
  zonedDateTimeParts,
  zonedToday,
} from "@/lib/reservations/local-time";

const NY = "America/New_York";
const PHOENIX = "America/Phoenix";

describe("zonedToday", () => {
  it("returns the location's calendar date, not the UTC one", () => {
    // 2026-08-06T02:30Z is still Aug 5th (10:30pm) in New York.
    const instant = new Date("2026-08-06T02:30:00Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-08-06");
    expect(zonedToday(NY, instant)).toBe("2026-08-05");
  });

  it("agrees with UTC during the middle of the local day", () => {
    const instant = new Date("2026-08-06T16:00:00Z"); // noon in NY
    expect(zonedToday(NY, instant)).toBe("2026-08-06");
  });

  it("handles a zone with no DST", () => {
    // Phoenix is UTC-7 year round.
    const instant = new Date("2026-08-06T05:30:00Z"); // 10:30pm Aug 5 in Phoenix
    expect(zonedToday(PHOENIX, instant)).toBe("2026-08-05");
  });
});

describe("zonedDateTimeParts", () => {
  it("splits into padded date and HH:MM time", () => {
    const instant = new Date("2026-08-06T07:05:00Z"); // 03:05 in NY
    expect(zonedDateTimeParts(NY, instant)).toEqual({
      date: "2026-08-06",
      time: "03:05",
    });
  });
});

describe("isPastAtLocation", () => {
  // The exact scenario that produced the P0001: 07:05 UTC is only 03:05 in
  // New York, so a 6am local booking is four hours in the FUTURE even though
  // it is in the past by the UTC clock.
  const instant = new Date("2026-08-06T07:05:00Z");

  it("treats a later time today as future", () => {
    expect(isPastAtLocation("2026-08-06", "06:00", NY, instant)).toBe(false);
    expect(isPastAtLocation("2026-08-06", "19:00", NY, instant)).toBe(false);
  });

  it("treats an earlier time today as past", () => {
    expect(isPastAtLocation("2026-08-06", "02:00", NY, instant)).toBe(true);
  });

  it("treats a previous date as past regardless of time", () => {
    expect(isPastAtLocation("2026-08-05", "23:59", NY, instant)).toBe(true);
  });

  it("treats a future date as future regardless of time", () => {
    expect(isPastAtLocation("2026-08-07", "00:01", NY, instant)).toBe(false);
  });

  it("is exclusive at the current minute", () => {
    expect(isPastAtLocation("2026-08-06", "03:05", NY, instant)).toBe(false);
    expect(isPastAtLocation("2026-08-06", "03:04", NY, instant)).toBe(true);
  });

  it("differs by zone for the same instant", () => {
    // 05:00 local is past in NY (03:05) only if earlier; in Phoenix it is
    // 00:05, so a 05:00 booking is still ahead.
    expect(isPastAtLocation("2026-08-06", "05:00", NY, instant)).toBe(false);
    expect(isPastAtLocation("2026-08-06", "05:00", PHOENIX, instant)).toBe(false);
    expect(isPastAtLocation("2026-08-06", "00:02", PHOENIX, instant)).toBe(true);
  });
});
