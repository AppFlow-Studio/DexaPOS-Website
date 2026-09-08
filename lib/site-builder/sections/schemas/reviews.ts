import { z } from "zod";
import { subtitleSchema, titleSchema } from "../primitives";

export const REVIEW_LAYOUTS = ["grid", "list", "carousel"] as const;
export type ReviewLayout = (typeof REVIEW_LAYOUTS)[number];

/**
 * Guest reviews, typed in by the merchant.
 *
 * **This kind was cut from v1 for want of a data source, and the Owner teardown
 * is what brought it back.** We assumed reviews meant a live Google or Yelp
 * feed — an integration, a rate limit, a terms-of-service question, and a
 * quarter of work. Owner's is a repeater of a quote and a name: the merchant
 * copies over the three reviews they are proudest of and they sit there. That
 * removes the blocker entirely and it is honest, because a curated wall of
 * praise is what every restaurant website has always had.
 *
 * `requiresFeature: "reviews"` on the registry entry gates availability at the
 * brand level, per the two-layer model — settings decide *whether*, the page
 * editor decides *where and what it says*.
 */
export const reviewsSchema = z.object({
  title: titleSchema.optional(),
  subtitle: subtitleSchema.optional(),
  layout: z.enum(REVIEW_LAYOUTS).default("grid"),
  items: z
    .array(
      z.object({
        /** The review itself. Longer than a subtitle because people ramble. */
        quote: z.string().max(600),
        /** How the guest is credited — "Zahara Z." rather than a full name. */
        author: z.string().max(80),
        /** Whole stars. Optional, because not every quote comes with one. */
        rating: z.number().int().min(1).max(5).optional(),
      }),
    )
    .max(12),
});

export type ReviewsProps = z.infer<typeof reviewsSchema>;

export function reviewsDefaults(): ReviewsProps {
  return {
    title: "What our guests are saying",
    layout: "grid",
    items: [],
  };
}
