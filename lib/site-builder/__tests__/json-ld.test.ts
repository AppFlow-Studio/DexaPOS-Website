import { describe, expect, it } from "vitest";

import type { ResolvedLocation } from "../bindings/resolved";
import { buildOpeningHoursSpec, buildRestaurantJsonLd, soleLocation } from "../json-ld";
import { SITE_DOMAIN, siteOrigin, sitePublicUrl } from "../public-url";

const location: ResolvedLocation = {
  id: "loc_1",
  name: "Joes Downtown",
  addressLine1: "12 Hamra Main Street",
  city: "Beirut",
  state: "BA",
  postalCode: "10001",
  phone: "(555) 010-3400",
  email: null,
  latitude: 33.895,
  longitude: 35.478,
  timezone: "Asia/Beirut",
  businessHours: {
    monday: { enabled: true, from: "10:00", to: "18:00", is24Hours: false },
    tuesday: { enabled: true, from: "09:00", to: "21:00", is24Hours: true },
    wednesday: { enabled: false, from: "09:00", to: "21:00", is24Hours: false },
  },
};

const ok = (data: ResolvedLocation) => ({ status: "ok", data });

describe("buildRestaurantJsonLd", () => {
  it("emits a complete Restaurant node for a location page", () => {
    const jsonLd = buildRestaurantJsonLd({
      name: "Joes Coffee Shop",
      url: "https://joes-coffee-shop.dexaposai.com",
      description: "Coffee and pastries",
      image: "https://cdn.example.com/logo.png",
      location,
    });

    expect(jsonLd["@type"]).toBe("Restaurant");
    expect(jsonLd.name).toBe("Joes Coffee Shop");
    expect(jsonLd.url).toBe("https://joes-coffee-shop.dexaposai.com");
    expect(jsonLd.telephone).toBe("(555) 010-3400");
    expect(jsonLd.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "12 Hamra Main Street",
      addressLocality: "Beirut",
      addressRegion: "BA",
      postalCode: "10001",
    });
    expect(jsonLd.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 33.895,
      longitude: 35.478,
    });
  });

  it("omits what it does not know rather than asserting it is empty", () => {
    const jsonLd = buildRestaurantJsonLd({
      name: "Brand Only",
      url: "https://brand.dexaposai.com",
      description: "   ",
      image: null,
      location: null,
    });

    // A claim of `"telephone": ""` is worse than no claim at all.
    expect(Object.keys(jsonLd).sort()).toEqual(["@context", "@type", "name", "url"]);
  });

  it("still identifies the business on a brand page with no single address", () => {
    const jsonLd = buildRestaurantJsonLd({
      name: "Joes Coffee Shop",
      url: "https://joes-coffee-shop.dexaposai.com",
      location: null,
    });

    expect(jsonLd.name).toBe("Joes Coffee Shop");
    expect(jsonLd.address).toBeUndefined();
    expect(jsonLd.openingHoursSpecification).toBeUndefined();
  });

  it("drops an address when the street line is missing, keeping the city alone out of it", () => {
    const jsonLd = buildRestaurantJsonLd({
      name: "No Street",
      url: "https://x.dexaposai.com",
      location: { ...location, addressLine1: null },
    });

    expect(jsonLd.address).toBeUndefined();
    // The phone is still known, so it is still claimed.
    expect(jsonLd.telephone).toBe("(555) 010-3400");
  });

  it("produces valid JSON for the script tag", () => {
    const jsonLd = buildRestaurantJsonLd({
      name: "Joes",
      url: "https://joes.dexaposai.com",
      location,
    });
    expect(() => JSON.parse(JSON.stringify(jsonLd))).not.toThrow();
  });
});

describe("buildOpeningHoursSpec", () => {
  it("maps enabled days only, expanding 24-hour days to a full span", () => {
    expect(buildOpeningHoursSpec(location.businessHours)).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Monday",
        opens: "10:00",
        closes: "18:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Tuesday",
        opens: "00:00",
        closes: "23:59",
      },
    ]);
  });

  it("returns undefined rather than an empty array when nothing is open", () => {
    expect(buildOpeningHoursSpec({ monday: { enabled: false } })).toBeUndefined();
    expect(buildOpeningHoursSpec({})).toBeUndefined();
  });

  it("survives a malformed column instead of throwing on a live page", () => {
    expect(buildOpeningHoursSpec(null)).toBeUndefined();
    expect(buildOpeningHoursSpec("nope")).toBeUndefined();
    expect(buildOpeningHoursSpec([])).toBeUndefined();
  });
});

describe("soleLocation", () => {
  it("uses the one location a page resolved, whatever the page is nominally about", () => {
    const map = new Map([["b1", ok(location)]]);
    expect(soleLocation(map)?.id).toBe("loc_1");
  });

  it("refuses to pick when a page covers several restaurants", () => {
    const map = new Map([
      ["b1", ok(location)],
      ["b2", ok({ ...location, id: "loc_2" })],
    ]);
    expect(soleLocation(map)).toBeNull();
  });

  it("ignores locations that failed to resolve", () => {
    const map = new Map([
      ["b1", ok(location)],
      ["b2", { status: "unavailable" }],
    ]);
    expect(soleLocation(map)?.id).toBe("loc_1");
  });

  it("returns null for a page with no location bindings at all", () => {
    expect(soleLocation(new Map())).toBeNull();
  });
});

describe("sitePublicUrl", () => {
  it("builds the brand subdomain origin, not a /sites/ path", () => {
    expect(siteOrigin("joes-coffee-shop")).toBe(`https://joes-coffee-shop.${SITE_DOMAIN}`);
    expect(sitePublicUrl("joes-coffee-shop", "")).toBe("https://joes-coffee-shop.dexaposai.com");
    expect(sitePublicUrl("joes-coffee-shop", "menu")).toBe(
      "https://joes-coffee-shop.dexaposai.com/menu",
    );
  });

  it("accepts a path with or without a leading slash", () => {
    expect(sitePublicUrl("x", "/about")).toBe(sitePublicUrl("x", "about"));
  });
});
