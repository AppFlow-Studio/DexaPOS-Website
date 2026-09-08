import { z } from "zod";
import { bindingSchema } from "../../bindings/types";
import { titleSchema, linkTargetSchema, subtitleSchema } from "../primitives";

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
  heading: titleSchema.optional(),
  subheading: subtitleSchema.optional(),
  items: z.array(bindingSchema("menu_item")).max(24),
  layout: z.enum(["grid-2", "grid-3", "grid-4", "carousel"]),
  showPrices: z.boolean(),
  showDescriptions: z.boolean(),
  /**
   * Renders a `+` on each card that deep-links into the ordering storefront
   * with that item's modal open.
   *
   * A toggle rather than always-on, for the same reason `showPrices` is one: a
   * brand page speaks for every branch at once, so it already withholds prices
   * when no single number is honest (`canShowPrices`). A page in that state
   * should be able to withhold the order affordance too, rather than inviting a
   * visitor to order from a restaurant they have not chosen yet.
   *
   * `.default(true)` rather than a bare boolean so documents written before
   * today parse cleanly instead of taking `normalizePage`'s repair path and
   * logging an `invalid_props` on every render. New sections get it on.
   */
  showAddButton: z.boolean().default(true),
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
    showAddButton: true,
    cta: { label: "See full menu", target: { kind: "menu" } },
  };
}
