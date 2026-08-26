import { describe, expect, it } from "vitest";

import { getLocalDateKey } from "@/lib/dates/local-date-key";

describe("getLocalDateKey", () => {
  it("uses the requested location timezone instead of the UTC date", () => {
    const instant = new Date("2026-08-11T02:30:00.000Z");

    expect(getLocalDateKey(instant, "America/New_York")).toBe("2026-08-10");
    expect(getLocalDateKey(instant, "Asia/Beirut")).toBe("2026-08-11");
  });

  it("falls back to browser-local calendar parts for an invalid timezone", () => {
    const instant = new Date(2026, 7, 11, 12, 0, 0);

    expect(getLocalDateKey(instant, "Not/A_Timezone")).toBe("2026-08-11");
  });
});
