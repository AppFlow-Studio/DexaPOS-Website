import type { BadgeStyle } from "./reservation-status";

/**
 * How a reservation got here.
 *
 * `reservations.source` is free text — the POS, the dashboard and now the
 * public website all write it — so this reads defensively rather than switching
 * on an enum that does not exist.
 *
 * **Only one source earns a badge.** A tag on every row would be decoration:
 * staff already know they typed the booking in front of them. A booking that
 * arrived from the website while nobody was watching is the one fact worth
 * surfacing — it is the merchant's evidence that the feature is working, and
 * the row whose guest they have never spoken to. Everything else keeps the
 * quiet footer label the card already carried.
 */

/** Written by `create_public_reservation`. The one value with a badge. */
export const WEBSITE_SOURCE = "website";

export const RESERVATION_SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  online: "Online",
  phone: "Phone",
  walk_in: "Walk-in",
  pos: "POS",
  dashboard: "Dashboard",
  staff: "Staff",
};

/**
 * A readable name for any source, including ones this file has never heard of.
 *
 * `walk_in` → `Walk in` rather than throwing or rendering the raw token: a new
 * writer added elsewhere in the product should degrade to something a human can
 * read, not to a blank cell.
 */
export function reservationSourceLabel(source: string | null | undefined): string {
  const key = (source ?? "").trim().toLowerCase();
  if (!key) return "Dashboard";
  return RESERVATION_SOURCE_LABELS[key] ?? key.replaceAll("_", " ");
}

export function isWebsiteReservation(source: string | null | undefined): boolean {
  return (source ?? "").trim().toLowerCase() === WEBSITE_SOURCE;
}

/**
 * The website badge's colours.
 *
 * Deliberately NOT any colour in `RESERVATION_STATUS_STYLES`: source and status
 * are different axes, and a website booking sitting beside a "Confirmed" pill in
 * the same blue would read as a second status. Teal is unused by both scales.
 */
export const WEBSITE_SOURCE_STYLE: BadgeStyle = {
  dot: "bg-teal-500",
  text: "text-teal-700 dark:text-teal-400",
  bg: "bg-teal-50 dark:bg-teal-900/20",
};
