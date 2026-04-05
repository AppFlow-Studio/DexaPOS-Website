import { describe, it, expect } from "vitest";
import {
  effectiveScopeForRole,
  canEditAtScope,
  type RoleLite,
} from "../role-scope";
import type { CascadeLevel, ScopeContext } from "../cascade-labels";

const owner: RoleLite = {
  isOwnerOrAdmin: true,
  isManager: false,
  isMember: false,
  assignedLocationIds: [],
};

const manager: RoleLite = {
  isOwnerOrAdmin: false,
  isManager: true,
  isMember: false,
  assignedLocationIds: ["loc-1"],
};

const member: RoleLite = {
  isOwnerOrAdmin: false,
  isManager: false,
  isMember: true,
  assignedLocationIds: [],
};

const LEVELS: CascadeLevel[] = [1, 2, 3, 4, 5];

function ctxAt(level: CascadeLevel): ScopeContext {
  switch (level) {
    case 1:
      return { level: 1 };
    case 2:
      return { level: 2, locationName: "Uptown" };
    case 3:
      return { level: 3, categoryName: "Burgers" };
    case 4:
      return { level: 4, categoryName: "Burgers", locationName: "Uptown" };
    case 5:
      return { level: 5, menuName: "Lunch", locationName: "Uptown" };
  }
}

describe("effectiveScopeForRole", () => {
  describe("owner", () => {
    it("returns rawScope unchanged at every level", () => {
      for (const level of LEVELS) {
        const ctx = ctxAt(level);
        expect(effectiveScopeForRole(ctx, owner, "Downtown")).toEqual(ctx);
        expect(effectiveScopeForRole(ctx, owner, null)).toEqual(ctx);
      }
    });
  });

  describe("member", () => {
    it("returns rawScope unchanged at every level", () => {
      for (const level of LEVELS) {
        const ctx = ctxAt(level);
        expect(effectiveScopeForRole(ctx, member, "Downtown")).toEqual(ctx);
        expect(effectiveScopeForRole(ctx, member, null)).toEqual(ctx);
      }
    });
  });

  describe("manager", () => {
    it("L1 → L2 when a location anchor is provided", () => {
      expect(effectiveScopeForRole(ctxAt(1), manager, "Downtown")).toEqual({
        level: 2,
        locationName: "Downtown",
      });
    });

    it("L1 → L1 (unchanged) when no anchor provided", () => {
      expect(effectiveScopeForRole(ctxAt(1), manager, null)).toEqual(ctxAt(1));
      expect(effectiveScopeForRole(ctxAt(1), manager, undefined)).toEqual(
        ctxAt(1),
      );
    });

    it("L3 → L4 when a location anchor is provided", () => {
      expect(effectiveScopeForRole(ctxAt(3), manager, "Downtown")).toEqual({
        level: 4,
        categoryName: "Burgers",
        locationName: "Downtown",
      });
    });

    it("L3 → L3 (unchanged) when no anchor provided", () => {
      expect(effectiveScopeForRole(ctxAt(3), manager, null)).toEqual(ctxAt(3));
    });

    it("L2/L4/L5 are returned unchanged (already location-scoped)", () => {
      expect(effectiveScopeForRole(ctxAt(2), manager, "Downtown")).toEqual(
        ctxAt(2),
      );
      expect(effectiveScopeForRole(ctxAt(4), manager, "Downtown")).toEqual(
        ctxAt(4),
      );
      expect(effectiveScopeForRole(ctxAt(5), manager, "Downtown")).toEqual(
        ctxAt(5),
      );
    });
  });

  it("null / undefined role passes through unchanged", () => {
    for (const level of LEVELS) {
      const ctx = ctxAt(level);
      expect(effectiveScopeForRole(ctx, null, "Downtown")).toEqual(ctx);
      expect(effectiveScopeForRole(ctx, undefined, "Downtown")).toEqual(ctx);
    }
  });
});

describe("canEditAtScope", () => {
  it("owner can edit at every level", () => {
    for (const level of LEVELS) {
      expect(canEditAtScope(ctxAt(level), owner)).toBe(true);
    }
  });

  it("member can never edit", () => {
    for (const level of LEVELS) {
      expect(canEditAtScope(ctxAt(level), member)).toBe(false);
    }
  });

  it("manager can edit only L2/L4/L5", () => {
    expect(canEditAtScope(ctxAt(1), manager)).toBe(false);
    expect(canEditAtScope(ctxAt(2), manager)).toBe(true);
    expect(canEditAtScope(ctxAt(3), manager)).toBe(false);
    expect(canEditAtScope(ctxAt(4), manager)).toBe(true);
    expect(canEditAtScope(ctxAt(5), manager)).toBe(true);
  });

  it("null / undefined role cannot edit", () => {
    for (const level of LEVELS) {
      expect(canEditAtScope(ctxAt(level), null)).toBe(false);
      expect(canEditAtScope(ctxAt(level), undefined)).toBe(false);
    }
  });
});
