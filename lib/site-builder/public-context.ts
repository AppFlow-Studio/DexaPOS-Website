import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createRenderContext,
  resolveTheme,
  type RenderContext,
  type ThemeTokens,
} from "./render-context";
import type { RenderDecision } from "./resolve-render-mode";

/**
 * The render context for a **public** visitor.
 *
 * Deliberately separate from `buildRenderContext` in `site-context.ts`, which
 * serves the editor and preview. That one starts from a Clerk org and a
 * storefront, and scopes everything to the location the merchant happens to be
 * editing. A visitor has neither, and — critically — the location that matters
 * is the one the *page* is about, not the one an editor was looking at.
 *
 * Two things this fixes that the editor path gets wrong (gap audit 1.3 and 3.3):
 *
 *  - **Nav renders.** `merchant_sites.nav` has existed and been read by nothing;
 *    `buildRenderContext` hardcodes `nav: []`, and `HeaderSection` only draws a
 *    `<nav>` when it is non-empty. A multi-page site had no way to move between
 *    its pages.
 *  - **`site_pages.location_id` is honoured.** A brand page carries NULL, and
 *    that null is what makes `canShowPrices` return false. Passing the
 *    storefront's location instead — which is what the editor path does — meant
 *    it could never return false, quietly defeating the "no prices until the
 *    visitor picks a location" rule agreed on 2026-08-15.
 */

/** Branding for the storefront a page speaks for. */
interface StorefrontBranding {
  locationId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  phone: string | null;
  pricingDisclosureText: string | null;
  deliveryPricingEnabled: boolean;
  legacyTheme: Partial<ThemeTokens>;
}

const STORE_COLUMNS =
  "location_id, slug, store_name, logo_url, hero_image_url, phone, primary_color, background_color, text_color, border_color, card_color, font_family, pricing_disclosure_text, delivery_pricing_enabled, is_active";

export interface PublicSiteContext {
  ctx: RenderContext;
  /**
   * What to resolve menu bindings against.
   *
   * `get_menus_for_location` cannot answer without a location even on a brand
   * page, so an unscoped page BORROWS one — the merchant's first active
   * storefront — and says so with `scoped: false`. Names, descriptions and
   * photos live on `menu_items` at the merchant level and are identical
   * everywhere; prices and 86/snooze are not, which is why the renderer then
   * declines to show them (`canShowPrices`).
   *
   * `null` only when the merchant has no active storefront at all, in which
   * case there is nothing to resolve against and menu sections render empty.
   */
  resolver: { locationId: string | null; scoped: boolean };
  merchantId: string;
  deliveryPricingEnabled: boolean;
}

/**
 * Assembles everything a public render needs, given a `builder` decision.
 *
 * Reads `online_store_config` for branding, which is anon-readable through its
 * own `is_active = true` policy. A brand page still needs a name and a logo, so
 * it borrows them from the merchant's first active storefront while keeping its
 * own location null — the branding is merchant-wide, the *pricing scope* is not.
 */
export async function buildPublicRenderContext(
  supabase: SupabaseClient,
  decision: Extract<RenderDecision, { mode: "builder" }>,
  /** `''` when the site is at a host root, `/sites/{slug}` on the path form. */
  basePath: string,
): Promise<PublicSiteContext> {
  const { data } = await supabase
    .from("online_store_config")
    .select(STORE_COLUMNS)
    .eq("merchant_id", decision.merchantId);

  const configs = ((data ?? []) as Record<string, unknown>[]).filter(
    (row) => row.is_active !== false,
  );

  // A location page speaks for one restaurant; a brand page borrows branding
  // from the first storefront but stays unscoped.
  const scoped = decision.locationId
    ? configs.find((row) => row.location_id === decision.locationId)
    : undefined;
  const branding = toBranding(scoped ?? configs[0]);

  const orderUrl = branding ? `/sites/${branding.slug}` : basePath || "/";

  const ctx = createRenderContext({
    mode: "public",
    site: {
      siteId: decision.siteId,
      // The PAGE's location, not the storefront's. Null on a brand page, which
      // is what withholds prices.
      locationId: decision.locationId,
      slug: branding?.slug ?? "",
      name: branding?.name ?? "Our restaurant",
      logoUrl: branding?.logoUrl ?? null,
      heroImageUrl: branding?.heroImageUrl ?? null,
      phone: branding?.phone ?? null,
      basePath,
      // Stage 6 answers what PLAN-03 left open: ordering keeps its own
      // per-location storefront, and the built site links into it rather than
      // growing a checkout (decision D1).
      orderUrl,
      menuUrl: orderUrl,
      nav: readNav(decision.nav, basePath),
      pricingDisclosureText: branding?.pricingDisclosureText ?? null,
    },
    theme: resolveTheme(
      pickThemeTokens(decision.theme),
      branding?.legacyTheme ?? {},
    ),
  });

  return {
    ctx,
    resolver: {
      locationId: decision.locationId ?? branding?.locationId ?? null,
      scoped: decision.locationId !== null,
    },
    merchantId: decision.merchantId,
    deliveryPricingEnabled: branding?.deliveryPricingEnabled ?? true,
  };
}

/**
 * `merchant_sites.nav` → renderable links.
 *
 * Stored as `{ items: [{ label, path }] }`, where `path` is a page path rather
 * than a URL: the same site is reachable at a subdomain and at `/sites/{slug}`,
 * so a stored absolute href would be right in one and broken in the other.
 * Prefixing at render time is what makes one stored nav work at both.
 */
export function readNav(
  nav: unknown,
  basePath: string,
): { label: string; href: string }[] {
  const items = (nav as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];

  return items.flatMap((raw) => {
    const item = raw as { label?: unknown; path?: unknown; href?: unknown };
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!label) return [];

    // An external link is stored as an absolute href and passes through.
    if (typeof item.href === "string" && /^https?:\/\//.test(item.href)) {
      return [{ label, href: item.href }];
    }

    if (typeof item.path !== "string") return [];
    const path = item.path.replace(/^\/+/, "");
    return [{ label, href: path ? `${basePath}/${path}` : basePath || "/" }];
  });
}

function toBranding(config: Record<string, unknown> | undefined): StorefrontBranding | null {
  if (!config) return null;

  const fontFamily = str(config.font_family)
    ? `"${str(config.font_family)}", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
    : null;

  return {
    locationId: String(config.location_id),
    slug: String(config.slug ?? ""),
    name: String(config.store_name ?? "Our restaurant"),
    logoUrl: str(config.logo_url),
    heroImageUrl: str(config.hero_image_url),
    phone: str(config.phone),
    pricingDisclosureText: str(config.pricing_disclosure_text),
    deliveryPricingEnabled: config.delivery_pricing_enabled !== false,
    legacyTheme: Object.fromEntries(
      (
        [
          ["brand", str(config.primary_color)],
          ["surface", str(config.background_color)],
          ["text", str(config.text_color)],
          ["border", str(config.border_color)],
          ["card", str(config.card_color)],
          ["fontFamily", fontFamily],
        ] as const
      ).flatMap(([key, value]) => (value ? [[key, value]] : [])),
    ),
  };
}

function pickThemeTokens(theme: unknown): Partial<ThemeTokens> {
  if (!theme || typeof theme !== "object") return {};
  const source = theme as Record<string, unknown>;
  const keys: (keyof ThemeTokens)[] = [
    "brand", "brandContrast", "surface", "surfaceMuted", "surfaceDark", "text",
    "textMuted", "textOnDark", "border", "card", "fontFamily", "headingFont", "radius",
  ];
  return Object.fromEntries(
    keys.flatMap((key) => (typeof source[key] === "string" ? [[key, source[key]]] : [])),
  ) as Partial<ThemeTokens>;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
