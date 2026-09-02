import { isHexColor, tintOn } from "@/lib/site-builder/color";
import type { RenderContext, ThemeTokens } from "@/lib/site-builder/render-context";
import type {
  LinkTarget,
  SectionStyle,
  TextTone,
} from "@/lib/site-builder/sections/primitives";
import { trackAttrs } from "@/lib/site-builder/tracking";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for section renderers: spacing, background tone, alignment, and
 * link/price resolution.
 *
 * All of it reads from CSS custom properties set once on the page shell, so a
 * brand-colour change restyles every page instantly without re-rendering or
 * re-publishing anything.
 */

/** What each backdrop tone paints behind a section. */
const BACKGROUND_FILLS: Record<Backdrop, string> = {
  default: "var(--site-surface)",
  muted: "var(--site-surface-muted)",
  brand: "var(--site-brand)",
  dark: "var(--site-surface-dark)",
};

/**
 * A section's backdrop, as the text-tone table needs to know it.
 *
 * Not quite `SectionStyle["background"]`: a content block over a photograph
 * darkens itself and is a `dark` backdrop for every purpose that matters here,
 * even though nothing in its `style` says so.
 */
export type Backdrop = NonNullable<SectionStyle["background"]>;

/**
 * Text colour, resolved from the tone the merchant chose **and the backdrop it
 * is standing on**.
 *
 * Every cell is a pair that clears WCAG AA — the four `--site-text-*` variables
 * are derived per theme in `themeToCssVars` precisely so this table can be
 * written as a lookup rather than as a runtime calculation inside fifteen
 * renderers. `__tests__/text-tone.test.ts` sweeps brand hues through both and
 * asserts every cell.
 *
 * Two cells deserve their reasoning stated:
 *
 *  - **`brand` on a `brand` band** falls back to the contrast colour. Brand type
 *    on a brand fill is invisible by definition, and the merchant asking for it
 *    means "make this stand out", so the answer is the colour that does.
 *  - **`muted` never means "faded"** in the CSS sense. It resolves to a real
 *    colour measured against its own backdrop, not `opacity`, because opacity on
 *    a photographic background composites against the photo and can land
 *    anywhere.
 */
type NamedTone = Exclude<TextTone, "custom">;

const TEXT_TONE_COLORS: Record<Backdrop, Record<NamedTone, string>> = {
  default: {
    default: "var(--site-text)",
    muted: "var(--site-text-dim)",
    brand: "var(--site-text-brand)",
  },
  // `surfaceMuted` is 5% from `surface`; the foregrounds validated against one
  // are validated against the other, and the product has always treated them
  // as the same family.
  muted: {
    default: "var(--site-text)",
    muted: "var(--site-text-dim)",
    brand: "var(--site-text-brand)",
  },
  // Both of the brand band's non-default tones collapse to the contrast colour,
  // for the same underlying reason: the fill has already used the contrast
  // budget. Brand type on a brand fill is invisible, and there is no muted
  // colour left that still clears AA — `themeToCssVars` says so at more length.
  // A merchant who picks a tone here sees no change, which is better than one
  // who picks a tone and cannot read the result.
  brand: {
    default: "var(--site-brand-contrast)",
    muted: "var(--site-brand-contrast)",
    brand: "var(--site-brand-contrast)",
  },
  dark: {
    default: "var(--site-text-on-dark)",
    muted: "var(--site-text-dim-on-dark)",
    brand: "var(--site-text-brand-on-dark)",
  },
};

/**
 * What each backdrop is actually painted with, as a colour rather than a token.
 *
 * The named tones resolve to CSS variables and never need this. A *custom*
 * colour does: guarding it means measuring it against the thing behind it, and
 * `contrastRatio` cannot read a `var()`.
 */
function backdropColor(backdrop: Backdrop, theme: ThemeTokens): string {
  switch (backdrop) {
    case "muted":
      return theme.surfaceMuted;
    case "brand":
      return theme.brand;
    case "dark":
      return theme.surfaceDark;
    default:
      return theme.surface;
  }
}

/**
 * The colour a section's copy takes on a given backdrop.
 *
 * Exported because five sections paint their own backdrop rather than taking one
 * from `style.background` — the hero's full-bleed variants, a content block over
 * a photograph, the scrolling banner, the footer's muted band and the events
 * strip. They resolve their tone through this so a merchant's choice means the
 * same thing everywhere, instead of applying to eleven sections and silently
 * doing nothing on the five that most invite it.
 *
 * **The custom colour is guarded here, on every render, not once on save.**
 * Saving a guarded value would be correct exactly until something moved: the
 * merchant switches the section to a dark band, or changes their brand colour,
 * and a hex that was checked against the old backdrop is now checked against
 * nothing. Re-deriving it costs a few colour conversions and cannot go stale.
 *
 * `tintOn` keeps the hue and moves the lightness, so a merchant who asks for
 * their orange gets their orange — darkened until it reads, if it has to be.
 * A malformed or missing hex falls back to the default tone rather than
 * rendering an invalid `color`, which browsers ignore, which would leave the
 * copy whatever colour it inherited.
 */
export function textToneColor(
  backdrop: Backdrop,
  style: SectionStyle | undefined,
  theme: ThemeTokens,
): string {
  const tone = style?.textTone ?? "default";

  if (tone === "custom") {
    // A brand band takes no custom colour, for the reason the table above gives
    // for the named tones: the fill has already spent the contrast budget, and
    // a sweep of the hue circle against it finds nothing that clears AA once the
    // sections fade their copy — not even white. Rather than accept a colour and
    // quietly render something else entirely, the band keeps its one readable
    // foreground. The editor does not offer the picker here.
    if (backdrop === "brand") return TEXT_TONE_COLORS.brand.default;

    const requested = style?.textColor;
    if (!requested || !isHexColor(requested)) return TEXT_TONE_COLORS[backdrop].default;
    return tintOn(requested, backdropColor(backdrop, theme));
  }

  return TEXT_TONE_COLORS[backdrop][tone];
}

const SPACING_CLASSES: Record<NonNullable<SectionStyle["spacing"]>, string> = {
  compact: "py-8 md:py-10",
  normal: "py-12 md:py-16",
  loose: "py-20 md:py-28",
};

/** Responsive visibility. Modelled in the contract; here is where it renders. */
const HIDE_CLASSES: Record<"mobile" | "tablet" | "desktop", string> = {
  mobile: "max-md:hidden",
  tablet: "max-lg:md:hidden",
  desktop: "lg:hidden",
};

export function sectionClassName(style: SectionStyle | undefined, extra = ""): string {
  const spacing = SPACING_CLASSES[style?.spacing ?? "normal"];
  const align = style?.align === "center" ? "text-center" : "";
  const hidden = (style?.hideOn ?? []).map((bp) => HIDE_CLASSES[bp]).join(" ");
  return ["w-full", spacing, align, hidden, extra].filter(Boolean).join(" ");
}

/**
 * `theme` is required rather than optional, and that is load-bearing: a custom
 * text colour cannot be guarded without knowing what is behind it, and an
 * optional parameter would let a call site silently skip the guard. The compiler
 * asks every one of them instead.
 */
export function sectionStyleProps(
  style: SectionStyle | undefined,
  theme: ThemeTokens,
): React.CSSProperties {
  const backdrop = style?.background ?? "default";
  return {
    background: BACKGROUND_FILLS[backdrop],
    color: textToneColor(backdrop, style, theme),
  };
}

/**
 * Constrained content column. Sections should not invent their own widths.
 *
 * Merged through `cn` rather than concatenated: a caller narrowing the column —
 * the FAQ asks for `max-w-3xl`, because a reading column that wide is unreadable
 * — was appending a second `max-width` utility that lost to `max-w-6xl` on
 * source order alone. The section looked like it had been given a width and had
 * silently been refused one, which is the worst of both.
 */
export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-5 md:px-8", className)}>{children}</div>
  );
}

export function SectionHeading({
  heading,
  subheading,
  align,
  headingAttrs,
  subheadingAttrs,
}: {
  heading?: string;
  subheading?: string;
  align?: SectionStyle["align"];
  headingAttrs?: Record<string, string | undefined>;
  subheadingAttrs?: Record<string, string | undefined>;
}) {
  if (!heading && !subheading) return null;
  return (
    <header className={`mb-8 ${align === "center" ? "mx-auto max-w-2xl" : "max-w-2xl"}`}>
      {heading && (
        <h2
          className="text-2xl font-semibold tracking-tight md:text-3xl"
          {...headingAttrs}
        >
          {heading}
        </h2>
      )}
      {subheading && (
        <p className="mt-3 text-base leading-relaxed opacity-75" {...subheadingAttrs}>
          {subheading}
        </p>
      )}
    </header>
  );
}

/**
 * Resolves a stored `LinkTarget` intent into an href.
 *
 * Intents are stored rather than URLs so links stay correct when routing
 * changes — which it will, because the built-site route does not exist yet
 * (see `RenderSite.orderUrl`).
 */
export function resolveHref(target: LinkTarget, ctx: RenderContext): string {
  switch (target.kind) {
    case "order":
      return ctx.site.orderUrl;
    case "menu":
      return ctx.site.menuUrl;
    case "contact":
      return "#contact";
    case "page":
      return `${ctx.site.basePath}/${(target.value ?? "").replace(/^\/+/, "")}`;
    case "phone":
      return target.value ? `tel:${target.value.replace(/[^\d+]/g, "")}` : "#";
    case "url":
      return safeExternalHref(target.value);
    default:
      return "#";
  }
}

/**
 * A link into the ordering storefront that opens one item's details modal.
 *
 * **Why this is safe to point at `orderUrl` directly.** A storefront slug always
 * serves ordering — `decideRenderMode` returns `template` for any address that
 * is not a brand subdomain, so no state of the built site can shadow it — and
 * `orderUrl` is derived from `online_store_config.slug`, which is a storefront
 * address by construction. There is no separate `/menu` route to aim at and no
 * collision to route around.
 *
 * The id is the only thing travelling. The storefront resolves it against the
 * menu data it has already loaded rather than fetching by it, so a crafted id
 * addresses nothing a visitor could not already see — see `ItemDeepLink`.
 *
 * Null when the merchant has no storefront to link into, so the caller drops
 * the button rather than rendering a dead `#`.
 */
export function orderItemHref(
  itemId: string,
  ctx: RenderContext,
): string | null {
  const base = ctx.site.orderUrl;
  if (!base || base === "#") return null;
  return `${base}?item=${encodeURIComponent(itemId)}`;
}

/**
 * Merchant-supplied URLs are untrusted input rendered on a public page, so only
 * http/https/mailto/tel survive — `javascript:` and `data:` are dropped.
 */
export function safeExternalHref(value: string | undefined): string {
  if (!value) return "#";
  const trimmed = value.trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return "#";
  // Bare domains ("example.com") are the common merchant mistake.
  return `https://${trimmed}`;
}

export function CtaButton({
  label,
  target,
  ctx,
  variant = "primary",
  attrs,
}: {
  label: string;
  target: LinkTarget;
  ctx: RenderContext;
  variant?: "primary" | "secondary";
  attrs?: Record<string, string | undefined>;
}) {
  const base =
    "inline-flex items-center justify-center rounded-[var(--site-radius)] px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90";
  const styles =
    variant === "primary"
      ? { background: "var(--site-brand)", color: "var(--site-brand-contrast)" }
      : { background: "transparent", color: "inherit", boxShadow: "inset 0 0 0 1px currentColor" };

  return (
    <a
      href={resolveHref(target, ctx)}
      className={base}
      style={styles}
      // A merchant-entered external link is untrusted; never hand it window.opener.
      {...(target.kind === "url" ? { rel: "noopener noreferrer", target: "_blank" } : {})}
      /*
        A click on "Order Online" is the closest thing a marketing site has to a
        conversion — it is the moment a visitor leaves for the ordering
        storefront. An attribute rather than an onClick, so this stays a server
        component; one delegated listener picks it up. See `TrackingEvents`.
      */
      {...(target.kind === "order" ? trackAttrs("order_click") : {})}
      {...attrs}
    >
      {label}
    </a>
  );
}

/** Currency formatting, matching `formatCurrency` in lib/utils.ts. */
export function formatMoney(amount: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}
