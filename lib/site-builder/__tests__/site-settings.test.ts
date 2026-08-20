import { describe, expect, it } from "vitest";

import { buildRestaurantJsonLd } from "../json-ld";
import { addSection } from "../mutations";
import { createStarterPage } from "../page-document";
import {
  addableKinds,
  availableKinds,
  isKindAvailable,
  kindsAwaitingFeature,
  SECTION_REGISTRY,
} from "../sections/registry";
import {
  DEFAULT_BRAND,
  DEFAULT_FEATURES,
  MAX_BRAND_NAME,
  resolveBrand,
  siteDisplayName,
  resolveFeatures,
  resolvePricingLocation,
  siteBrandSchema,
  type SiteBrand,
  type SiteFeatures,
} from "../site-settings";

const ALL_ON: SiteFeatures = {
  reviews: true,
  rewards: true,
  giftCards: true,
  reservations: true,
};

/**
 * `features` and `brand` are free-form jsonb written by whatever build was
 * deployed at the time, so every one of these tests is really the same
 * question: does a row that predates this code, or was written by a newer one,
 * still render?
 */
describe("resolveFeatures", () => {
  it("treats a merchant who has never opened settings as having nothing on", () => {
    expect(resolveFeatures(null)).toEqual(DEFAULT_FEATURES);
    expect(resolveFeatures(undefined)).toEqual(DEFAULT_FEATURES);
    expect(resolveFeatures({})).toEqual(DEFAULT_FEATURES);
  });

  it("survives a column holding something that is not an object at all", () => {
    expect(resolveFeatures("reviews")).toEqual(DEFAULT_FEATURES);
    expect(resolveFeatures([true, true])).toEqual(DEFAULT_FEATURES);
    expect(resolveFeatures(7)).toEqual(DEFAULT_FEATURES);
  });

  it("fills in only the keys that are actually booleans", () => {
    expect(resolveFeatures({ reviews: true, rewards: "yes", giftCards: 1 })).toEqual({
      ...DEFAULT_FEATURES,
      reviews: true,
    });
  });

  it("ignores a key written by a build that knows a feature this one does not", () => {
    const resolved = resolveFeatures({ reviews: true, catering: true });
    expect(resolved).toEqual({ ...DEFAULT_FEATURES, reviews: true });
    expect("catering" in resolved).toBe(false);
  });
});

describe("resolveBrand", () => {
  it("returns an empty brand for anything unusable", () => {
    expect(resolveBrand(null)).toEqual(DEFAULT_BRAND);
    expect(resolveBrand("instagram")).toEqual(DEFAULT_BRAND);
  });

  /**
   * The reason this is field-by-field rather than one `safeParse`: merchant
   * data, and losing the valid parts because one part is wrong is never the
   * better outcome.
   */
  it("keeps the good fields when one field is bad", () => {
    const resolved = resolveBrand({
      social: [{ platform: "instagram", url: "not a url" }],
      cuisines: ["Thai", "Vegan"],
      priceRange: "$$",
    });

    expect(resolved.social).toEqual([]);
    expect(resolved.cuisines).toEqual(["Thai", "Vegan"]);
    expect(resolved.priceRange).toBe("$$");
  });

  it("refuses a scheme that is not http or https", () => {
    const resolved = resolveBrand({
      social: [
        { platform: "instagram", url: "javascript:alert(1)" },
        { platform: "facebook", url: "data:text/html,<script>x</script>" },
        { platform: "yelp", url: "https://yelp.com/biz/joes" },
      ],
    });

    // The two dangerous ones are gone; the real one survives.
    expect(resolved.social).toEqual([{ platform: "yelp", url: "https://yelp.com/biz/joes" }]);
  });

  it("keeps one account per platform", () => {
    const resolved = resolveBrand({
      social: [
        { platform: "instagram", url: "https://instagram.com/first" },
        { platform: "instagram", url: "https://instagram.com/second" },
      ],
    });

    expect(resolved.social).toHaveLength(1);
    expect(resolved.social[0].url).toBe("https://instagram.com/first");
  });

  it("drops an unknown platform rather than rendering an unnamed link", () => {
    const resolved = resolveBrand({
      social: [{ platform: "myspace", url: "https://myspace.com/joes" }],
    });
    expect(resolved.social).toEqual([]);
  });

  it("trims cuisines, drops empties and caps the list", () => {
    const resolved = resolveBrand({
      cuisines: ["  Thai  ", "", "Pizza", "Vegan", "Burgers", "Coffee", "Bakery", 7],
    });

    expect(resolved.cuisines[0]).toBe("Thai");
    expect(resolved.cuisines).toHaveLength(5);
    expect(resolved.cuisines).not.toContain("");
  });

  it("drops a default location that is not a uuid", () => {
    expect(resolveBrand({ defaultLocationId: "the-main-one" }).defaultLocationId).toBeUndefined();
  });
});

/**
 * The rule behind "no prices until we know which kitchen is answering".
 *
 * Getting this wrong in either direction is a support ticket: too strict and a
 * single-location merchant's own home page hides their own prices; too loose
 * and a five-branch merchant quotes one branch's prices to everybody.
 */
describe("resolvePricingLocation", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  it("lets a page about one restaurant answer for itself", () => {
    expect(
      resolvePricingLocation({
        pageLocationId: uuid,
        brand: { ...DEFAULT_BRAND, defaultLocationId: other },
        availableLocationIds: [uuid, other],
      }),
    ).toBe(uuid);
  });

  it("withholds prices on a brand page with no default", () => {
    expect(
      resolvePricingLocation({
        pageLocationId: null,
        brand: DEFAULT_BRAND,
        availableLocationIds: [uuid],
      }),
    ).toBeNull();
  });

  it("uses the default on a brand page once one is set", () => {
    expect(
      resolvePricingLocation({
        pageLocationId: null,
        brand: { ...DEFAULT_BRAND, defaultLocationId: uuid },
        availableLocationIds: [uuid],
      }),
    ).toBe(uuid);
  });

  /**
   * A branch that has closed since the default was chosen. Falling back to "no
   * default" is the only safe answer — the alternative is quoting a kitchen
   * that is no longer there.
   */
  it("ignores a default pointing at a location that no longer serves", () => {
    expect(
      resolvePricingLocation({
        pageLocationId: null,
        brand: { ...DEFAULT_BRAND, defaultLocationId: uuid },
        availableLocationIds: [other],
      }),
    ).toBeNull();
  });

  it("lets the merchant insist that guests choose", () => {
    expect(
      resolvePricingLocation({
        pageLocationId: null,
        brand: { ...DEFAULT_BRAND, defaultLocationId: uuid, forceLocationChoice: true },
        availableLocationIds: [uuid],
      }),
    ).toBeNull();
  });

  /** But never at the cost of a page that is explicitly about one branch. */
  it("does not let forcing a choice override a page's own location", () => {
    expect(
      resolvePricingLocation({
        pageLocationId: uuid,
        brand: { ...DEFAULT_BRAND, forceLocationChoice: true },
        availableLocationIds: [uuid],
      }),
    ).toBe(uuid);
  });
});

describe("the availability axis", () => {
  it("holds Reviews back until the merchant turns Customer reviews on", () => {
    expect(SECTION_REGISTRY.reviews.requiresFeature).toBe("reviews");
    expect(isKindAvailable("reviews", DEFAULT_FEATURES)).toBe(false);
    expect(isKindAvailable("reviews", ALL_ON)).toBe(true);
  });

  it("leaves every kind with no toggle alone", () => {
    for (const kind of addableKinds()) {
      if (SECTION_REGISTRY[kind].requiresFeature) continue;
      expect(isKindAvailable(kind, DEFAULT_FEATURES), kind).toBe(true);
    }
  });

  it("omits a gated kind from the catalogue rather than disabling it", () => {
    expect(availableKinds(DEFAULT_FEATURES)).not.toContain("reviews");
    expect(availableKinds(ALL_ON)).toContain("reviews");
  });

  it("names the toggle that would bring it back", () => {
    const awaiting = kindsAwaitingFeature(DEFAULT_FEATURES);
    const reviews = awaiting.find((entry) => entry.feature === "reviews");

    expect(reviews?.featureLabel).toBe("Customer reviews");
    expect(reviews?.kinds).toContain("reviews");
  });

  it("has nothing to explain once everything is on", () => {
    expect(kindsAwaitingFeature(ALL_ON)).toEqual([]);
    expect(availableKinds(ALL_ON)).toEqual(addableKinds());
  });
});

/**
 * The UI enforces this by omission and the mutation layer enforces it as a
 * rule, which is the same division of labour as the capability flags. A stale
 * open tab must not be able to add a section the merchant's settings forbid.
 */
describe("addSection and the feature gate", () => {
  it("refuses a gated kind, and says which switch to flip", () => {
    const doc = createStarterPage({ locationId: "loc_1" });
    const result = addSection(doc, "reviews", { features: DEFAULT_FEATURES });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("feature_off");
      expect(result.message).toContain("Customer reviews");
    }
  });

  it("allows it once the feature is on", () => {
    const doc = createStarterPage({ locationId: "loc_1" });
    expect(addSection(doc, "reviews", { features: ALL_ON }).ok).toBe(true);
  });

  /**
   * Fixtures, templates and the tests that predate brand settings have no
   * merchant behind them. Omitting the argument checks nothing, deliberately —
   * making them invent a feature set would be worse than the narrow rule.
   */
  it("checks nothing when no features are supplied", () => {
    const doc = createStarterPage({ locationId: "loc_1" });
    expect(addSection(doc, "reviews").ok).toBe(true);
  });

  it("still refuses a kind the merchant may never add manually", () => {
    const doc = createStarterPage({ locationId: "loc_1" });
    const result = addSection(doc, "header", { features: ALL_ON });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_addable");
  });
});

/**
 * Structured data is the one place brand settings reach an audience the
 * merchant cannot see, so what it may *claim* matters more than what it emits.
 */
describe("brand facts in the JSON-LD", () => {
  const base = {
    name: "Joe's Coffee",
    url: "https://joes.dexaposai.com/",
    location: null,
  };

  it("emits a single cuisine as a string and several as a list", () => {
    const one = buildRestaurantJsonLd({ ...base, brand: brandWith({ cuisines: ["Thai"] }) });
    expect(one.servesCuisine).toBe("Thai");

    const many = buildRestaurantJsonLd({
      ...base,
      brand: brandWith({ cuisines: ["Thai", "Vegan"] }),
    });
    expect(many.servesCuisine).toEqual(["Thai", "Vegan"]);
  });

  it("says nothing at all when the merchant has set nothing", () => {
    const json = buildRestaurantJsonLd({ ...base, brand: DEFAULT_BRAND });

    expect("servesCuisine" in json).toBe(false);
    expect("priceRange" in json).toBe(false);
    expect("sameAs" in json).toBe(false);
    expect("acceptsReservations" in json).toBe(false);
  });

  it("ties the site to its social accounts through sameAs", () => {
    const json = buildRestaurantJsonLd({
      ...base,
      brand: brandWith({ social: [{ platform: "instagram", url: "https://instagram.com/joes" }] }),
    });
    expect(json.sameAs).toEqual(["https://instagram.com/joes"]);
  });

  /**
   * A booking link left behind after Reservations was switched off would send
   * someone from a search result to a dead end — worse than saying nothing.
   */
  it("claims reservations only when the toggle AND the link are both there", () => {
    const brand = brandWith({ reservationUrl: "https://resy.com/joes" });

    expect(
      "acceptsReservations" in buildRestaurantJsonLd({ ...base, brand, acceptsReservations: false }),
    ).toBe(false);

    expect(
      "acceptsReservations" in
        buildRestaurantJsonLd({ ...base, brand: DEFAULT_BRAND, acceptsReservations: true }),
    ).toBe(false);

    const claimed = buildRestaurantJsonLd({ ...base, brand, acceptsReservations: true });
    expect(claimed.acceptsReservations).toBe(true);
    expect(claimed.potentialAction).toMatchObject({
      "@type": "ReserveAction",
      target: { urlTemplate: "https://resy.com/joes" },
    });
  });
});

describe("siteBrandSchema", () => {
  it("is what the write path uses, so a bad URL is reported rather than dropped", () => {
    const parsed = siteBrandSchema.safeParse({
      ...DEFAULT_BRAND,
      social: [{ platform: "instagram", url: "instagram.com/joes" }],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain("https://");
    }
  });

  it("accepts the empty brand a new site starts with", () => {
    expect(siteBrandSchema.safeParse(DEFAULT_BRAND).success).toBe(true);
  });
});

function brandWith(patch: Partial<SiteBrand>): SiteBrand {
  return { ...DEFAULT_BRAND, ...patch };
}

/**
 * The name a website calls itself.
 *
 * The bug, found on Joes Coffee Shop 2026-08-20 and confirmed by anonymous
 * curl: a merchant-level brand site rendered "Downtown Hamra" — one of five
 * branches — as its header brand, footer name and copyright line, ten times on
 * one page, while the merchant's own name appeared nowhere. The cause was
 * precedence: `buildPublicRenderContext` read `configs[0].store_name`, and a
 * brand page has no location to pick a better row with.
 *
 * These lock the order down. Both the public renderer and the editor call this
 * one function, so a merchant can never see one name on the canvas and another
 * on their live page.
 */
describe("siteDisplayName", () => {
  it("prefers what the merchant set over everything else", () => {
    expect(
      siteDisplayName({
        brandName: "Joe's",
        merchantName: "Joes Coffee Shop",
        storefrontName: "Downtown Hamra",
      }),
    ).toBe("Joe's");
  });

  it("falls back to the merchant name — the fix for Joes, who set nothing", () => {
    expect(
      siteDisplayName({ merchantName: "Joes Coffee Shop", storefrontName: "Downtown Hamra" }),
    ).toBe("Joes Coffee Shop");
  });

  it("uses a branch name only when there is nothing better", () => {
    expect(siteDisplayName({ storefrontName: "Downtown Hamra" })).toBe("Downtown Hamra");
  });

  it("never returns an empty name", () => {
    expect(siteDisplayName({})).toBe("Our restaurant");
    expect(siteDisplayName({ fallback: "Your restaurant" })).toBe("Your restaurant");
  });

  it("treats blank and whitespace-only values as unset, not as a name", () => {
    expect(
      siteDisplayName({ brandName: "   ", merchantName: "", storefrontName: "Downtown Hamra" }),
    ).toBe("Downtown Hamra");
  });

  it("trims, so a stray space cannot shift the header layout", () => {
    expect(siteDisplayName({ brandName: "  Joe's  " })).toBe("Joe's");
  });

  it("tolerates nulls from the database without falling through them", () => {
    expect(siteDisplayName({ brandName: null, merchantName: "Joes Coffee Shop" })).toBe(
      "Joes Coffee Shop",
    );
  });
});

describe("resolveBrand — name", () => {
  it("keeps a stored name", () => {
    expect(resolveBrand({ name: "Joe's" }).name).toBe("Joe's");
  });

  it("omits the key entirely when unset, so the fallback can apply", () => {
    expect(resolveBrand({}).name).toBeUndefined();
    expect(DEFAULT_BRAND.name).toBeUndefined();
  });

  it("treats a blank string as unset rather than storing an empty name", () => {
    expect(resolveBrand({ name: "   " }).name).toBeUndefined();
  });

  it("clamps rather than rejects, so tightening the cap cannot blank a name", () => {
    const long = "a".repeat(MAX_BRAND_NAME + 40);
    expect(resolveBrand({ name: long }).name).toHaveLength(MAX_BRAND_NAME);
  });

  it("ignores a non-string without taking the rest of the block down", () => {
    const brand = resolveBrand({ name: { evil: true }, cuisines: ["Coffee"] });
    expect(brand.name).toBeUndefined();
    expect(brand.cuisines).toEqual(["Coffee"]);
  });
});
