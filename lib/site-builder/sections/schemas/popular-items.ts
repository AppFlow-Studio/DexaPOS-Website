import { z } from "zod";
import { bindingSchema } from "../../bindings/types";
import { headingSchema, linkTargetSchema, proseSchema } from "../primitives";

/**
 * A curated row of menu items — "Guest Favorites".
 *
 * This is the section that proves decision D6, so read the props carefully:
 * there is no `price`, no `name`, no `description`, no `imageUrl`, and no
 * `available`. There is nowhere to put them. The merchant picks *which* items
 * and *what order*; every displayed value is resolved live from `menu_items`
 * at render, honouring the 5-level price cascade and the 86/snooze state.
 *
 * That makes a stale price on a published page structurally impossible rather
 * than a rule someone has to remember.
 */
export const popularItemsSchema = z.object({
  heading: headingSchema.optional(),
  subheading: proseSchema.optional(),
  items: z.array(bindingSchema("menu_item")).max(24),
  layout: z.enum(["grid-2", "grid-3", "grid-4", "carousel"]),
  showPrices: z.boolean(),
  showDescriptions: z.boolean(),
  cta: z
    .object({ label: z.string().min(1).max(40), target: linkTargetSchema })
    .optional(),
});

export type PopularItemsProps = z.infer<typeof popularItemsSchema>;

export function popularItemsDefaults(): PopularItemsProps {
  return {
    heading: "Guest Favorites",
    items: [],
    layout: "grid-3",
    showPrices: true,
    showDescriptions: true,
    cta: { label: "See full menu", target: { kind: "menu" } },
  };
}
