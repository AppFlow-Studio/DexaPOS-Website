import { describe, expect, it } from "vitest";
import {
  DEFAULT_POS_CONFIG,
  getEffectivePosConfig,
  normalizeOrderNumberScope,
  normalizePosConfig,
} from "@/lib/pos/pos-config";

describe("normalizeOrderNumberScope", () => {
  it("passes through the two valid scopes", () => {
    expect(normalizeOrderNumberScope("per_station")).toBe("per_station");
    expect(normalizeOrderNumberScope("location_wide")).toBe("location_wide");
  });

  it("falls back to per_station for anything else", () => {
    expect(normalizeOrderNumberScope(undefined)).toBe("per_station");
    expect(normalizeOrderNumberScope(null)).toBe("per_station");
    expect(normalizeOrderNumberScope("")).toBe("per_station");
    expect(normalizeOrderNumberScope("nonsense")).toBe("per_station");
    expect(normalizeOrderNumberScope(42)).toBe("per_station");
    expect(normalizeOrderNumberScope({})).toBe("per_station");
  });
});

describe("normalizePosConfig — ordering", () => {
  it("defaults ordering to per_station when absent", () => {
    const config = normalizePosConfig({});
    expect(config.ordering.orderNumberScope).toBe("per_station");
  });

  it("preserves a saved location_wide scope", () => {
    const config = normalizePosConfig({
      ordering: { orderNumberScope: "location_wide" },
    });
    expect(config.ordering.orderNumberScope).toBe("location_wide");
  });

  it("coerces a garbage scope back to per_station without throwing", () => {
    const config = normalizePosConfig({
      ordering: { orderNumberScope: "grubhub" },
    });
    expect(config.ordering.orderNumberScope).toBe("per_station");
  });

  it("tolerates a non-object ordering value", () => {
    const config = normalizePosConfig({ ordering: "location_wide" });
    expect(config.ordering.orderNumberScope).toBe("per_station");
  });

  it("does not disturb the other sections", () => {
    const config = normalizePosConfig({
      ordering: { orderNumberScope: "location_wide" },
    });
    expect(config.printing).toEqual(DEFAULT_POS_CONFIG.printing);
    expect(config.payment).toEqual(DEFAULT_POS_CONFIG.payment);
    expect(config._schema).toBe("pos_config_v1");
  });
});

describe("getEffectivePosConfig — ordering is location-only", () => {
  it("keeps the location scope regardless of station overrides", () => {
    const effective = getEffectivePosConfig(
      { ordering: { orderNumberScope: "location_wide" } },
      { display: { uiScale: "large" } },
    );
    // Station overrides are whitelisted to display/notifications, so ordering
    // must come from the location value untouched.
    expect(effective.ordering.orderNumberScope).toBe("location_wide");
    expect(effective.display.uiScale).toBe("large");
  });

  it("defaults to per_station when the location has no ordering set", () => {
    const effective = getEffectivePosConfig({}, {});
    expect(effective.ordering.orderNumberScope).toBe("per_station");
  });
});
