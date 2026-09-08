import { z } from "zod";

import { subtitleSchema, titleSchema } from "../primitives";

/**
 * Events, drawn from the merchant's events table.
 *
 * **The content is the table, not this section.** There is nothing to author
 * here — no event name, no date, no photograph. An event added today shows up
 * on every page carrying this section without republishing any of them, and
 * editing one updates every placement at once. That is the whole reason events
 * are first-class records rather than page content, and none of the controls
 * below change it: every one of them is about *presentation*.
 *
 * Two layouts, because a restaurant wants two different things from the same
 * table:
 *
 *   grid      — everything upcoming, as cards. The "what's on" listing.
 *   spotlight — one event, large. The homepage banner for the New Year's party.
 *
 * These began as two separate section kinds. Merging them was the right call:
 * a merchant thinking "I want to put my events on this page" should not first
 * have to know which of two similarly-named sections they need, and the choice
 * between them is a layout decision, which is exactly what a layout control is
 * for.
 *
 * No location filter. A merchant with three branches wants their events page to
 * show all three, and a per-section filter would be a setting almost nobody
 * changes sitting on every placement — the event's own location is displayed on
 * each card instead.
 */
export const eventsSchema = z.object({
  title: titleSchema.optional(),
  subtitle: subtitleSchema.optional(),
  /** Which of the two shapes. Everything below is one or the other. */
  layout: z.enum(["grid", "spotlight"]),

  // ── grid ──────────────────────────────────────────────────────────────────
  /** How many to show. The rest live on the events page. */
  limit: z.number().int().min(1).max(24),

  // ── spotlight ─────────────────────────────────────────────────────────────
  /**
   * Which event, or absent for "whichever is next".
   *
   * Absent is the default and the better answer for most placements: a section
   * on the homepage stays correct forever as Friday's trivia rolls over, with
   * nobody editing the page. Pinning is for the case where a specific event is
   * the entire point — the New Year's party you are advertising for six weeks.
   *
   * A pinned event that has ended hides the section rather than quietly
   * promoting a different one into the slot. See `EventsSection`.
   */
  eventId: z.string().max(64).optional(),
  /** Where the photograph sits relative to the copy. */
  photoPosition: z.enum(["left", "right", "behind"]),
  /** Irrelevant behind the text, where the photo is the whole band. */
  photoSize: z.enum(["small", "medium", "large"]),
  textSize: z.enum(["small", "medium", "large"]),
  /**
   * Scrim strength for `behind`, as a percentage. Capped below 100 because a
   * fully opaque overlay is indistinguishable from having chosen no photograph,
   * and a merchant who drags a slider to the end deserves to still see it.
   */
  overlayOpacity: z.number().int().min(0).max(90),

  // ── both ──────────────────────────────────────────────────────────────────
  showDescription: z.boolean(),
});

export type EventsProps = z.infer<typeof eventsSchema>;

export function eventsDefaults(): EventsProps {
  return {
    title: "Upcoming events",
    layout: "grid",
    limit: 6,
    photoPosition: "left",
    photoSize: "medium",
    textSize: "medium",
    overlayOpacity: 45,
    showDescription: true,
  };
}
