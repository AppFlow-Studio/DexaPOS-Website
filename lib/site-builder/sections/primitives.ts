/**
 * Value types shared across section schemas.
 *
 * Kept dependency-free (zod only) so every schema file can import them without
 * creating a cycle through the registry.
 */

import { z } from "zod";

/**
 * Where a button or link points.
 *
 * Internal kinds resolve at render time against the merchant's own storefront —
 * `order` goes to the existing online-ordering flow (decision D1: the builder
 * links into checkout, it does not grow its own). Storing an intent rather than
 * a URL means the link stays correct if routing changes.
 */
export const LINK_KINDS = [
  "order",
  "menu",
  "contact",
  "page",
  "url",
  "phone",
] as const;

export type LinkKind = (typeof LINK_KINDS)[number];

export interface LinkTarget {
  kind: LinkKind;
  /** Page path for `page`, absolute URL for `url`, number for `phone`. Unused otherwise. */
  value?: string;
}

export const linkTargetSchema = z.object({
  kind: z.enum(LINK_KINDS),
  value: z.string().max(2048).optional(),
});

/**
 * Per-instance styling.
 *
 * Deliberately an enum-constrained token set, never raw CSS. Merchant-authored
 * CSS on a public page is both an XSS surface and the fastest route to sites
 * that look broken — and "your site looks professional" is the promise this
 * feature is selling.
 *
 * This is an *object* rather than a flat enum so that VISION-UNBOUNDED §3's
 * design-token system can be added as extra fields later without a type change.
 */
export const BACKGROUND_TONES = ["default", "muted", "brand", "dark"] as const;
export const SPACING_SCALES = ["compact", "normal", "loose"] as const;
export const ALIGNMENTS = ["left", "center"] as const;
export const BREAKPOINTS = ["mobile", "tablet", "desktop"] as const;

/**
 * The colour of a section's copy — **relative to what it is sitting on**, never
 * an absolute value.
 *
 * This is the answer to "let merchants change the font colour", and the shape of
 * it is the whole point. A stored hex would be wrong the moment anything around
 * it moved: switch the section's background from Default to Dark and navy type
 * disappears; change the brand colour and every page that hardcoded the old one
 * keeps it; publish, and the value is frozen into an immutable snapshot. A tone
 * is re-resolved against the actual backdrop on every render, so none of those
 * states exist.
 *
 * `brand` is the option merchants are actually asking for when they ask for this
 * — their headline in their own colour — and `tintOn` is what makes it safe to
 * grant on any backdrop.
 *
 * `custom` is the escape hatch for a merchant with a brand guide, and it is the
 * one value that carries a colour of its own in `textColor`. It is **still not
 * raw CSS**: the stored hex is a *request*, not the rendered value. Every render
 * puts it through `tintOn` against the backdrop the section actually sits on, so
 * a colour that cannot be read there is darkened or lightened until it can. The
 * merchant keeps their hue; the visitor keeps a page they can read. What is
 * given up, and what the editor says out loud, is that a custom colour no longer
 * follows a later theme change the way the other three tones do.
 *
 * Absent means `default`, which is the colour these sections have always used.
 */
export const TEXT_TONES = ["default", "muted", "brand", "custom"] as const;

export type TextTone = (typeof TEXT_TONES)[number];

/**
 * A six-digit hex colour, and nothing else.
 *
 * Not `z.string()`: this value ends up inside a `style` attribute on a public
 * page, and the section schemas are the boundary that decides what may get
 * there. The regex is the whole defence — `normalizeHex` in the editor produces
 * exactly this shape, so anything else arriving here was not typed by the
 * control.
 */
export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export interface SectionStyle {
  background?: (typeof BACKGROUND_TONES)[number];
  spacing?: (typeof SPACING_SCALES)[number];
  align?: (typeof ALIGNMENTS)[number];
  textTone?: TextTone;
  /**
   * The colour behind `textTone: "custom"`, as the merchant asked for it.
   *
   * Kept when they switch back to a named tone, so flipping to Default to
   * compare and back again does not lose the colour they mixed. Ignored by every
   * tone but `custom`.
   */
  textColor?: string;
  /** Responsive visibility. Modelled now; the builder UI for it can ship later. */
  hideOn?: (typeof BREAKPOINTS)[number][];
}

export const sectionStyleSchema = z.object({
  background: z.enum(BACKGROUND_TONES).optional(),
  spacing: z.enum(SPACING_SCALES).optional(),
  align: z.enum(ALIGNMENTS).optional(),
  textTone: z.enum(TEXT_TONES).optional(),
  textColor: hexColorSchema.optional(),
  hideOn: z.array(z.enum(BREAKPOINTS)).max(3).optional(),
});

/** Rich-text HTML. Sanitized on write and on render — never trusted. */
export const richTextSchema = z.string().max(20_000);

/**
 * The copy limits, and the cheapest quality mechanism in the product.
 *
 * These are Owner.com's numbers, read off a live account
 * (docs/research/owner-com-website-tab/features/06-section-types.md). They are
 * hard caps with a live counter beside the field, not warnings a merchant can
 * push past, and they are the reason an Owner site never carries a headline
 * that wraps to four ugly lines.
 *
 * We used to allow 160 / 2 000. Nothing enforced a house style, so the only
 * thing standing between a merchant and an unreadable page was their own
 * judgement about typography — which is precisely the thing this product exists
 * to not require of them.
 *
 * **A cap is only real if the counter can see it.** `describeSchema` reads these
 * back off the Zod check, so changing a number here changes the limit, the
 * counter and the validation together. Nothing restates them.
 *
 * Tightening a cap must never destroy stored copy: `normalizePage` truncates an
 * over-long value and reports the repair, rather than failing the field and
 * letting it fall back to a default. See `clampStrings` there.
 */
export const TITLE_MAX = 50;
export const SUBTITLE_MAX = 500;
/** The hero gets more room because it is the one line that carries the page. */
export const HERO_TITLE_MAX = 150;

/** A section's own title. */
export const titleSchema = z.string().max(TITLE_MAX);

/** Supporting copy under a title. */
export const subtitleSchema = z.string().max(SUBTITLE_MAX);

/** The hero's headline. */
export const heroTitleSchema = z.string().max(HERO_TITLE_MAX);
