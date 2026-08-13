import { z } from "zod";
import { assetRefSchema } from "../../bindings/types";
import { headingSchema, linkTargetSchema, richTextSchema } from "../primitives";

/**
 * Free-form copy block — the "Our Story" section the gap analysis opens with,
 * and the reason this feature exists at all.
 *
 * `body` is rich-text HTML produced by TipTap. It is the only merchant-authored
 * markup in v1 and must pass through `sanitizeHtml` (lib/cms/sanitize.ts) on
 * write *and* on render. There is deliberately no `custom_html` kind.
 */
export const contentSchema = z.object({
  heading: headingSchema.optional(),
  body: richTextSchema,
  image: assetRefSchema.optional(),
  imagePosition: z.enum(["none", "left", "right", "above"]),
  cta: z
    .object({ label: z.string().min(1).max(40), target: linkTargetSchema })
    .optional(),
});

export type ContentProps = z.infer<typeof contentSchema>;

export function contentDefaults(): ContentProps {
  return {
    heading: "About us",
    body: "<p>Tell your story here.</p>",
    imagePosition: "none",
  };
}
