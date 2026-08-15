import { cache } from "react";

import type { ResolverContext, ResolverSources } from "./bindings/resolve";
import {
  createRenderContext,
  resolveTheme,
  type RenderContext,
  type RenderMode,
  type ThemeTokens,
} from "./render-context";
import { getRequestSupabase } from "./request-scope";

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
const fetchMerchantId = cache(async (clerkOrgId: string): Promise<string | null> => {
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

/** Website-wide design is optional while the website migration rolls out. */
const fetchWebsiteTheme = cache(async (merchantId: string): Promise<Partial<ThemeTokens>> => {
  const { data, error } = await getRequestSupabase()
    .from("merchant_sites")
    .select("theme")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (error || !data?.theme || typeof data.theme !== "object") return {};
  return pickThemeTokens(data.theme as Record<string, unknown>);
});

export async function loadSiteContext(
  clerkOrgId: string,
  locationId?: string,
): Promise<SiteContext | null> {
  const merchantId = await fetchMerchantId(clerkOrgId);
  if (!merchantId) return null;

  const [configs, websiteTheme] = await Promise.all([
    fetchStoreConfigs(merchantId),
    fetchWebsiteTheme(merchantId),
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
    websiteTheme,
  };
}

export function buildRenderContext(site: SiteContext, mode: RenderMode): RenderContext {
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
      nav: [],
      pricingDisclosureText: site.pricingDisclosureText,
    },
    // The website theme wins; anything it does not set falls back to the older
    // storefront colours, then to the DexaPOS defaults. `resolveTheme` also
    // carries `headingFont` back to `fontFamily` for sites saved before the
    // heading typeface existed.
    theme: resolveTheme(site.websiteTheme, legacyStorefrontTheme(site.colors)),
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
