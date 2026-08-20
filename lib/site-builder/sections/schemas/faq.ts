import { z } from "zod";
import { titleSchema, subtitleSchema, richTextSchema } from "../primitives";

/**
 * Frequently asked questions.
 *
 * Renders as a server component with a small client accordion island — the same
 * split the marketing CMS already uses for `<FaqAccordion>`. Also the natural
 * source for `FAQPage` structured data later.
 */
export const faqSchema = z.object({
  heading: titleSchema.optional(),
  subheading: subtitleSchema.optional(),
  items: z
    .array(
      z.object({
        question: z.string().min(1).max(300),
        answer: richTextSchema,
      }),
    )
    .max(30),
  /** Whether the first item starts expanded. */
  defaultOpenFirst: z.boolean(),
});

export type FaqProps = z.infer<typeof faqSchema>;

export function faqDefaults(): FaqProps {
  return {
    heading: "Frequently asked questions",
    items: [],
    defaultOpenFirst: true,
  };
}
