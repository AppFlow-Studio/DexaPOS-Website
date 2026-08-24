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
  rewards: "Tell guests about your loyalty program.",
  giftCards: "Let guests buy a gift card from your website.",
  reservations: "Let guests book a table, and add a Book a table button to your header.",
};

/**
 * Toggles the product cannot yet keep the promise of.
 *
 * `reviews` gates a section kind and `reservations` puts a button in the header
 * — both do exactly what their description says. `rewards` and `giftCards` had
 * **no consumer anywhere**: switching one on promised a loyalty programme or
 * gift-card sales on the merchant's website and did nothing at all, which made
 * the panel's own line — "Sections you can add to a page follow from these" —
 * false for half the list. Both were on for the test merchant.
 *
 * Not deleted from `SITE_FEATURES` or from the schema: the keys are stored on
 * live rows and must keep parsing. They are simply not offered until there is a
 * section behind them, at which point deleting an entry here turns one back on.
 *
 * The same shape as the section registry's `unavailable`, and hidden the same
 * way it hides a kind — absent from the list, with one sentence saying so,
 * rather than shown as a disabled row that teaches a merchant the product is
 * full of things they may not have.
 */
export const UNAVAILABLE_FEATURES: Partial<Record<SiteFeature, string>> = {
  rewards: "there is no Rewards section to put on a page yet",
  giftCards: "there is no Gift cards section to put on a page yet",
};

/** The toggles a merchant may actually set today. */
export const AVAILABLE_SITE_FEATURES: readonly SiteFeature[] = SITE_FEATURES.filter(
  (feature) => !UNAVAILABLE_FEATURES[feature],
);

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

/**
 * The cap on the public business name.
 *
 * It renders in the header beside the logo and again in the footer, both on one
 * line, so this is a layout limit rather than a data one.
 */
export const MAX_BRAND_NAME = 60;

export const socialLinkSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  url: httpUrlSchema,
});

export type SocialLink = z.infer<typeof socialLinkSchema>;

export const siteBrandSchema = z.object({
  /**
   * What the website calls the business.
   *
   * **The site is one per merchant; a storefront is one per branch.** Before
   * this existed the public header and footer took their name from
   * `online_store_config.store_name` of whichever storefront came back first,
   * so Joes Coffee Shop's brand site called itself "Downtown Hamra" — one of
   * its five branches — on every page, ten times over, including the copyright
   * line. Borrowing a branch's logo and phone is a reasonable fallback;
   * borrowing its *name* is the one field where doing so is simply wrong,
   * because the name is the brand rather than a per-branch fact.
   *
   * Optional, and resolved through `merchants.name` when unset, so a merchant
   * who never opens this screen still gets their own name rather than a
   * branch's. Stored here as well because a trading name and a merchant record
   * name are often not the same string.
   */
  name: z.string().trim().min(1).max(MAX_BRAND_NAME).optional(),
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
  // Trimmed and clamped rather than rejected, for the same reason `clampStrings`
  // exists: a name stored before this cap tightened must keep its first 60
  // characters, not fall back to a branch name.
  const name =
    typeof source.name === "string" && source.name.trim()
      ? source.name.trim().slice(0, MAX_BRAND_NAME)
      : undefined;

  return {
    ...(name ? { name } : {}),
    social: uniqueSocial,
    cuisines,
    ...(reservationUrl.success ? { reservationUrl: reservationUrl.data } : {}),
    ...(priceRange ? { priceRange } : {}),
    ...(defaultLocationId.success ? { defaultLocationId: defaultLocationId.data } : {}),
    forceLocationChoice: source.forceLocationChoice === true,
  };
}

/**
 * What the website calls itself, in precedence order.
 *
 * One function because there are two callers — `buildPublicRenderContext` and
 * the editor's `site-context` — and a merchant whose canvas says one name while
 * their live page says another has no way to tell which is the bug. Keeping the
 * order here is what makes the preview honest.
 *
 *  1. **The merchant's own setting.** Explicit, so nothing overrides it.
 *  2. **`merchants.name`.** The reason the fix works for merchants who never
 *     open Website settings, which today is all of them.
 *  3. **A storefront's `store_name`.** Legacy floor only. It names one branch,
 *     so it is wrong on a brand site by construction — kept solely so a
 *     merchant record with an empty name cannot render a site with no name.
 *  4. `"Our restaurant"`, when every one of those is blank.
 */
export function siteDisplayName(input: {
  /** `merchant_sites.brand.name`, already through `resolveBrand`. */
  brandName?: string | null;
  /** `merchants.name`. */
  merchantName?: string | null;
  /** `online_store_config.store_name` of a borrowed branch. */
  storefrontName?: string | null;
  /** What to say when nothing is set. Differs between public and editor copy. */
  fallback?: string;
}): string {
  const first = [input.brandName, input.merchantName, input.storefrontName].find(
    (candidate) => typeof candidate === "string" && candidate.trim(),
  );

  return first ? first.trim() : (input.fallback ?? "Our restaurant");
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

export const MAX_SEO_SUFFIX = 60;
export const MAX_SEO_DESCRIPTION = 160;

/**
 * How the website presents itself in a search result and a shared link.
 *
 * Site-wide rather than per page, because both fields are answers a merchant
 * gives once. The per-page SEO panel already overrides each of them where a
 * page has something more specific to say.
 *
 * Stored in the existing `merchant_sites.site_seo` jsonb column, which the
 * public renderer has read since the feature shipped — with nothing anywhere in
 * the product able to write it. Every merchant site therefore served
 * `<title>Home</title>` and no description at all.
 */
export const siteSeoSchema = z.object({
  /**
   * Appended after every page title: "Menu — Joes Coffee Shop".
   *
   * Optional, and it should usually stay that way — `builtSiteMetadata` falls
   * back to the resolved site name, which is the right answer for nearly
   * everyone. The field exists for the merchant whose trading name in search
   * differs from the name on their header.
   */
  titleSuffix: z.string().trim().min(1).max(MAX_SEO_SUFFIX).optional(),
  /**
   * The description a page falls back to when it has none of its own.
   *
   * Capped at 160 characters because that is roughly where Google truncates,
   * and a description cut mid-word reads worse than a shorter one.
   */
  description: z.string().trim().min(1).max(MAX_SEO_DESCRIPTION).optional(),
});

export type SiteSeo = z.infer<typeof siteSeoSchema>;

export const DEFAULT_SEO: SiteSeo = {};

/**
 * Completes a partially-stored SEO block, discarding anything unparseable.
 *
 * Field by field, for the same reason `resolveBrand` is: a malformed suffix
 * must not take the merchant's description with it.
 */
export function resolveSiteSeo(stored: unknown): SiteSeo {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return DEFAULT_SEO;

  const source = stored as Record<string, unknown>;
  const clamp = (value: unknown, max: number) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

  const titleSuffix = clamp(source.titleSuffix, MAX_SEO_SUFFIX);
  const description = clamp(source.description, MAX_SEO_DESCRIPTION);

  return {
    ...(titleSuffix ? { titleSuffix } : {}),
    ...(description ? { description } : {}),
  };
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
