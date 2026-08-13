import type { RenderContext } from "@/lib/site-builder/render-context";
import type { LinkTarget, SectionStyle } from "@/lib/site-builder/sections/primitives";

/**
 * Shared chrome for section renderers: spacing, background tone, alignment, and
 * link/price resolution.
 *
 * All of it reads from CSS custom properties set once on the page shell, so a
 * brand-colour change restyles every page instantly without re-rendering or
 * re-publishing anything.
 */

const BACKGROUND_STYLES: Record<
  NonNullable<SectionStyle["background"]>,
  { background: string; color: string }
> = {
  default: { background: "var(--site-surface)", color: "var(--site-text)" },
  muted: { background: "var(--site-surface-muted)", color: "var(--site-text)" },
  brand: { background: "var(--site-brand)", color: "var(--site-brand-contrast)" },
  dark: { background: "var(--site-surface-dark)", color: "var(--site-text-on-dark)" },
};

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

export function sectionStyleProps(style: SectionStyle | undefined): React.CSSProperties {
  return BACKGROUND_STYLES[style?.background ?? "default"];
}

/** Constrained content column. Sections should not invent their own widths. */
export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-5 md:px-8 ${className}`}>{children}</div>
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
