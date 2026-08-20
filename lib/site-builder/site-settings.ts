/**
 * Site-wide settings that are **not** page content.
 *
 * The two-layer model the Owner teardown makes explicit and our first build
 * missed: *brand settings say **whether**; the page editor says **where** and
 * **what it says***. A merchant turns Reservations on once, for the business —
 * and only then does a Reservations section become something they can put on a
 * page. Their Instagram address is a fact about the restaurant, typed once, and
 * every page's footer reads it; it is not a link they re-type per page.
 *
 * Lives in two jsonb columns on `merchant_sites`:
 *
 *  - `features` — four booleans, the *availability* axis.
 *  - `brand` — the facts about the business a page may display: social
 *    accounts, where to book a table, cuisines, price range, and how a visitor
 *    who has not chosen a branch should be treated.
 *
 * jsonb rather than columns because these are read together, written together,
 * and will keep growing: every addition here would otherwise be a migration and
 * a `MerchantSiteRow` change for one boolean.
 *
 * **Nothing here is trusted on read.** These columns are free-form jsonb
 * written by whatever build was deployed at the time, so every reader goes
 * through `resolveFeatures` / `resolveBrand`, which fill in what is missing and
 * discard what does not parse. The same reasoning as `resolveTheme`, and the
 * same guarantee: a renderer sees one shape, always.
 *
 * Pure and I/O-free, so the settings screen, the public renderer, the JSON-LD
 * builder and the tests all agree by construction.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Features
// ─────────────────────────────────────────────────────────────────────────────

export const SITE_FEATURES = ["reviews", "rewards", "giftCards", "reservations"] as const;

export type SiteFeature = (typeof SITE_FEATURES)[number];

export type SiteFeatures = Record<SiteFeature, boolean>;

export const siteFeaturesSchema = z.object({
  reviews: z.boolean(),
  rewards: z.boolean(),
  giftCards: z.boolean(),
  reservations: z.boolean(),
});

/**
 * Everything off.
 *
 * A merchant who has never opened the settings screen gets a website with no
 * reviews section on offer and no "Book a table" button — which is right. The
 * alternative, defaulting these on, would put a Reservations section in the Add
 * Section catalogue for a restaurant that does not take reservations, and the
 * merchant would find out by adding one.
 */
export const DEFAULT_FEATURES: SiteFeatures = {
  reviews: false,
  rewards: false,
  giftCards: false,
  reservations: false,
};

/** What each toggle is called on the settings screen and in the copy that cites it. */
export const FEATURE_LABELS: Record<SiteFeature, string> = {
  reviews: "Customer reviews",
  rewards: "Rewards",
  giftCards: "Gift cards",
  reservations: "Reservations",
};

export const FEATURE_DESCRIPTIONS: Record<SiteFeature, string> = {
  reviews: "Show what guests have said about you, in their own words.",
  rewards: "Tell guests about your loyalty programme.",
  giftCards: "Let guests buy a gift card from your website.",
  reservations: "Let guests book a table, and add a Book a table button to your header.",
};

/** Completes a partially-stored — or entirely absent — feature set. */
export function resolveFeatures(stored: unknown): SiteFeatures {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return DEFAULT_FEATURES;

  const source = stored as Record<string, unknown>;
  const out = { ...DEFAULT_FEATURES };
  for (const feature of SITE_FEATURES) {
    if (typeof source[feature] === "boolean") out[feature] = source[feature] as boolean;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The accounts a restaurant actually links to.
 *
 * An allowlist rather than a free "add a link" repeater, because the footer
 * draws an icon per platform and an unknown platform has no icon — and a
 * settings screen that accepts anything produces a footer with a generic chain
 * link on it, which looks like a bug rather than a choice.
 */
export const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "youtube",
  "yelp",
  "tripadvisor",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X",
  youtube: "YouTube",
  yelp: "Yelp",
  tripadvisor: "Tripadvisor",
};

/**
 * `https://` or `http://` and nothing else.
 *
 * These strings become `href`s on a public page and `sameAs` entries in
 * structured data. `z.url()` would accept `javascript:alert(1)` and
 * `data:text/html,…` — both perfectly well-formed URLs, and both an XSS hole
 * the moment a merchant's account is compromised or a support agent pastes the
 * wrong thing. The scheme check is the whole point of validating here.
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => /^https?:\/\/[^\s]+$/i.test(value), {
    message: "Enter a full web address starting with https://",
  });

export const PRICE_RANGES = ["$", "$$", "$$$", "$$$$"] as const;

export type PriceRange = (typeof PRICE_RANGES)[number];

/** What each band means, so a merchant is not guessing at their own dollar signs. */
export const PRICE_RANGE_HINTS: Record<PriceRange, string> = {
  $: "Under $15 a head",
  $$: "$15–30 a head",
  $$$: "$30–60 a head",
  $$$$: "Over $60 a head",
};

export const MAX_CUISINES = 5;
export const MAX_SOCIAL_LINKS = SOCIAL_PLATFORMS.length;

export const socialLinkSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  url: httpUrlSchema,
});

export type SocialLink = z.infer<typeof socialLinkSchema>;

export const siteBrandSchema = z.object({
  social: z.array(socialLinkSchema).max(MAX_SOCIAL_LINKS),
  /**
   * Where "Book a table" goes.
   *
   * A URL rather than a booking system, deliberately: nearly every restaurant
   * that takes reservations already has one — OpenTable, Resy, a Google form —
   * and asking them to move it here to get a button on their own website would
   * be the reason they do not get a button on their own website. Owner's
   * Reservations section binds to a provider link the same way.
   */
  reservationUrl: httpUrlSchema.optional(),
  /** Free text, but short and few: these are search terms, not a description. */
  cuisines: z.array(z.string().trim().min(1).max(40)).max(MAX_CUISINES),
  priceRange: z.enum(PRICE_RANGES).optional(),
  /**
   * The branch a visitor is treated as being at before they choose one.
   *
   * This is our multi-location pricing problem, and Owner's answer to it: a
   * merchant toggle rather than a guess. `canShowPrices` refuses to show money
   * on a page with no location, because five branches can charge five different
   * amounts — correct, and for a single-location merchant it means their own
   * home page will not show their own prices. Naming a default fixes that
   * without weakening the rule for anyone else.
   *
   * Validated against the merchant's real locations at render time, not here: a
   * uuid that has since been archived must degrade to "no default", not to a
   * page that shows one closed branch's prices.
   */
  defaultLocationId: z.string().uuid().optional(),
  /**
   * Make the visitor choose, whatever the default says.
   *
   * For merchants whose branches differ enough that guessing is worse than
   * asking. Overrides `defaultLocationId` rather than replacing it, so turning
   * it back off restores the previous behaviour instead of clearing the field.
   */
  forceLocationChoice: z.boolean(),
});

export type SiteBrand = z.infer<typeof siteBrandSchema>;

export const DEFAULT_BRAND: SiteBrand = {
  social: [],
  cuisines: [],
  forceLocationChoice: false,
};

/**
 * Completes a partially-stored brand block, discarding anything unparseable.
 *
 * Field-by-field rather than one `safeParse` of the whole object: a single
 * malformed social URL must not take the merchant's cuisines and price range
 * down with it. The same repair-don't-reject principle `normalizePage` applies
 * to sections, for the same reason — this is merchant data, and losing the
 * valid parts of it because one part is wrong is never the better outcome.
 */
export function resolveBrand(stored: unknown): SiteBrand {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return DEFAULT_BRAND;

  const source = stored as Record<string, unknown>;

  const social = Array.isArray(source.social)
    ? source.social.flatMap((raw) => {
        const parsed = socialLinkSchema.safeParse(raw);
        return parsed.success ? [parsed.data] : [];
      })
    : [];

  // One account per platform. Two Instagram rows is a merchant's mistake rather
  // than an intention, and the footer would draw the same icon twice.
  const seen = new Set<SocialPlatform>();
  const uniqueSocial = social.filter((link) => {
    if (seen.has(link.platform)) return false;
    seen.add(link.platform);
    return true;
  });

  const cuisines = Array.isArray(source.cuisines)
    ? source.cuisines
        .flatMap((raw) => (typeof raw === "string" && raw.trim() ? [raw.trim().slice(0, 40)] : []))
        .slice(0, MAX_CUISINES)
    : [];

  const reservationUrl = httpUrlSchema.safeParse(source.reservationUrl);
  const priceRange = PRICE_RANGES.find((range) => range === source.priceRange);
  const defaultLocationId = z.string().uuid().safeParse(source.defaultLocationId);

  return {
    social: uniqueSocial,
    cuisines,
    ...(reservationUrl.success ? { reservationUrl: reservationUrl.data } : {}),
    ...(priceRange ? { priceRange } : {}),
    ...(defaultLocationId.success ? { defaultLocationId: defaultLocationId.data } : {}),
    forceLocationChoice: source.forceLocationChoice === true,
  };
}

/**
 * Both blocks off a `merchant_sites` row, resolved.
 *
 * The one call every server component makes, so no screen can read `features`
 * raw and forget that a row written last month may be missing a key.
 */
export function readSiteSettings(site: {
  features?: unknown;
  brand?: unknown;
}): { features: SiteFeatures; brand: SiteBrand } {
  return { features: resolveFeatures(site.features), brand: resolveBrand(site.brand) };
}

/**
 * Which location a public render should be scoped to, and whether money may
 * appear.
 *
 * The one place the default-location rule is decided, so the public renderer,
 * the preview and any future listing surface cannot answer it differently.
 *
 *  - A page that is *about* a location always wins. `site_pages.location_id` is
 *    an explicit statement by the merchant and no site-wide default may
 *    override it.
 *  - Otherwise the brand default applies, but only if it names a location that
 *    still exists and is still serving — an archived branch resolves to no
 *    default rather than to itself.
 *  - `forceLocationChoice` refuses a default outright.
 *
 * Returns the location to *price* against. `null` means prices stay hidden,
 * which is what `canShowPrices` reads.
 */
export function resolvePricingLocation(input: {
  /** `site_pages.location_id` — the page's own scope, usually null. */
  pageLocationId: string | null;
  brand: SiteBrand;
  /** Locations the merchant actually has a live storefront for. */
  availableLocationIds: readonly string[];
}): string | null {
  const { pageLocationId, brand, availableLocationIds } = input;

  if (pageLocationId) return pageLocationId;
  if (brand.forceLocationChoice) return null;
  if (!brand.defaultLocationId) return null;

  return availableLocationIds.includes(brand.defaultLocationId) ? brand.defaultLocationId : null;
}
