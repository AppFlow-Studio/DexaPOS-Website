import { z } from "zod";
import { hexColorSchema, TEXT_TONES, titleSchema } from "../primitives";
import { FEATURE_ICON_NAMES } from "../feature-icon";

/**
 * Short selling points — "Catering", "Gluten-Free Options", "Easy Parking".
 *
 * An amenity strip, not a feature grid: an icon over a short label, centred and
 * wrapping. Owner's equivalent is one title, then a reorderable list of items
 * that each open a small editor of title, description and icon.
 *
 * Items are literals, not bindings: nothing here mirrors a platform record, so
 * there is nothing to resolve live.
 *
 * There is no `columns` field. The strip centres and wraps on its own, which is
 * why five items sit three-then-two rather than needing a layout decision from
 * the merchant — the one kind of decision this product does not delegate.
 */
export const featuresSchema = z.object({
  heading: titleSchema.optional(),
  items: z
    .array(
      z.object({
        title: z.string().max(50),
        description: z.string().max(300).optional(),
        icon: z.enum(FEATURE_ICON_NAMES),
      }),
    )
    .max(12),
  /**
   * The icon colour, as the same four tones section text already offers, so a
   * merchant meets one colour vocabulary rather than two. `brand` is the
   * default because it is what these icons have always rendered as.
   *
   * `custom` carries a hex in `iconColor`; the renderer resolves both against
   * the band the section sits on, exactly as `textToneColor` does for copy.
   */
  iconTone: z.enum(TEXT_TONES).optional(),
  iconColor: hexColorSchema.optional(),
});

export type FeaturesProps = z.infer<typeof featuresSchema>;

export function featuresDefaults(): FeaturesProps {
  return {
    items: [],
    iconTone: "brand",
  };
}
