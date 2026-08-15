/**
 * Everything a section needs that is not its own props or its resolved data.
 *
 * Assembled once per render and threaded down. A section component may not
 * perform I/O and may not reach for a Supabase client — if something is missing
 * from this context, add it here rather than fetching inside a renderer.
 */

import type { ResolvedMap } from "./bindings/resolved";
import { readableOn } from "./color";
import type { SectionKind } from "./sections/kinds";
import type { SectionOf } from "./sections/types";

export type RenderMode =
  /** The live public site. No editing affordances, no hidden sections. */
  | "public"
  /** Merchant-only preview of a draft. Renders exactly like public. */
  | "preview"
  /** Inside the builder canvas: stamps edit attributes, shows hidden sections. */
  | "builder";

/**
 * Design tokens, emitted once as CSS custom properties on the page shell.
 *
 * Sections consume `var(--site-brand)` and never inline a computed colour —
 * otherwise changing a brand colour would require re-rendering and re-publishing
 * every page instead of updating one value on the shell.
 */
// A type alias rather than an interface, deliberately: `merchant_sites.theme`
// is typed `Record<string, unknown>`, and only aliases get the implicit index
// signature that makes a theme assignable to it without a cast.
export type ThemeTokens = {
  brand: string;
  /** Readable foreground on `brand`. Kept explicit so contrast stays intentional. */
  brandContrast: string;
  surface: string;
  surfaceMuted: string;
  surfaceDark: string;
  text: string;
  textMuted: string;
  textOnDark: string;
  border: string;
  card: string;
  /** Body copy typeface. A complete CSS `font-family` value, fallbacks included. */
  fontFamily: string;
  /**
   * Headline typeface, applied to `h1`–`h6` by `SiteChrome`.
   *
   * Split from `fontFamily` because the single strongest lever a restaurant has
   * on how its site *feels* is a display face over readable body copy, and one
   * font field cannot express that. Themes saved before this token existed have
   * no value here — `resolveTheme` falls them back to `fontFamily` rather than
   * to the default, so an existing site's typography does not change underneath
   * the merchant.
   */
  headingFont: string;
  radius: string;
};

export const DEFAULT_THEME: ThemeTokens = {
  brand: "#0C4FD1",
  brandContrast: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceMuted: "#F6F7F9",
  surfaceDark: "#111827",
  text: "#111827",
  textMuted: "#5B6472",
  textOnDark: "#F9FAFB",
  border: "#E5E7EB",
  card: "#FFFFFF",
  fontFamily: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headingFont: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  radius: "12px",
};

/**
 * Completes a partially-stored theme.
 *
 * `merchant_sites.theme` is free-form jsonb written by whatever version of the
 * workspace was deployed when the merchant last saved, so a row may be missing
 * any key. Every reader goes through here so "missing" resolves the same way
 * everywhere — in particular `headingFont`, which must inherit the merchant's
 * chosen `fontFamily` rather than snap back to the DexaPOS default.
 */
export function resolveTheme(
  stored: Partial<ThemeTokens> | null | undefined,
  fallback: Partial<ThemeTokens> = {},
): ThemeTokens {
  const layers = [stored ?? {}, fallback, DEFAULT_THEME];
  const merged = { ...DEFAULT_THEME, ...fallback, ...(stored ?? {}) };

  // `brandContrast` is only meaningful beside the brand colour it was chosen
  // for, so it is taken from whichever layer supplied `brand` — never inherited
  // across layers. Without this, a merchant whose storefront `primary_color` is
  // a light teal gets the default white button text on top of it: 1.9:1, and
  // unreadable. Deriving it is strictly better than inheriting a stale one.
  const brandLayer = layers.find((layer) => layer.brand !== undefined) ?? DEFAULT_THEME;

  return {
    ...merged,
    brandContrast: brandLayer.brandContrast ?? readableOn(merged.brand),
    headingFont: stored?.headingFont ?? fallback.headingFont ?? merged.fontFamily,
  };
}

/** Site-level facts a section may display without binding to them. */
export interface RenderSite {
  siteId: string;
  /**
   * The one restaurant this render is scoped to, or `null` on a brand page whose
   * visitor has not chosen a location yet.
   *
   * A site covers a whole merchant; a *page* may be about one location
   * (`site_pages.location_id`) or about the brand. Null means prices and
   * availability are not yet answerable — five branches may charge five
   * different amounts — so sections must not show either. Use `canShowPrices`
   * rather than testing this field directly.
   */
  locationId: string | null;
  slug: string;
  name: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  phone: string | null;
  /**
   * Prefix for links to the site's own pages. Empty on a subdomain or custom
   * domain (where the site is at the root); `/sites/{slug}` on the path form.
   */
  basePath: string;
  /**
   * Where "Order Now" goes.
   *
   * Supplied rather than derived because the answer is a **routing decision
   * this layer cannot make**: the ordering storefront currently lives at the
   * root of `/sites/[slug]`, which is exactly where a built site wants to be.
   * Stage 6 resolves that collision (see PLAN-04 §2) and fills this in; a
   * renderer that hardcoded a path would have to be revisited when it does.
   */
  orderUrl: string;
  /** Where "See full menu" goes. Same reasoning as `orderUrl`. */
  menuUrl: string;
  /** Nav items live on the site, not the page — see PLAN-01 §7. */
  nav: { label: string; href: string }[];
  /**
   * Mirrors `online_store_config.pricing_disclosure_text`. If the storefront
   * shows a dual-pricing disclosure, a built page showing prices must too.
   */
  pricingDisclosureText: string | null;
}

export interface RenderContext {
  mode: RenderMode;
  site: RenderSite;
  theme: ThemeTokens;
  /** Carried from day one; retrofitting a locale through 9 renderers is misery. */
  locale: string;
  /**
   * Resolves an `AssetRef.assetId` to a URL.
   *
   * Stubbed to `null` in v1 — `site_assets` is Stage 7. Renderers must already
   * treat a null result as "no image" rather than a broken one, so turning the
   * asset pipeline on later changes nothing in this layer.
   */
  resolveAssetUrl: (assetId: string) => string | null;
}

/**
 * Whether money may appear in this render.
 *
 * The single source of truth for the product rule "no prices until the visitor
 * picks a location" (decided 2026-08-15). One merchant's branches can charge
 * different amounts for the same dish, so a price shown before a location is
 * chosen is a guess — and a guess about money is a support ticket.
 *
 * A section still needs its own `showPrices` prop to be true; this only ever
 * takes prices away, never adds them.
 *
 * The same condition governs 86/snooze: on an unscoped page there is no single
 * kitchen to be out of something, so nothing is filtered for availability.
 */
export function canShowPrices(ctx: RenderContext): boolean {
  return ctx.site.locationId !== null;
}

/** Uniform props every section component receives. */
export interface SectionRenderProps<K extends SectionKind = SectionKind> {
  section: SectionOf<K>;
  resolved: ResolvedMap;
  ctx: RenderContext;
}

export function createRenderContext(
  overrides: Partial<RenderContext> & { site: RenderSite },
): RenderContext {
  return {
    mode: "public",
    locale: "en-US",
    theme: DEFAULT_THEME,
    resolveAssetUrl: () => null,
    ...overrides,
  };
}

/** Emits the token set as inline CSS custom properties for the shell element. */
export function themeToCssVars(theme: ThemeTokens): Record<string, string> {
  return {
    "--site-brand": theme.brand,
    "--site-brand-contrast": theme.brandContrast,
    "--site-surface": theme.surface,
    "--site-surface-muted": theme.surfaceMuted,
    "--site-surface-dark": theme.surfaceDark,
    "--site-text": theme.text,
    "--site-text-muted": theme.textMuted,
    "--site-text-on-dark": theme.textOnDark,
    "--site-border": theme.border,
    "--site-card": theme.card,
    "--site-font": theme.fontFamily,
    "--site-heading-font": theme.headingFont || theme.fontFamily,
    "--site-radius": theme.radius,
  };
}
