import { cache } from "react";

import type { MerchantSiteRow } from "./db-types";
import type { ResolverContext, ResolverSources } from "./bindings/resolve";
import { assetResolver, EMPTY_ASSET_MAP, type AssetMap } from "./asset-map";
import {
  createRenderContext,
  resolveTheme,
  type RenderContext,
  type RenderMode,
  type ThemeTokens,
} from "./render-context";
import { readNav } from "./public-context";
import { getRequestSupabase } from "./request-scope";
import { readSiteSettings, type SiteBrand, type SiteFeatures } from "./site-settings";

/**
 * Loads the site-level facts a render needs, and turns them into a
 * `RenderContext`.
 *
 * Shared by the preview page, the builder's render route, and — later — the
 * public route, so all three render with identical branding, pricing disclosure
 * and link targets. Divergence here would be invisible until a merchant noticed
 * their preview looked different from their live site.
 *
 * Reads `online_store_config`, the storefront the builder is layered on top of
 * (decision D1). `merchant_sites` is deliberately not read yet — the Stage 2
 * migration is unapplied, and nothing here needs it.
 */

const STORE_COLUMNS =
  "id, location_id, slug, store_name, logo_url, hero_image_url, phone, primary_color, background_color, text_color, border_color, card_color, font_family, pricing_disclosure_text, delivery_pricing_enabled";

export interface SiteContext {
  merchantId: string;
  locationId: string;
  storeConfigId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  phone: string | null;
  pricingDisclosureText: string | null;
  deliveryPricingEnabled: boolean;
  colors: {
    primary: string | null;
    background: string | null;
    text: string | null;
    border: string | null;
    card: string | null;
    fontFamily: string | null;
  };
  /** Global Website-tab design settings. Storefront values remain the fallback. */
  websiteTheme: Partial<ThemeTokens>;
  /** The merchant's brand toggles, resolved. Everything off before they set any. */
  features: SiteFeatures;
  /** Brand facts — social accounts, reservation link, cuisines, price range. */
  brand: SiteBrand;
  /** `merchant_sites.nav`, raw. Turned into links by `buildRenderContext`. */
  nav: unknown;
}

type StoreConfigRow = Record<string, string | boolean | null>;

/**
 * The two round trips behind a site context, memoised **per request** and keyed
 * only on primitives.
 *
 * Splitting them out is what makes the deduplication actually land. The builder
 * page resolves its context from `?location=` (often `undefined`) and then hands
 * the *resolved* uuid to `renderCanvas`, so the two `loadSiteContext` calls in
 * one request genuinely disagree about their arguments — memoising the composed
 * function would miss every time. Memoising the queries instead means both calls
 * do the same JS `.find()` over one shared fetch, and neither issues a second
 * round trip.
 *
 * A Supabase client is deliberately not a parameter: it is a fresh object per
 * construction, and `cache()` keys on argument identity, so taking one would
 * defeat the memo. See `request-scope.ts`.
 */
export const fetchMerchantId = cache(async (clerkOrgId: string): Promise<string | null> => {
  const { data, error } = await getRequestSupabase()
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!data?.id) {
    // "No merchant for this org" and "merchant has no storefront" are different
    // problems with different fixes, so they are logged and reported separately
    // rather than collapsed into one unhelpful message.
    console.warn(`[site-builder] no merchant for clerk org ${clerkOrgId}`, error?.message ?? "");
    return null;
  }
  return data.id as string;
});

/**
 * Every storefront the merchant owns.
 *
 * One flat query, then pick in JS. Conditionally chaining `.eq()` onto a
 * reassigned builder grows the PostgrestFilterBuilder type until inference gives
 * up (TS2589), and a merchant has a handful of storefronts at most.
 */
const fetchStoreConfigs = cache(async (merchantId: string): Promise<StoreConfigRow[]> => {
  const { data, error } = await getRequestSupabase()
    .from("online_store_config")
    .select(STORE_COLUMNS)
    .eq("merchant_id", merchantId);

  if (error) {
    console.warn(`[site-builder] storefront lookup failed for ${merchantId}`, error.message);
  }
  return (data ?? []) as StoreConfigRow[];
});

/**
 * The merchant's website row, or `null` before the builder has ever been opened.
 *
 * Selects the whole row rather than just `theme` so that `GetOrCreateSite` can
 * reuse it: the builder route needs both the design tokens and the site record,
 * and reading the same row twice cost a full round trip on every page open.
 * The row is a handful of small JSON columns, so the wider projection is free
 * where the extra round trip was not.
 */
export const fetchMerchantSite = cache(
  async (merchantId: string): Promise<MerchantSiteRow | null> => {
    const { data, error } = await getRequestSupabase()
      .from("merchant_sites")
      .select("*")
      .eq("merchant_id", merchantId)
      .maybeSingle();

    if (error) {
      console.warn(`[site-builder] site lookup failed for ${merchantId}`, error.message);
      return null;
    }
    return (data as MerchantSiteRow | null) ?? null;
  },
);

/**
 * Everything the editor needs off `merchant_sites`, from the one memoised read.
 *
 * A merchant who has never opened the builder has no row at all, so every field
 * has to survive its absence — which is exactly what `readSiteSettings` and
 * `resolveTheme` already do for a row that exists but is missing keys.
 */
async function fetchWebsiteSettings(merchantId: string): Promise<{
  websiteTheme: Partial<ThemeTokens>;
  features: SiteFeatures;
  brand: SiteBrand;
  nav: unknown;
}> {
  const site = await fetchMerchantSite(merchantId);
  const { features, brand } = readSiteSettings({
    features: site?.features,
    brand: site?.brand,
  });

  return {
    websiteTheme:
      site?.theme && typeof site.theme === "object"
        ? pickThemeTokens(site.theme as Record<string, unknown>)
        : {},
    features,
    brand,
    nav: site?.nav ?? null,
  };
}

export async function loadSiteContext(
  clerkOrgId: string,
  locationId?: string,
): Promise<SiteContext | null> {
  const merchantId = await fetchMerchantId(clerkOrgId);
  if (!merchantId) return null;

  const [configs, website] = await Promise.all([
    fetchStoreConfigs(merchantId),
    fetchWebsiteSettings(merchantId),
  ]);
  const config = locationId
    ? configs.find((c) => c.location_id === locationId)
    : configs[0];

  if (!config) {
    console.warn(
      `[site-builder] merchant ${merchantId} has no storefront` +
        (locationId ? ` for location ${locationId}` : "") +
        ` (${configs.length} found)`,
    );
    return null;
  }

  return {
    merchantId,
    locationId: String(config.location_id),
    storeConfigId: String(config.id),
    slug: String(config.slug ?? ""),
    name: String(config.store_name ?? "Your restaurant"),
    logoUrl: nullableString(config.logo_url),
    heroImageUrl: nullableString(config.hero_image_url),
    phone: nullableString(config.phone),
    pricingDisclosureText: nullableString(config.pricing_disclosure_text),
    deliveryPricingEnabled: config.delivery_pricing_enabled !== false,
    colors: {
      primary: nullableString(config.primary_color),
      background: nullableString(config.background_color),
      text: nullableString(config.text_color),
      border: nullableString(config.border_color),
      card: nullableString(config.card_color),
      fontFamily: nullableString(config.font_family),
    },
    websiteTheme: website.websiteTheme,
    features: website.features,
    brand: website.brand,
    nav: website.nav,
  };
}

export function buildRenderContext(
  site: SiteContext,
  mode: RenderMode,
  /**
   * The assets this page references. Optional so that callers which render no
   * images — and the tests — need not load one; an absent map simply means the
   * canvas draws text and skips photographs.
   */
  assets: AssetMap = EMPTY_ASSET_MAP,
): RenderContext {
  const basePath = `/sites/${site.slug}`;

  return createRenderContext({
    mode,
    site: {
      siteId: site.storeConfigId,
      locationId: site.locationId,
      slug: site.slug,
      name: site.name,
      logoUrl: site.logoUrl,
      heroImageUrl: site.heroImageUrl,
      phone: site.phone,
      basePath,
      // Stage 6 owns the real answer (PLAN-04 §2): the ordering storefront sits
      // at the root of /sites/[slug], which is exactly where a built site wants
      // to be. Until that collision is resolved, both point at the storefront.
      orderUrl: basePath,
      menuUrl: basePath,
      /**
       * The real navigation, not an empty list.
       *
       * This was hardcoded to `[]`, which meant the builder canvas and the
       * preview drew a header with no links on a site that has them — a
       * merchant arranging their navigation watched nothing change beside them.
       * It was defensible when nothing could edit the nav; it stopped being
       * defensible the moment the nav editor shipped.
       *
       * `basePath` here is the storefront path form, which is what the editor
       * previews at; the public render prefixes the same stored paths with `''`
       * when the visitor arrived by subdomain. One stored nav, correct at both.
       */
      nav: readNav(site.nav, basePath),
      pricingDisclosureText: site.pricingDisclosureText,
      features: site.features,
      brand: site.brand,
    },
    // The website theme wins; anything it does not set falls back to the older
    // storefront colours, then to the DexaPOS defaults. `resolveTheme` also
    // carries `headingFont` back to `fontFamily` for sites saved before the
    // heading typeface existed.
    theme: resolveTheme(site.websiteTheme, legacyStorefrontTheme(site.colors)),
    resolveAsset: assetResolver(assets),
  });
}

/**
 * The pre-builder storefront colours, expressed as theme tokens.
 *
 * `online_store_config` stores a bare family name (`"Poppins"`) rather than a
 * CSS stack, so it is wrapped with the same system fallbacks the catalogue uses
 * — a stack of one name renders as nothing if the file fails to load.
 */
function legacyStorefrontTheme(colors: SiteContext["colors"]): Partial<ThemeTokens> {
  const fontFamily = colors.fontFamily
    ? `"${colors.fontFamily}", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
    : null;

  return Object.fromEntries(
    (
      [
        ["brand", colors.primary],
        ["surface", colors.background],
        ["text", colors.text],
        ["border", colors.border],
        ["card", colors.card],
        ["fontFamily", fontFamily],
      ] as const
    ).flatMap(([key, value]) => (value ? [[key, value]] : [])),
  );
}

function pickThemeTokens(theme: Record<string, unknown>): Partial<ThemeTokens> {
  const keys: (keyof ThemeTokens)[] = [
    "brand", "brandContrast", "surface", "surfaceMuted", "surfaceDark", "text",
    "textMuted", "textOnDark", "border", "card", "fontFamily", "headingFont", "radius",
  ];
  return Object.fromEntries(keys.flatMap((key) => typeof theme[key] === "string" ? [[key, theme[key]]] : [])) as Partial<ThemeTokens>;
}

/**
 * Menu item ids to seed a starter page with.
 *
 * Drawn from the **resolver's** own source rather than from `menu_items`
 * directly, for two reasons:
 *
 *  1. *Correctness.* `menu_items` holds every item the merchant has ever
 *     created; the resolver only knows items on a menu serving this location.
 *     Seeding from the wider set produced ids that resolved `not_found` and were
 *     silently dropped from the grid — a starter page that looked broken through
 *     no fault of the merchant's. Filtering on `available` extends the same idea
 *     to items that are 86'd right now.
 *  2. *Cost.* `sources.fetchMenuItems` memoises per request, so this shares the
 *     one 354 KB menu fetch the resolver is about to make anyway. It used to be
 *     a separate round trip.
 *
 * Returns `[]` on failure: a starter page with an empty favourites row is a far
 * better outcome than a 500, and the resolver reports the underlying error.
 */
export async function loadSampleMenuItemIds(
  sources: ResolverSources,
  ctx: ResolverContext,
  limit = 6,
): Promise<string[]> {
  try {
    const items = await sources.fetchMenuItems(ctx);
    return items
      .filter((item) => item.available)
      .slice(0, limit)
      .map((item) => item.id);
  } catch {
    return [];
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
