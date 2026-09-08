import { z } from "zod";
import { assetRefSchema } from "../../bindings/types";
import { linkTargetSchema, subtitleSchema, titleSchema } from "../primitives";

/**
 * A row of repeated cards — "Corporate Events / Lunches / Meetings", the block
 * every catering and private-dining page is built around.
 *
 * The difference between this and `features` is the weight of each entry:
 * Features is a chip strip of amenities, one line each; Cards carries a photo,
 * a paragraph and its own call to action. A merchant reaches for Features to
 * say *what they have* and Cards to say *what they sell*.
 */
export const cardsSchema = z.object({
  title: titleSchema.optional(),
  subtitle: subtitleSchema.optional(),
  items: z
    .array(
      z.object({
        title: titleSchema,
        body: subtitleSchema.optional(),
        image: assetRefSchema.optional(),
        cta: z
          .object({ label: z.string().min(1).max(40), target: linkTargetSchema })
          .optional(),
      }),
    )
    // Nine is three full rows. Past that it is a menu, and there is a section
    // for those which keeps its prices up to date on its own.
    .max(9),
  columns: z.union([z.literal(2), z.literal(3)]),
});

export type CardsProps = z.infer<typeof cardsSchema>;

export function cardsDefaults(): CardsProps {
  return {
    title: "What we offer",
    items: [
      { title: "Catering", body: "Platters and trays for any size of gathering." },
      { title: "Private dining", body: "A room of your own, and a menu to match." },
      { title: "Events", body: "Tell us the occasion and we will plan around it." },
    ],
    columns: 3,
  };
}
