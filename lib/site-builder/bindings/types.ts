/**
 * Bindings — typed references to platform records that a section displays but
 * does not own.
 *
 * This is decision D6 ("snapshot the structure, resolve volatile fields live")
 * made structural. A section stores *which* records and *in what order*; the
 * resolver (PLAN-03) fetches name, price, image, and availability fresh on every
 * render. There is deliberately nowhere in a section's props to put a price, so
 * a published page can never show a stale one.
 *
 * Assets follow the same rule for the same reason: sections reference an asset
 * id, never a CDN URL, so re-uploading an image or moving CDNs updates every
 * page at once instead of stranding URLs across hundreds of JSONB documents.
 */

import { z } from "zod";

export const BINDING_TYPES = [
  "menu_item",
  "menu_category",
  "location",
  "hours",
] as const;

export type BindingType = (typeof BINDING_TYPES)[number];

export interface Binding<T extends BindingType = BindingType> {
  type: T;
  id: string;
  /**
   * The one legal way to shadow live data: merchant-authored copy attached to a
   * referenced record. Never a price, never a name — those stay live.
   */
  overrides?: {
    label?: string;
    caption?: string;
  };
}

export interface AssetRef {
  assetId: string;
  /**
   * Per-usage alt text, overriding `site_assets.alt_text`. The same photo can
   * legitimately need different alt text in different sections, which is the
   * correct accessibility model rather than a nicety.
   */
  alt?: string;
  /** Focal point for art-directed cropping, 0–1 in each axis. */
  focal?: { x: number; y: number };
}

const bindingOverridesSchema = z
  .object({
    label: z.string().max(120).optional(),
    caption: z.string().max(300).optional(),
  })
  .optional();

/** Builds a schema for a binding locked to one binding type. */
export function bindingSchema<T extends BindingType>(type: T) {
  return z.object({
    type: z.literal(type),
    id: z.string().min(1).max(64),
    overrides: bindingOverridesSchema,
  });
}

export const assetRefSchema = z.object({
  assetId: z.string().min(1).max(64),
  alt: z.string().max(300).optional(),
  focal: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
    .optional(),
});

export function isBindingType(value: unknown): value is BindingType {
  return (
    typeof value === "string" &&
    (BINDING_TYPES as readonly string[]).includes(value)
  );
}
