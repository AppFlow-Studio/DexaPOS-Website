import { z } from "zod";
import { assetRefSchema } from "../../bindings/types";
import { subtitleSchema, titleSchema } from "../primitives";

/**
 * A document a guest can open — the printed menu, a catering pack, a wine list.
 *
 * The one section whose *existence* is an admission: a restaurant's menu should
 * be menu data, where prices stay current and a guest can order from it. But
 * merchants have a designed PDF they paid for, and refusing to display it does
 * not make it go away — it makes them link to Dropbox from a Content block,
 * which is worse in every direction.
 *
 * `file` is an `AssetRef` like every other upload, so the same registry, the
 * same soft delete and the same tenancy apply.
 */
export const pdfSchema = z.object({
  title: titleSchema.optional(),
  subtitle: subtitleSchema.optional(),
  file: assetRefSchema.optional(),
  /** The link's own words. "Download our menu" reads better than a filename. */
  linkLabel: z.string().min(1).max(40),
});

export type PdfProps = z.infer<typeof pdfSchema>;

export function pdfDefaults(): PdfProps {
  return { title: "Our menu", linkLabel: "Open the menu" };
}
