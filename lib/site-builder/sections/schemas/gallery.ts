import { z } from "zod";
import { assetRefSchema } from "../../bindings/types";
import { headingSchema, proseSchema } from "../primitives";

/**
 * Photo gallery. Images are `AssetRef`s, never URLs — see bindings/types.ts.
 *
 * The 24-image cap is a page-weight guard, not an arbitrary limit: the mock
 * shipped 3 MB PNGs and merchants upload straight off a phone, so an unbounded
 * gallery is the fastest way to fail Core Web Vitals on a page whose entire
 * purpose is ranking.
 */
export const gallerySchema = z.object({
  heading: headingSchema.optional(),
  subheading: proseSchema.optional(),
  images: z.array(assetRefSchema).max(24),
  layout: z.enum(["grid", "masonry", "carousel"]),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
});

export type GalleryProps = z.infer<typeof gallerySchema>;

export function galleryDefaults(): GalleryProps {
  return {
    heading: "Gallery",
    images: [],
    layout: "grid",
    columns: 3,
  };
}
