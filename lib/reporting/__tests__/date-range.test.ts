import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseReportDateKey } from "../date-range";

describe("parseReportDateKey", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/New_York";
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("keeps the calendar day for a viewer west of UTC", () => {
    const parsed = parseReportDateKey("2026-09-02");

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(2);
    expect(
      parsed.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    ).toBe("Wed, Sep 2");
  });

  it("documents the bug it replaces: Date parsing shifts the day back", () => {
    expect(new Date("2026-09-02").getDate()).toBe(1);
  });

  it("ignores a trailing time component", () => {
    expect(parseReportDateKey("2026-09-02T00:00:00Z").getDate()).toBe(2);
  });
});
