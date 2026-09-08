import { z } from "zod";

import { subtitleSchema, titleSchema } from "../primitives";

/**
 * The booking widget: pick a party size, a date and a time, then fill in four
 * fields.
 *
 * **These props are presentation only, and that is the whole design.** Service
 * hours, slot intervals, turn times, lead time, blackout dates, party limits
 * and the cancellation policy all live on `reservation_service_periods` and
 * `reservation_settings`, keyed by location — never in page JSON.
 *
 * The reason is versioning. A page's content is snapshotted on publish, so
 * storing opening hours here would mean a merchant who shortens Tuesday dinner
 * has to republish every page carrying the widget before the change reaches
 * guests — and any page they forgot would keep selling tables they no longer
 * have. Configuration that describes the *restaurant* has to be read live; only
 * configuration that describes this *placement* belongs in the section.
 *
 * Same reasoning as the `form` section storing only a `formId`.
 */
export const reservationsSchema = z.object({
  title: titleSchema.optional(),
  subtitle: subtitleSchema.optional(),

  /**
   * Which restaurant this widget books for.
   *
   * Empty means "ask the guest", which is the correct default: the section is
   * usually dropped on a brand page that speaks for the whole business, and the
   * widget's first step is a location picker — skipped automatically when only
   * one location is bookable, which is the common case.
   *
   * Set it to pin the widget to one branch, for a merchant who wants a page per
   * restaurant. Validated against real bookable locations at render time rather
   * than here: a location that has since closed, or stopped taking bookings,
   * must degrade to the picker rather than to a widget that books nothing.
   */
  locationId: z.string().max(64).optional(),

  /**
   * Show the address, phone and opening hours beneath the grid.
   *
   * On by default because a dedicated reservations page with nothing but a grid
   * on it reads as broken, and because a guest deciding *whether* to book wants
   * to know where they would be going.
   */
  showDetails: z.boolean(),

  /**
   * Offer the next few dates when the chosen one is full.
   *
   * Owner and SevenRooms both do this, and it is the difference between "we are
   * full" and "here is when we are not". Off only for a merchant who genuinely
   * wants a single-date widget.
   */
  showOtherDates: z.boolean(),
});

export type ReservationsSectionProps = z.infer<typeof reservationsSchema>;

export function reservationsDefaults(): ReservationsSectionProps {
  return {
    title: "Book a table",
    showDetails: true,
    showOtherDates: true,
  };
}
