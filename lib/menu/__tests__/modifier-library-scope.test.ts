import { describe, expect, it } from "vitest";
import { canReorderModifierLibrary } from "../modifier-library-scope";

describe("canReorderModifierLibrary", () => {
  it("allows core modifier reordering for a single-location merchant", () => {
    expect(
      canReorderModifierLibrary({
        hasSearch: false,
        isAllLocations: true,
        isSingleLocation: true,
        scopeFilter: "all",
      }),
    ).toBe(true);
  });

  it("preserves the global-filter requirement for multi-location merchants", () => {
    expect(
      canReorderModifierLibrary({
        hasSearch: false,
        isAllLocations: true,
        isSingleLocation: false,
        scopeFilter: "all",
      }),
    ).toBe(false);

    expect(
      canReorderModifierLibrary({
        hasSearch: false,
        isAllLocations: true,
        isSingleLocation: false,
        scopeFilter: "global",
      }),
    ).toBe(true);
  });

  it("disables drag ordering while search changes the visible list", () => {
    expect(
      canReorderModifierLibrary({
        hasSearch: true,
        isAllLocations: true,
        isSingleLocation: true,
        scopeFilter: "all",
      }),
    ).toBe(false);
  });
});

