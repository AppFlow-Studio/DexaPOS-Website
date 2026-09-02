import { z } from "zod";

import { subtitleSchema, titleSchema } from "../primitives";

/**
 * Embeds one of the merchant's forms.
 *
 * Stores **only a form id**. The definition lives on `site_forms` and is
 * resolved at render time, which is what makes a form a reusable object rather
 * than page content: one form can sit on four pages, and editing it updates all
 * four without republishing any of them. Snapshotting the definition into the
 * section would give a merchant four diverging copies of their contact form and
 * four separate piles of leads.
 *
 * The optional title and subtitle belong to the *placement*, not the form —
 * the same enquiry form can be "Book your party" on one page and "Get in touch"
 * on another. When empty, the form's own title is used.
 */
export const formSchema = z.object({
  /** Empty until the merchant picks one; the section renders a prompt instead. */
  formId: z.string().max(64),
  title: titleSchema.optional(),
  subtitle: subtitleSchema.optional(),
});

export type FormSectionProps = z.infer<typeof formSchema>;

export function formDefaults(): FormSectionProps {
  return { formId: "" };
}
