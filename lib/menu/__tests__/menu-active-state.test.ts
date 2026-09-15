import { describe, expect, it } from "vitest";

import {
  applyMenuActiveState,
  applySingleMenuActiveState,
} from "@/lib/menu/menu-active-state";

describe("optimistic menu active state", () => {
  it("updates only the requested menu without mutating the cached list", () => {
    const original = [
      { id: "menu-a", is_active: true, name: "Breakfast" },
      { id: "menu-b", is_active: true, name: "Dinner" },
    ];

    const updated = applyMenuActiveState(original, "menu-a", false);

    expect(updated).toEqual([
      { id: "menu-a", is_active: false, name: "Breakfast" },
      { id: "menu-b", is_active: true, name: "Dinner" },
    ]);
    expect(original[0].is_active).toBe(true);
    expect(updated?.[1]).toBe(original[1]);
  });

  it("updates the menu detail cache", () => {
    const menu = { id: "menu-a", is_active: false, name: "Breakfast" };
    expect(applySingleMenuActiveState(menu, "menu-a", true)).toEqual({
      ...menu,
      is_active: true,
    });
  });
});
