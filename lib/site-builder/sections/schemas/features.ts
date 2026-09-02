import { z } from "zod";
import { titleSchema, subtitleSchema } from "../primitives";

/**
 * Short value propositions — "Free delivery over $30", "Open late", "Family
 * owned since 1998".
 *
 * Items are literals, not bindings: nothing here mirrors a platform record, so
 * there is nothing to resolve live. `icon` is a lucide icon name resolved by the
 * renderer against an allowlist, so an unknown name degrades to no icon rather
 * than a crash.
 */
export const featuresSchema = z.object({
  heading: titleSchema.optional(),
  subheading: subtitleSchema.optional(),
  items: z
    .array(
      z.object({
        icon: z.string().max(40).optional(),
        title: z.string().max(80),
        description: z.string().max(300).optional(),
      }),
    )
    .max(12),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
});

export type FeaturesProps = z.infer<typeof featuresSchema>;

export function featuresDefaults(): FeaturesProps {
  return {
    items: [],
    columns: 3,
  };
}
