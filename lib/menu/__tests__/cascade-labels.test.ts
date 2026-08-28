import { describe, it, expect } from "vitest";
import {
  scopeLabel,
  affectsLabel,
  scopeDescription,
  scopeShortName,
  scopeIcon,
  scopeColor,
  deriveScopeFromContext,
} from "../cascade-labels";

describe("scopeLabel", () => {
  it("returns 'Everywhere' for L1", () => {
    expect(scopeLabel({ level: 1 })).toBe("Everywhere");
  });

  it("returns '{category} category' for L2", () => {
    expect(scopeLabel({ level: 2, categoryName: "Burgers" })).toBe(
      "Burgers category",
    );
  });

  it("returns '{category} at {location}' for L3", () => {
    expect(
      scopeLabel({
        level: 3,
        categoryName: "Burgers",
        locationName: "Downtown",
      }),
    ).toBe(
      "Burgers at Downtown",
    );
  });

  it("returns '{menu} menu – {category}' for L4", () => {
    expect(
      scopeLabel({
        level: 4,
        menuName: "Lunch",
        categoryName: "Burgers",
      }),
    ).toBe("Lunch menu – Burgers");
  });

  it("returns '{menu} menu at {location}' for L5", () => {
    expect(
      scopeLabel({ level: 5, menuName: "Lunch", locationName: "Downtown" }),
    ).toBe("Lunch menu at Downtown");
  });

  it("handles missing names gracefully", () => {
    expect(scopeLabel({ level: 2 })).toBe("Category default");
    expect(scopeLabel({ level: 5 })).toBe("Branch menu");
    expect(scopeLabel({ level: 4 })).toBe("Menu category");
  });
});

describe("affectsLabel", () => {
  it("returns 'all locations' for L1", () => {
    expect(affectsLabel({ level: 1 })).toBe("all locations");
  });

  it("returns '{category} category, all locations' for L2", () => {
    expect(affectsLabel({ level: 2, categoryName: "Burgers" })).toBe(
      "Burgers category, all locations",
    );
  });

  it("returns full affect label for L5", () => {
    expect(
      affectsLabel({ level: 5, menuName: "Lunch", locationName: "Downtown" }),
    ).toBe("Lunch menu at Downtown only");
  });

  it("handles L4 correctly", () => {
    expect(
      affectsLabel({
        level: 4,
        menuName: "Lunch",
        categoryName: "Burgers",
      }),
    ).toBe("Lunch menu – Burgers, all locations");
  });

  it("falls back sensibly when names missing", () => {
    expect(affectsLabel({ level: 2 })).toBe("this category, all locations");
    expect(affectsLabel({ level: 3 })).toBe("this category at this branch only");
    expect(affectsLabel({ level: 4 })).toBe("this menu, all locations");
  });

  it("describes a location-only item edit without category copy", () => {
    const label = affectsLabel({
      level: 3,
      scopeType: "location-item",
      locationName: "Downtown Hamra",
    });

    expect(label).toBe("Downtown Hamra only");
    expect(label).not.toMatch(/category\s+category/i);
  });
});

describe("scopeDescription", () => {
  it("describes L1 as applying everywhere", () => {
    expect(scopeDescription({ level: 1 })).toMatch(/everywhere/i);
  });

  it("mentions category name for L2", () => {
    expect(scopeDescription({ level: 2, categoryName: "Appetizers" })).toMatch(
      /Appetizers/,
    );
  });
});

describe("scopeShortName", () => {
  it("returns short developer-style names", () => {
    expect(scopeShortName(1)).toBe("Global");
    expect(scopeShortName(2)).toBe("Global Category");
    expect(scopeShortName(3)).toBe("Branch Category");
    expect(scopeShortName(4)).toBe("Global Menu");
    expect(scopeShortName(5)).toBe("Branch Menu");
  });
});

describe("scopeIcon", () => {
  it("returns distinct icons per level", () => {
    const icons = [1, 2, 3, 4, 5].map((l) => scopeIcon(l as 1));
    const unique = new Set(icons);
    expect(unique.size).toBe(5);
  });
});

describe("scopeColor", () => {
  it("returns tailwind classes for all 5 levels", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const c = scopeColor(level);
      expect(c.text).toMatch(/^text-/);
      expect(c.bg).toMatch(/^bg-/);
      expect(c.border).toMatch(/^border-/);
      expect(c.dot).toMatch(/^bg-/);
    }
  });

  it("uses emerald for L1 and rose for L5", () => {
    expect(scopeColor(1).text).toMatch(/emerald/);
    expect(scopeColor(5).text).toMatch(/rose/);
  });
});

describe("deriveScopeFromContext", () => {
  it("returns L1 for all-locations, no category, no menu", () => {
    expect(
      deriveScopeFromContext({ isAllLocations: true }),
    ).toEqual({ level: 1 });
  });

  it("returns L1 for location-selected, no category", () => {
    expect(
      deriveScopeFromContext({
        isAllLocations: false,
        locationName: "Downtown",
      }),
    ).toEqual({ level: 1 });
  });

  it("returns L2 for all-locations with category", () => {
    expect(
      deriveScopeFromContext({
        isAllLocations: true,
        categoryName: "Burgers",
      }),
    ).toEqual({ level: 2, categoryName: "Burgers" });
  });

  it("returns L3 for location + category", () => {
    const ctx = deriveScopeFromContext({
      isAllLocations: false,
      locationName: "Downtown",
      categoryName: "Burgers",
    });
    expect(ctx.level).toBe(3);
    expect(ctx.locationName).toBe("Downtown");
    expect(ctx.categoryName).toBe("Burgers");
  });

  it("returns L5 for location + category + menu", () => {
    const ctx = deriveScopeFromContext({
      isAllLocations: false,
      locationName: "Downtown",
      categoryName: "Burgers",
      menuName: "Lunch",
    });
    expect(ctx.level).toBe(5);
    expect(ctx.menuName).toBe("Lunch");
    expect(ctx.locationName).toBe("Downtown");
  });
});
