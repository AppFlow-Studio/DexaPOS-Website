/**
 * Everything a section needs that is not its own props or its resolved data.
 *
 * Assembled once per render and threaded down. A section component may not
 * perform I/O and may not reach for a Supabase client — if something is missing
 * from this context, add it here rather than fetching inside a renderer.
 */

import type { ResolvedMap } from "./bindings/resolved";
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
export interface ThemeTokens {
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
  fontFamily: string;
  radius: string;
}

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
  fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
  radius: "12px",
};

/** Site-level facts a section may display without binding to them. */
export interface RenderSite {
  siteId: string;
  locationId: string;
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
    "--site-radius": theme.radius,
  };
}
