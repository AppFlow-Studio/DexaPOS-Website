import { z } from "zod";
import { bindingSchema } from "../../bindings/types";
import { linkTargetSchema, subtitleSchema } from "../primitives";

/**
 * Site footer. Locked to the colophon zone; not addable, not deletable.
 *
 * Binds to the location so address and hours stay live here too — the footer is
 * where a stale phone number does the most damage, because it is on every page.
 */
export const footerSchema = z.object({
  location: bindingSchema("location"),
  showAddress: z.boolean(),
  showHours: z.boolean(),
  showPhone: z.boolean(),
  showSocial: z.boolean(),
  tagline: subtitleSchema.optional(),
  copyrightText: z.string().max(200).optional(),
  links: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        target: linkTargetSchema,
      }),
    )
    .max(12),
});

export type FooterProps = z.infer<typeof footerSchema>;

export function footerDefaults(locationId = ""): FooterProps {
  return {
    location: { type: "location", id: locationId },
    showAddress: true,
    showHours: true,
    showPhone: true,
    showSocial: true,
    links: [],
  };
}
