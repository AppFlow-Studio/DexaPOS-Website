import { describe, it, expect } from "vitest";
import {
  canonicalizePlatform,
  getPlatformLabel,
  sortPlatformSlugs,
  getChannelLabel,
  getChannelLogo,
  getPlatformLogo,
  FIRST_PARTY_SLUG,
  OTHER_SLUG,
  hasKioskPlatformIdentity,
  normalizeOrderSource,
  orderSourceLabel,
} from "../platform";

describe("canonicalizePlatform", () => {
  it("collapses delivery_company casing into one bucket", () => {
    // The exact fragmentation the ticket calls out: grubhub / GrubHub / GRUBHUB.
    expect(canonicalizePlatform({ deliveryCompany: "grubhub" })).toBe("grubhub");
    expect(canonicalizePlatform({ deliveryCompany: "GrubHub" })).toBe("grubhub");
    expect(canonicalizePlatform({ deliveryCompany: "  GRUBHUB " })).toBe("grubhub");
  });

  it("decomposes OrderOut aggregator into the real platform via delivery_company", () => {
    expect(
      canonicalizePlatform({ provider: "orderout", deliveryCompany: "UBEREATS" })
    ).toBe("ubereats");
    expect(
      canonicalizePlatform({ provider: "orderout", deliveryCompany: "DoorDash" })
    ).toBe("doordash");
  });

  it("normalizes Uber Eats spelling variants", () => {
    expect(canonicalizePlatform({ deliveryCompany: "uber eats" })).toBe("ubereats");
    expect(canonicalizePlatform({ deliveryCompany: "uber_eats" })).toBe("ubereats");
  });

  it("buckets first-party providers (website/app) as first_party", () => {
    expect(canonicalizePlatform({ provider: "website" })).toBe(FIRST_PARTY_SLUG);
    expect(canonicalizePlatform({ provider: "app" })).toBe(FIRST_PARTY_SLUG);
  });

  it("lets a real third-party signal win over a first-party provider (precedence)", () => {
    // A backfilled delivery_platform / delivery_company must NOT be silently
    // misbucketed as First-party just because provider says website/app.
    expect(
      canonicalizePlatform({ provider: "website", deliveryPlatform: "doordash" })
    ).toBe("doordash");
    expect(
      canonicalizePlatform({ provider: "website", deliveryCompany: "grubhub" })
    ).toBe("grubhub");
  });

  it("prefers orders.delivery_platform when populated (origin-ticket backfill)", () => {
    expect(
      canonicalizePlatform({
        deliveryPlatform: "doordash",
        deliveryCompany: "grubhub",
        provider: "orderout",
      })
    ).toBe("doordash");
  });

  it("buckets an online storefront order with no third-party signal as first_party", () => {
    // Direct storefront order: no online_orders link, null delivery_platform —
    // order_source is the fallback signal. Both 'online' and 'online_store' are
    // in use across ingestion versions.
    expect(canonicalizePlatform({ orderSource: "online" })).toBe(FIRST_PARTY_SLUG);
    expect(canonicalizePlatform({ orderSource: "online_store" })).toBe(FIRST_PARTY_SLUG);
    expect(
      canonicalizePlatform({ orderSource: "online_store", provider: null, deliveryPlatform: null })
    ).toBe(FIRST_PARTY_SLUG);
    // But a third-party signal still wins over the order_source fallback.
    expect(
      canonicalizePlatform({ orderSource: "online_store", deliveryCompany: "UBEREATS" })
    ).toBe("ubereats");
  });

  it("falls back to Other for unresolved rows without an online source", () => {
    expect(canonicalizePlatform({ provider: "orderout" })).toBe(OTHER_SLUG);
    expect(canonicalizePlatform({ deliveryCompany: "Foodpanda" })).toBe(OTHER_SLUG);
    expect(canonicalizePlatform({})).toBe(OTHER_SLUG);
    expect(canonicalizePlatform({ provider: null, deliveryCompany: "" })).toBe(
      OTHER_SLUG
    );
    // A non-online order with no signal stays Other (not first_party).
    expect(canonicalizePlatform({ orderSource: "pos" })).toBe(OTHER_SLUG);
  });
});

describe("presentation helpers", () => {
  it("labels canonical slugs and defaults unknown to Other", () => {
    expect(getPlatformLabel("grubhub")).toBe("Grubhub");
    expect(getPlatformLabel("first_party")).toBe("First-party");
    expect(getPlatformLabel("nonsense")).toBe("Other");
  });

  it("orders present slugs by display order, Other last", () => {
    expect(
      sortPlatformSlugs(["other", "grubhub", "first_party", "doordash"])
    ).toEqual(["doordash", "grubhub", "first_party", "other"]);
  });

  it("maps slugs to brand logos, none for first_party/other", () => {
    expect(getPlatformLogo("grubhub")).toBe("/grubhub.png");
    expect(getPlatformLogo("first_party")).toBeNull();
    expect(getPlatformLogo("other")).toBeNull();
  });
});

describe("OrderOut channel-code bridge (one source of truth)", () => {
  it("labels uppercase channel codes via the canonical vocabulary", () => {
    expect(getChannelLabel("GRUBHUB")).toBe("Grubhub");
    expect(getChannelLabel("UBEREATS")).toBe("Uber Eats");
    expect(getChannelLabel("DOORDASH")).toBe("DoorDash");
  });

  it("resolves channel-code logos through the shared map", () => {
    expect(getChannelLogo("UBEREATS")).toBe("/uber-eats.png");
    expect(getChannelLogo("GRUBHUB")).toBe("/grubhub.png");
  });

  it("keeps the raw code for unknown channels instead of collapsing to Other", () => {
    expect(getChannelLabel("POSTMATES")).toBe("POSTMATES");
    expect(getChannelLogo("POSTMATES")).toBeNull();
  });
});

describe("order source reporting taxonomy", () => {
  it("normalizes canonical and legacy sources", () => {
    expect(normalizeOrderSource("pos")).toBe("pos");
    expect(normalizeOrderSource("kiosk")).toBe("kiosk");
    expect(normalizeOrderSource("online")).toBe("online_store");
    expect(normalizeOrderSource("online_store")).toBe("online_store");
    expect(normalizeOrderSource("orderout")).toBe("orderout");
    expect(normalizeOrderSource("phone")).toBe("pos");
  });

  it("uses the merchant-facing channel labels", () => {
    expect(orderSourceLabel("pos")).toBe("In-Store");
    expect(orderSourceLabel("kiosk")).toBe("Kiosk");
    expect(orderSourceLabel("online_store")).toBe("Online");
    expect(orderSourceLabel("orderout")).toBe("Delivery Apps");
  });

  it("detects kiosk identity in source and provider fields", () => {
    expect(hasKioskPlatformIdentity({ orderSource: "kiosk" })).toBe(true);
    expect(hasKioskPlatformIdentity({ provider: "KIOSK" })).toBe(true);
    expect(hasKioskPlatformIdentity({ deliveryCompany: "grubhub" })).toBe(false);
    expect(
      hasKioskPlatformIdentity({
        deliveryPlatform: "Grubhub",
        provider: "KIOSK",
      })
    ).toBe(false);
  });
});
