import { describe, expect, it } from "vitest";

import { getTaxPercentageError } from "@/lib/settings/tax-validation";

describe("getTaxPercentageError", () => {
  it.each(["0", "8.875", "100"])("accepts %s", (value) => {
    expect(getTaxPercentageError(value)).toBeNull();
  });

  it("requires a value", () => {
    expect(getTaxPercentageError(" ")).toBe("Tax percentage is required.");
  });

  it("rejects non-numeric and out-of-range values", () => {
    expect(getTaxPercentageError("8.5%")).toBe("Enter a valid tax percentage.");
    expect(getTaxPercentageError("-0.01")).toBe(
      "Tax percentage must be between 0 and 100.",
    );
    expect(getTaxPercentageError("100.01")).toBe(
      "Tax percentage must be between 0 and 100.",
    );
  });
});
