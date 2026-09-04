/**
 * Everything a section needs that is not its own props or its resolved data.
 *
 * Assembled once per render and threaded down. A section component may not
 * perform I/O and may not reach for a Supabase client — if something is missing
 * from this context, add it here rather than fetching inside a renderer.
 */

import type { ResolvedMap } from "./bindings/resolved";
import { mutedOn, readableOn, tintOn } from "./color";
import type { RenderEvent } from "./events/event-map";
import type { ResolvedForm } from "./forms/form-map";
import { EMPTY_RESERVATIONS_CONFIG, type ReservationsConfig } from "./reservations/protocol";
import type { SiteBrand, SiteFeatures } from "./site-settings";
import { DEFAULT_BRAND, DEFAULT_FEATURES } from "./site-settings";
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
/** A resolved asset, as a renderer needs it. */
export interface ResolvedAsset {
  url: string;
  /** The library's default alt text. An `AssetRef.alt` overrides it. */
  alt: string | null;
  width: number | null;
  height: number | null;
}

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
  /**
   * The branch this PAGE is about, or null on a brand page.
   *
   * **Not the same question as `locationId`, and the two must never be conflated
   * again.** `locationId` is the *pricing* scope: it falls back to the brand's
   * default branch, because a brand page still has to decide whose prices to
   * show. This one is `site_pages.location_id` and nothing else — it is only set
   * when the merchant genuinely built a page about one restaurant.
   *
   * Booking reads THIS. It used to read `locationId`, which meant a merchant
   * answering a question about prices silently answered a different question —
   * which restaurant a guest is eating at — and a two-branch site booked every
   * guest into the pricing default without ever naming it. See
   * PLAN-2026-08-29-RESERVATIONS-BRANCH-CHOICE.
   */
  pageLocationId: string | null;
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
  /**
   * The merchant's brand toggles, as the *renderer* sees them.
   *
   * A section reads these to decide whether a capability exists at all — the
   * header's "Book a table" button is `features.reservations && brand.reservationUrl`,
   * not a per-page prop. Putting it on the context rather than in each section's
   * props is what stops a merchant having to switch reservations on in nine
   * places.
   */
  features: SiteFeatures;
  /**
   * Brand facts a section may display without binding to them: social accounts,
   * the reservation link, cuisines, price range.
   *
   * These are *site-wide*, so a section that renders them carries a `show…`
   * boolean and nothing else. The footer's `showSocial` is the pattern: the page
   * decides whether, the brand decides what.
   */
  brand: SiteBrand;
  /**
   * Branches a guest may book, with the settings each one's form is shaped by.
   *
   * **Empty everywhere except a live public render**, and empty there too unless
   * reservations resolve to `native`. The builder and the preview draw a static
   * mock instead — not for performance, but because both render against a *real*
   * restaurant, and a live widget would let a merchant laying out their page
   * place genuine holds on genuine tables during service.
   *
   * It lives on the context rather than in the section's props because
   * `ReservationsSection` is a server component that must never be `async`: the
   * canvas renders the section graph through `renderToStaticMarkup`, which
   * cannot await. Loading it here — in `buildPublicRenderContext`, which already
   * is async — is what lets the section stay synchronous and still know which
   * branches exist. See `reservations/config.ts`.
   */
  reservations: ReservationsConfig;
}

export interface RenderContext {
  mode: RenderMode;
  site: RenderSite;
  theme: ThemeTokens;
  /** Carried from day one; retrofitting a locale through 9 renderers is misery. */
  locale: string;
  /**
   * Resolves an `AssetRef.assetId` to something renderable.
   *
   * Returns the intrinsic dimensions alongside the URL so `SiteImage` can emit
   * `width`/`height` and stop the layout shift that merchant photography
   * otherwise causes on every page it appears on — a Core Web Vitals number, on
   * a product sold partly on search ranking.
   *
   * `null` means "no image", never "broken image": a deleted asset, an id from
   * another merchant, or a reference that predates the library all resolve the
   * same way, and every renderer already treats that as nothing to draw.
   */
  resolveAsset: (assetId: string) => ResolvedAsset | null;
  /**
   * Resolves a `form` section's `formId` to a definition it can render.
   *
   * The same indirection as `resolveAsset`, and for the same reason: a form is
   * a reusable object referenced by id, never a snapshot embedded in the page.
   * That is what lets one form sit on four pages with one inbox behind it, and
   * what makes editing the form update all four without republishing any.
   *
   * `null` means "no form to draw" — deleted, unpublished, or belonging to
   * another merchant — and the section renders nothing rather than a broken
   * embed.
   */
  resolveForm: (formId: string) => ResolvedForm | null;
  /**
   * The result of a form post that has just redirected back to this page.
   *
   * Carried on the context rather than read inside the section because a
   * section performs no I/O and receives no request — and because a page may
   * hold two forms, so the id has to be compared rather than a bare boolean
   * passed down. `formStateFor` does that comparison.
   */
  formState?: { submitted?: string | null; error?: string | null };
  /**
   * When this request was served, as an epoch milliseconds stamp.
   *
   * Exists for the public form's minimum-fill-time check, which needs a "when
   * was this page drawn" value and has no JavaScript to measure one with. It
   * lives here rather than being read inside the form because a section must be
   * a pure function of its inputs — calling `Date.now()` during render is
   * exactly the impurity React's own lint rule objects to, and the context is
   * assembled once per request in a loader where the call is honest.
   *
   * `0` means "not stamped", and the submit handler treats that as no signal
   * rather than as an instant submission.
   */
  renderedAt?: number;
  /**
   * The site's live events.
   *
   * A list rather than a resolver, unlike `resolveAsset` and `resolveForm`,
   * because the `events` section references no particular event — it renders
   * whatever is upcoming. That is the whole point of events being first-class
   * records: one added today appears on every page carrying the section,
   * without any of them being republished.
   *
   * Already loaded; the section filters it to what is upcoming, which depends
   * on the viewer's local date and so cannot be done in SQL.
   */
  events?: RenderEvent[];
  /**
   * Where an event's detail page lives, given its slug.
   *
   * Supplied rather than derived for the same reason as `orderUrl`: the built
   * site is at a host root on a subdomain and under `/sites/{slug}` on the path
   * form, and a renderer that hardcoded one would be broken on the other.
   */
  eventUrl?: (slug: string) => string;
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

/**
 * `RenderSite` minus the two settings blocks, which every caller would
 * otherwise have to spell out in full to say "this merchant has none".
 */
export type RenderSiteInput = Omit<
  RenderSite,
  "features" | "brand" | "reservations" | "pageLocationId"
> &
  Partial<Pick<RenderSite, "features" | "brand" | "reservations" | "pageLocationId">>;

export function createRenderContext(
  overrides: Partial<Omit<RenderContext, "site">> & { site: RenderSiteInput },
): RenderContext {
  const { site, ...rest } = overrides;

  return {
    mode: "public",
    locale: "en-US",
    theme: DEFAULT_THEME,
    // No library by default. Tests, fixtures and any surface that has not
    // loaded assets render text and skip photographs rather than
    // reaching for a URL that would not exist.
    resolveAsset: () => null,
    resolveForm: () => null,
    ...rest,
    // Everything off and nothing set, unless the caller says otherwise. A
    // fixture that has never heard of brand settings renders exactly as it did
    // before they existed, which is what keeps this addition invisible to the
    // 400-odd tests that predate it.
    // `reservations` defaults empty for the same reason: a fixture, the builder
    // canvas and the preview all render the static mock, and only a live public
    // render with native bookings on ever fills it in.
    site: {
      features: DEFAULT_FEATURES,
      brand: DEFAULT_BRAND,
      reservations: EMPTY_RESERVATIONS_CONFIG,
      // A fixture that says nothing about pages is a brand page: no branch of
      // its own, so booking asks rather than assuming.
      pageLocationId: null,
      ...site,
    },
  };
}

/**
 * Emits the token set as inline CSS custom properties for the shell element.
 *
 * The four `--site-text-*` variables at the bottom are **derived here rather
 * than stored**, which is deliberate. They exist for the per-section text tone
 * (`SectionStyle.textTone`), and every one of them is a fact about a
 * *foreground/background pair* — "the brand colour, made readable on the dark
 * band" is not a property of the theme a merchant saved, it is a property of
 * that colour and that band together. Storing them would mean a theme row could
 * hold a pair that no longer agrees with itself, which is the bug
 * `resolveTheme` already has to work around for `brandContrast`.
 *
 * Computing them at render costs a few colour conversions once per page and
 * makes the readability guarantee structural: a section can only ask for a tone,
 * and every tone it can ask for resolves to something that clears AA on the
 * backdrop it names. See `__tests__/text-tone.test.ts`, which sweeps the pairs.
 */
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

    // The brand colour as *type*, on each of the two backdrop families. A brand
    // is picked to work as a button fill, where its own contrast is nobody's
    // problem; `tintOn` keeps the hue and moves the lightness until it reads.
    "--site-text-brand": tintOn(theme.brand, theme.surface),
    "--site-text-brand-on-dark": tintOn(theme.brand, theme.surfaceDark),
    // The `muted` text tone, on each of the three backdrop families.
    //
    // Deliberately *not* the stored `textMuted`, which is only correct against
    // `surface` — it is 36% of the way toward a colour the brand and dark bands
    // are not — and which carries no headroom for the fade the sections apply to
    // their own secondary copy. See `mutedOn`.
    // No `--site-text-dim-on-brand`, and the absence is the finding: a brand
    // fill spends the whole contrast budget. `brandContrast` on a saturated red
    // measures barely over AA before anything is done to it, so *any* muting
    // takes it under — there is no readable de-emphasised colour on that band to
    // emit. The tone table resolves `muted` to the contrast colour there
    // instead, which is the honest answer rather than a token that silently
    // does nothing.
    "--site-text-dim": mutedOn(theme.text, theme.surface),
    "--site-text-dim-on-dark": mutedOn(theme.textOnDark, theme.surfaceDark),
  };
}
