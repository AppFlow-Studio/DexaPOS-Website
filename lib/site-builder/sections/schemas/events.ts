import { z } from "zod";

import { subtitleSchema, titleSchema } from "../primitives";

/**
 * Upcoming events, drawn from the merchant's events table.
 *
 * **Almost no controls, deliberately.** The content is the table, not this
 * section — so there is nothing to author here beyond the wording around the
 * list and how many to show. Owner's own Events block has zero controls at all;
 * ours has a heading because it can be placed on any page, where "Upcoming
 * events" is not necessarily the right label.
 *
 * No location filter. A merchant with three branches wants their events page to
 * show all three, and a per-section filter would be a setting almost nobody
 * changes sitting on every placement — the event's own location is displayed on
 * each card instead.
 */
export const eventsSchema = z.object({
  title: titleSchema.optional(),
  subtitle: subtitleSchema.optional(),
  /** How many to show. The rest live on the events page. */
  limit: z.number().int().min(1).max(24),
});

export type EventsProps = z.infer<typeof eventsSchema>;

export function eventsDefaults(): EventsProps {
  return { title: "Upcoming events", limit: 6 };
}
