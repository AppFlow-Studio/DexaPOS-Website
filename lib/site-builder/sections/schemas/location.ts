import { z } from "zod";
import { bindingSchema } from "../../bindings/types";
import { titleSchema, subtitleSchema } from "../primitives";

/**
 * Address, hours, map and directions.
 *
 * `location` is a binding, so address / phone / coordinates / hours resolve
 * live and propagate to the published site **immediately, without a republish**
 * — the D6 residual question, answered. An address is a fact about the
 * business, not page content; merchants do not think of their phone number as
 * something they need to re-publish, and a stale address on a live site is
 * worse than an unexpected update.
 */
export const locationSchema = z.object({
  heading: titleSchema.optional(),
  subheading: subtitleSchema.optional(),
  location: bindingSchema("location"),
  showMap: z.boolean(),
  showHours: z.boolean(),
  showPhone: z.boolean(),
  showDirectionsLink: z.boolean(),
  mapStyle: z.enum(["roadmap", "light", "dark"]),
});

export type LocationProps = z.infer<typeof locationSchema>;

/**
 * Requires the site's own location id — there is no sensible generic default,
 * so `createSection` callers pass it in. `normalize` will not invent one.
 *
 * The `""` fallback is what a context-free `defaults()` gets, which is the case
 * when `normalize` repairs a section it cannot salvage a binding from. That is
 * *safe* rather than merely unavoidable: `bindingSchema` admits an empty id, so
 * the repaired section still satisfies its own schema and stays editable, and
 * the publish gate is what tells the merchant it is not linked yet. Making this
 * value schema-invalid instead is what caused §C4.
 */
export function locationDefaults(locationId = ""): LocationProps {
  return {
    heading: "Find us",
    location: { type: "location", id: locationId },
    showMap: true,
    showHours: true,
    showPhone: true,
    showDirectionsLink: true,
    mapStyle: "roadmap",
  };
}
