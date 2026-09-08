import { z } from "zod";
import { assetRefSchema } from "../../bindings/types";
import { linkTargetSchema, subtitleSchema, titleSchema } from "../primitives";

/**
 * The workhorse. Roughly half of every block on a finished restaurant site is
 * one of these, repeated with different copy and alternating image alignment.
 *
 * **Reshaped 2026-08-19 (decision W3), and this is the one breaking change in
 * the parity plan.** It used to be `heading` + a TipTap rich-text `body` +
 * `imagePosition`. Free-form markup in the block a merchant uses forty times is
 * how a site ends up with four different heading sizes and a paragraph in
 * italic 11px: the field invited typography decisions from someone hired to run
 * a restaurant. The replacement is Owner.com's field set, read off a live
 * account — two capped plain-text fields and three enums — so there is no
 * decision left to get wrong.
 *
 * What that buys, concretely: a 50-character title cannot wrap to four lines, a
 * subtitle cannot contain a `<h1>`, and the only merchant-authored markup left
 * on a built page is the FAQ answer. What it costs is real and was accepted:
 * **bold, links and lists inside a content block are gone.** Documents written
 * before this carry their HTML into `subtitle` as plain text — see the v1 → v2
 * migration in `../../migrations`.
 *
 * Background and media are **two independent slots**. Owner's own home page has
 * a block using both at once — a photographic background behind a foreground
 * dish shot — so they are modelled as two fields rather than one "image".
 */

/** None, a flat tone from the brand palette, or a photograph. */
export const CONTENT_BACKGROUNDS = ["none", "color", "photo"] as const;

/**
 * The foreground slot beside the copy.
 *
 * Owner offers `None · Photo · Video`. Video is deliberately absent here: there
 * is no video source in this repo yet, and an option that renders nothing is
 * the exact failure the registry's `unavailable` flag exists to prevent. Adding
 * a value to an enum needs no migration, so it costs nothing to wait for the
 * `video` section kind in Phase 4.
 */
export const CONTENT_MEDIA = ["none", "photo"] as const;

/** Which side the media sits on. Only meaningful when there is media. */
export const CONTENT_ALIGNMENTS = ["left", "right"] as const;

/**
 * The flat colour options.
 *
 * Deliberately the same three tones every other section already draws from,
 * rather than a colour picker: each one is derived from the merchant's single
 * brand colour and carries a foreground guaranteed to clear AA against it. A
 * merchant cannot produce unreadable text here because no control accepts one.
 */
export const CONTENT_BACKGROUND_TONES = ["muted", "brand", "dark"] as const;

export const contentSchema = z.object({
  background: z.enum(CONTENT_BACKGROUNDS),
  backgroundTone: z.enum(CONTENT_BACKGROUND_TONES).optional(),
  backgroundImage: assetRefSchema.optional(),
  media: z.enum(CONTENT_MEDIA),
  mediaImage: assetRefSchema.optional(),
  alignment: z.enum(CONTENT_ALIGNMENTS),
  title: titleSchema.optional(),
  subtitle: subtitleSchema.optional(),
  button: z
    .object({ label: z.string().min(1).max(40), target: linkTargetSchema })
    .optional(),
});

export type ContentProps = z.infer<typeof contentSchema>;

export function contentDefaults(): ContentProps {
  return {
    background: "none",
    media: "none",
    alignment: "left",
    title: "About us",
    subtitle: "Tell your story here.",
  };
}
