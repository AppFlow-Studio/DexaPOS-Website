import { z } from "zod";
import { titleSchema } from "../primitives";

/**
 * A marquee strip of short messages.
 *
 * Also the reason we are not building Announcements. Owner shipped a site-wide
 * announcement system, ran it, and is now retiring it — creation removed, not
 * merely disabled. This is the part of it that earned its keep: a merchant who
 * wants "Now delivering to Brooklyn" across their page can place one here,
 * style it with the rest of the site, and delete it when it stops being true,
 * without a separate screen, a scheduling model, or a cross-cutting banner that
 * fights the per-page publish flow.
 */
export const scrollingBannerSchema = z.object({
  /**
   * Objects rather than bare strings, and the reason is the editor: the drawer
   * generates its controls from the schema, and an array of plain strings has
   * no control to generate — it would classify as `unsupported` and render
   * nothing a merchant could type into. A repeater of `{ text }` reuses the
   * machinery `features` and `faq` already use.
   */
  items: z.array(z.object({ text: titleSchema })).min(1).max(8),
  speed: z.enum(["slow", "normal", "fast"]),
  tone: z.enum(["brand", "dark", "muted"]),
});

export type ScrollingBannerProps = z.infer<typeof scrollingBannerSchema>;

export function scrollingBannerDefaults(): ScrollingBannerProps {
  return {
    items: [
      { text: "Open seven days" },
      { text: "Free delivery over $30" },
      { text: "Book your table online" },
    ],
    speed: "normal",
    tone: "brand",
  };
}
