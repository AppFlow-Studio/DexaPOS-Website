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
  AVAILABLE_SITE_FEATURES,
  FEATURES_WITH_OWN_SCREEN,
  SETTINGS_CARD_FEATURES,
  MAX_BRAND_NAME,
  MAX_SEO_DESCRIPTION,
  MAX_SEO_SUFFIX,
  resolveBrand,
  resolveReservationApproval,
  resolveReservationMode,
  resolveSiteSeo,
  siteDisplayName,
  SITE_FEATURES,
  UNAVAILABLE_FEATURES,
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
   * Claiming reservations for a restaurant that has switched them off sends
   * someone from a search result to a dead end — worse than saying nothing.
   *
   * The boolean-plus-link pair this replaced could hold that contradiction: a
   * merchant who pasted a booking URL and later turned reservations off left
   * both fields set. One nullable URL cannot.
   */
  it("claims reservations only when there is somewhere to book", () => {
    expect("acceptsReservations" in buildRestaurantJsonLd({ ...base })).toBe(false);
    expect(
      "acceptsReservations" in buildRestaurantJsonLd({ ...base, reservationUrl: null }),
    ).toBe(false);

    const claimed = buildRestaurantJsonLd({
      ...base,
      reservationUrl: "https://joes.dexaposai.com/reservations",
    });
    expect(claimed.acceptsReservations).toBe(true);
    expect(claimed.potentialAction).toMatchObject({
      "@type": "ReserveAction",
      target: { urlTemplate: "https://joes.dexaposai.com/reservations" },
    });
  });

  /**
   * A leftover provider URL in the brand block must not resurrect the claim.
   * Nothing reads that field any more, and the markup is where a stale one
   * would do the most damage.
   */
  it("ignores a leftover provider url in the brand block", () => {
    const brand = brandWith({ reservationUrl: "https://resy.com/joes" });
    expect("acceptsReservations" in buildRestaurantJsonLd({ ...base, brand })).toBe(false);
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

/**
 * The site-wide SEO block had a reader in the public renderer and no writer
 * anywhere in the product, so `merchant_sites.site_seo` was always `{}` and
 * every page shipped `<title>Home</title>`.
 */
describe("resolveSiteSeo", () => {
  it("keeps a well-formed block", () => {
    expect(resolveSiteSeo({ titleSuffix: "Joes Coffee Shop", description: "Good coffee." })).toEqual(
      { titleSuffix: "Joes Coffee Shop", description: "Good coffee." },
    );
  });

  it("treats blank and non-string values as unset rather than storing them", () => {
    expect(resolveSiteSeo({ titleSuffix: "   ", description: 42 })).toEqual({});
    expect(resolveSiteSeo(null)).toEqual({});
    expect(resolveSiteSeo("not an object")).toEqual({});
    expect(resolveSiteSeo([])).toEqual({});
  });

  it("clamps rather than rejects, so an over-long value is not lost entirely", () => {
    const long = "x".repeat(400);
    const resolved = resolveSiteSeo({ titleSuffix: long, description: long });

    expect(resolved.titleSuffix).toHaveLength(MAX_SEO_SUFFIX);
    expect(resolved.description).toHaveLength(MAX_SEO_DESCRIPTION);
  });

  it("keeps one bad field from taking the other with it", () => {
    expect(resolveSiteSeo({ titleSuffix: "", description: "Still here." })).toEqual({
      description: "Still here.",
    });
  });
});

/**
 * A toggle that promises a storefront capability and silently does nothing is
 * worse than an absent one. `rewards` and `giftCards` had zero consumers.
 */
describe("feature availability", () => {
  it("offers only the toggles something is wired to", () => {
    expect(AVAILABLE_SITE_FEATURES).toEqual(["reviews", "reservations"]);
  });

  it("keeps the unavailable keys parsing, because live rows carry them", () => {
    // Deleting them from the schema would fail validation on stored settings.
    expect(resolveFeatures({ rewards: true, giftCards: true })).toEqual({
      ...DEFAULT_FEATURES,
      rewards: true,
      giftCards: true,
    });
    expect(SITE_FEATURES).toContain("rewards");
    expect(SITE_FEATURES).toContain("giftCards");
  });

  it("gives a reason for each one it withholds", () => {
    for (const feature of SITE_FEATURES) {
      if (AVAILABLE_SITE_FEATURES.includes(feature)) continue;
      expect(UNAVAILABLE_FEATURES[feature]).toBeTruthy();
    }
  });

  /**
   * Reservations is still a real, settable feature — it is just set at the top
   * of its own screen, above the branch switches and service times that decide
   * whether it can take a booking. Two on/off controls on two screens, with
   * nothing saying which was in charge, is what this split removes.
   */
  it("keeps reservations available but off the Features card", () => {
    expect(AVAILABLE_SITE_FEATURES).toContain("reservations");
    expect(SETTINGS_CARD_FEATURES).not.toContain("reservations");
    expect(SETTINGS_CARD_FEATURES).toEqual(["reviews"]);
  });

  it("sends anyone looking for a relocated toggle to the screen that owns it", () => {
    for (const feature of AVAILABLE_SITE_FEATURES) {
      if (SETTINGS_CARD_FEATURES.includes(feature)) continue;
      expect(FEATURES_WITH_OWN_SCREEN[feature]).toBeTruthy();
    }
  });
});

describe("resolveReservationApproval", () => {
  const brandWith = (brand: Partial<SiteBrand>) => ({ brand: { ...DEFAULT_BRAND, ...brand } });

  it("is auto when the key is absent — every row written before manual review existed", () => {
    expect(resolveReservationApproval(brandWith({}))).toBe("auto");
  });

  it("is manual only for the exact string", () => {
    expect(resolveReservationApproval(brandWith({ reservationApproval: "manual" }))).toBe("manual");
    expect(resolveReservationApproval(brandWith({ reservationApproval: "auto" }))).toBe("auto");
  });

  /**
   * The SQL side applies the identical rule — `CASE WHEN brand->>'reservationApproval'
   * = 'manual'` — so anything that is not that exact token must fall to `auto`
   * in both places. A disagreement means a guest reading "request sent" against
   * a row that is already confirmed, or the reverse.
   */
  it("falls back to auto for casing variants, empty, null and non-strings", () => {
    for (const value of ["MANUAL", "Manual", " manual", "", null, undefined, 1, {}, []]) {
      expect(
        resolveReservationApproval({
          brand: { ...DEFAULT_BRAND, reservationApproval: value as never },
        }),
      ).toBe("auto");
    }
  });

  it("ignores whether bookings are switched on at all", () => {
    // The setting is stored independently of the master switch, so a merchant
    // who toggles bookings off and on again does not lose their answer.
    expect(resolveReservationApproval(brandWith({ reservationApproval: "manual" }))).toBe("manual");
  });
});

/**
 * The §2 gotcha, as a test rather than a comment.
 *
 * `resolveBrand` is an allowlist that rebuilds the brand object key by key. A
 * key added to the schema but not to that function stores correctly, reads back
 * once, and is then wiped by the next unrelated brand write — a merchant
 * editing their Instagram handle would silently switch their restaurant back to
 * auto-accept.
 */
describe("resolveBrand — reservationApproval survives a round trip", () => {
  it("keeps a stored manual through resolveBrand", () => {
    expect(resolveBrand({ reservationApproval: "manual" }).reservationApproval).toBe("manual");
  });

  it("keeps it alongside an unrelated brand edit", () => {
    const resolved = resolveBrand({
      reservationApproval: "manual",
      social: [{ platform: "instagram", url: "https://instagram.com/joes" }],
      name: "Joe's",
    });
    expect(resolved.reservationApproval).toBe("manual");
    expect(resolved.name).toBe("Joe's");
  });

  it("drops an unrecognised value rather than storing it", () => {
    expect(resolveBrand({ reservationApproval: "MANUAL" }).reservationApproval).toBeUndefined();
    expect(resolveBrand({ reservationApproval: 7 }).reservationApproval).toBeUndefined();
  });

  it("leaves the key absent when it was never set", () => {
    expect(resolveBrand({ name: "Joe's" }).reservationApproval).toBeUndefined();
  });
});

describe("resolveReservationMode", () => {
  const settings = (features: Partial<SiteFeatures>, brand: Partial<SiteBrand>) => ({
    features: { ...DEFAULT_FEATURES, ...features },
    brand: { ...DEFAULT_BRAND, ...brand },
  });

  it("is off when the feature is off, whatever the brand block says", () => {
    expect(
      resolveReservationMode(
        settings({ reservations: false }, { reservationMode: "native" }),
      ),
    ).toBe("off");
  });

  /**
   * Rows written before native booking existed, and rows a merchant set to link
   * out to a provider, both look like this: `reservations: true`, a URL, no
   * mode. Link mode is gone, so they resolve to OFF.
   *
   * That is a deliberate behaviour change, not an oversight. Such a site has no
   * booking page provisioned, so the alternatives are a header button pointing
   * at a 404 or a restaurant silently switched onto a booking system it never
   * configured. No button is the honest outcome.
   */
  it("reads a stored row with no mode as off, whatever url it carries", () => {
    expect(
      resolveReservationMode(
        settings({ reservations: true }, { reservationUrl: "https://resy.com/x" }),
      ),
    ).toBe("off");
  });

  it("is off when the feature is on but nothing says bookings happen here", () => {
    expect(resolveReservationMode(settings({ reservations: true }, {}))).toBe("off");
  });

  it("needs no url, because the destination is the merchant's own page", () => {
    expect(
      resolveReservationMode(
        settings({ reservations: true }, { reservationMode: "native" }),
      ),
    ).toBe("native");
  });

  /**
   * The whole point of collapsing the modes: this function and the two
   * SECURITY DEFINER functions now ask the same question. While `link` existed
   * this could answer "on" where the database answered no, and a page offering
   * times the server refuses to hold is the worst version of that disagreement.
   */
  it("answers exactly what the SQL gate answers", () => {
    const sqlWouldAllow = (features: Partial<SiteFeatures>, brand: Partial<SiteBrand>) => {
      const merged = settings(features, brand);
      // `features->>'reservations' = 'true' AND brand->>'reservationMode' = 'native'`
      return merged.features.reservations === true && merged.brand.reservationMode === "native";
    };

    const cases: [Partial<SiteFeatures>, Partial<SiteBrand>][] = [
      [{ reservations: false }, {}],
      [{ reservations: false }, { reservationMode: "native" }],
      [{ reservations: true }, {}],
      [{ reservations: true }, { reservationUrl: "https://resy.com/x" }],
      [{ reservations: true }, { reservationMode: "native" }],
    ];

    for (const [features, brand] of cases) {
      const allowed = resolveReservationMode(settings(features, brand)) === "native";
      expect(allowed, JSON.stringify({ features, brand })).toBe(sqlWouldAllow(features, brand));
    }
  });

  /**
   * The value survives so restoring link mode is a matter of reading it again —
   * zod strips unknown keys, so dropping the field would erase every stored URL
   * the next time anything else on the brand was saved.
   */
  it("keeps a provider url it no longer reads", () => {
    const brand = resolveBrand({
      reservationMode: "native",
      reservationUrl: "https://opentable.com/x",
      social: [],
      cuisines: [],
    });

    expect(brand.reservationUrl).toBe("https://opentable.com/x");
    expect(resolveReservationMode({ features: { ...DEFAULT_FEATURES, reservations: true }, brand })).toBe(
      "native",
    );
  });

  it("discards an unrecognised stored mode rather than trusting it", () => {
    const brand = resolveBrand({ reservationMode: "carrier-pigeon", social: [], cuisines: [] });
    expect(brand.reservationMode).toBeUndefined();
  });

  /** `link` is now exactly as unrecognised as `carrier-pigeon`. */
  it("no longer accepts link as a stored mode", () => {
    const brand = resolveBrand({ reservationMode: "link", social: [], cuisines: [] });
    expect(brand.reservationMode).toBeUndefined();
    expect(resolveReservationMode({ features: { ...DEFAULT_FEATURES, reservations: true }, brand })).toBe(
      "off",
    );
  });
});
