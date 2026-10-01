import { describe, expect, it } from "vitest";
import { isScheduleDayOpen } from "./business-hours";

describe("isScheduleDayOpen", () => {
  it("honors the online-ordering `enabled` flag", () => {
    expect(isScheduleDayOpen({ enabled: true })).toBe(true);
    expect(isScheduleDayOpen({ enabled: false })).toBe(false);
  });

  it("honors the location Hours tab `is_closed` flag", () => {
    expect(isScheduleDayOpen({ is_closed: false })).toBe(true);
    expect(isScheduleDayOpen({ is_closed: true })).toBe(false);
  });

  it("honors the legacy `closed` flag", () => {
    expect(isScheduleDayOpen({ closed: true })).toBe(false);
  });

  it("treats a day with no flags as open", () => {
    expect(isScheduleDayOpen({})).toBe(true);
  });
});
