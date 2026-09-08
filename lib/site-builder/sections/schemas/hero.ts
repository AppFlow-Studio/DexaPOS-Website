import { z } from "zod";
import { assetRefSchema } from "../../bindings/types";
import { heroTitleSchema, linkTargetSchema, subtitleSchema } from "../primitives";

/**
 * Above-the-fold hero. Locked to the masthead zone; not addable, not deletable.
 *
 * The three variants mirror the sub-templates the MockBuilder spec settled on
 * across its QA passes (classic / bistro / spotlight).
 */
export const heroSchema = z.object({
  variant: z.enum(["classic", "bistro", "spotlight"]),
  heading: heroTitleSchema,
  subheading: subtitleSchema.optional(),
  image: assetRefSchema.optional(),
  /**
   * Extra photographs, shown as a carousel beneath or behind the headline.
   *
   * **Five, because Owner ships five** — their upload tile is literally labelled
   * `Upload a photo 3/5`. It is enough for a restaurant to show a room, a
   * plate, a drink and two dishes, and few enough that the merchant picks their
   * best rather than uploading a camera roll. `image` remains the first frame
   * and the Largest Contentful Paint; these are the ones after it.
   */
  carousel: z.array(assetRefSchema).max(5).optional(),
  /** Darkening applied over the image so overlaid text stays legible, 0–100. */
  overlayOpacity: z.number().int().min(0).max(100).optional(),
  primaryCta: z
    .object({ label: z.string().min(1).max(40), target: linkTargetSchema })
    .optional(),
  secondaryCta: z
    .object({ label: z.string().min(1).max(40), target: linkTargetSchema })
    .optional(),
});

export type HeroProps = z.infer<typeof heroSchema>;

export function heroDefaults(): HeroProps {
  return {
    variant: "classic",
    heading: "Welcome",
    overlayOpacity: 35,
    primaryCta: { label: "Order Now", target: { kind: "order" } },
  };
}
