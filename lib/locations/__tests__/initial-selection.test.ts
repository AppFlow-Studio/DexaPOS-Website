import { describe, expect, it } from "vitest";
import { resolveInitialLocationSelection } from "../initial-selection";

const locations = [
  { id: "first", is_active: true },
  { id: "primary", is_active: true, is_primary_location: true },
  { id: "inactive", is_active: false, is_primary_location: true },
];

describe("resolveInitialLocationSelection", () => {
  it("keeps the internal shared scope for a single active location", () => {
    expect(resolveInitialLocationSelection("first", [locations[0]])).toBe("all");
  });

  it("prefers the primary active branch over the old all-locations default", () => {
    expect(resolveInitialLocationSelection("all", locations)).toBe("primary");
  });

  it("preserves the last-used accessible branch", () => {
    expect(resolveInitialLocationSelection("first", locations)).toBe("first");
  });

  it("repairs an inaccessible or inactive persisted branch", () => {
    expect(resolveInitialLocationSelection("inactive", locations)).toBe("primary");
    expect(resolveInitialLocationSelection("deleted", locations)).toBe("primary");
  });

  it("does not select a branch when none is active", () => {
    expect(resolveInitialLocationSelection("all", [])).toBe("all");
  });
});
