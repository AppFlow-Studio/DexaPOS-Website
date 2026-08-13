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

export interface SectionStyle {
  background?: (typeof BACKGROUND_TONES)[number];
  spacing?: (typeof SPACING_SCALES)[number];
  align?: (typeof ALIGNMENTS)[number];
  /** Responsive visibility. Modelled now; the builder UI for it can ship later. */
  hideOn?: (typeof BREAKPOINTS)[number][];
}

export const sectionStyleSchema = z.object({
  background: z.enum(BACKGROUND_TONES).optional(),
  spacing: z.enum(SPACING_SCALES).optional(),
  align: z.enum(ALIGNMENTS).optional(),
  hideOn: z.array(z.enum(BREAKPOINTS)).max(3).optional(),
});

/** Rich-text HTML. Sanitized on write and on render — never trusted. */
export const richTextSchema = z.string().max(20_000);

/** Short plain-text heading. */
export const headingSchema = z.string().max(160);

/** Longer plain-text supporting copy. */
export const proseSchema = z.string().max(2_000);
