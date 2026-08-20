/**
 * Events — first-class records, not page content.
 *
 * A restaurant's events are a *table*, and the Events page is a view over it.
 * That is why the `events` section has almost no controls: there is nothing to
 * author there, only a list to render. Modelling them as page content would
 * mean a merchant re-typing Friday's trivia night into every page that
 * mentions it.
 *
 * **Listings, not bookings.** No capacity, no price, no RSVP; ticketing is an
 * external link. That boundary is Owner's and it is the right one — selling
 * tickets is a payments product with refunds, waitlists and tax in it, and a
 * restaurant that needs one already has Eventbrite.
 *
 * **No RRULE.** Five options: never, daily, weekly, monthly, yearly. Restaurants
 * run weekly trivia and monthly brunches; "every 2nd Tuesday except in August"
 * is a calendar product, and supporting it would mean storing, editing and
 * rendering a recurrence grammar for a feature whose whole job is to say "we
 * have a thing on Friday".
 *
 * Pure and I/O-free. The occurrence maths below is the part most worth testing
 * without a database, because getting it wrong means an event silently
 * disappearing from a merchant's website.
 */

import { z } from "zod";

export const EVENT_REPEATS = ["none", "daily", "weekly", "monthly", "yearly"] as const;

export type EventRepeat = (typeof EVENT_REPEATS)[number];

export const REPEAT_LABELS: Record<EventRepeat, string> = {
  none: "Don't repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export const EVENT_NAME_MAX = 100;
export const EVENT_DESCRIPTION_MAX = 2000;

/**
 * Restaurant-shaped defaults.
 *
 * `11:00 PM → 2:00 AM`, because that is when a restaurant's events actually
 * happen. Small, and it saves two interactions on the common case — and it is
 * the detail in the Owner teardown that most clearly shows someone had a
 * restaurant in mind rather than a generic calendar.
 */
export const DEFAULT_START_TIME = "23:00";
export const DEFAULT_END_TIME = "02:00";

/** `HH:MM`, 24-hour. Stored this way; formatted for display at the edges. */
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** `YYYY-MM-DD`. A calendar date, deliberately not a timestamp — see below. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const eventInputSchema = z.object({
  name: z.string().trim().min(1).max(EVENT_NAME_MAX),
  description: z.string().trim().max(EVENT_DESCRIPTION_MAX).optional(),
  /**
   * Required, and the one field this product is opinionated about.
   *
   * An event with no photograph looks broken on a restaurant's website — a bare
   * line of text in a grid of images — so it is refused rather than allowed and
   * regretted. Owner validates this *on open*, before the merchant has touched
   * anything, which is aggressive but communicates the rule instead of
   * ambushing them at submit.
   */
  photoAssetId: z.string().min(1),
  /** Which restaurant it is at. Null on a brand-wide event. */
  locationId: z.string().uuid().nullable(),
  startDate: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  endTime: z.string().regex(TIME_RE),
  repeat: z.enum(EVENT_REPEATS),
  ticketUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((v) => /^https?:\/\/[^\s]+$/i.test(v), {
      message: "Enter a full web address starting with https://",
    })
    .optional(),
});

export type EventInput = z.infer<typeof eventInputSchema>;

/** A stored event, as every reader wants it. */
export interface SiteEvent extends EventInput {
  id: string;
  slug: string;
}

/**
 * Whether this event runs past midnight.
 *
 * The default is `11:00 PM → 2:00 AM`, so this is the *common* case, not an
 * edge one. An end time at or before the start means the event ends the
 * following day — there is no other sensible reading, and treating it as a
 * zero-length event would drop every late-night event off the site the moment
 * it started.
 */
export function isOvernight(event: Pick<SiteEvent, "startTime" | "endTime">): boolean {
  return event.endTime <= event.startTime;
}

/**
 * When a given occurrence finishes, as a `Date` in the viewer's own timezone.
 *
 * Dates and times are stored as calendar values (`2026-08-21`, `23:00`) rather
 * than as an instant, because a restaurant's event happens at 11pm *where the
 * restaurant is*, not at some UTC offset. Converting at storage time would move
 * an event by an hour when the clocks change — which is exactly when a
 * restaurant is most likely to be running one.
 */
export function occurrenceEnd(event: Pick<SiteEvent, "startTime" | "endTime">, day: Date): Date {
  const end = new Date(day);
  const [hours, minutes] = event.endTime.split(":").map(Number);
  end.setHours(hours, minutes, 0, 0);
  if (isOvernight(event)) end.setDate(end.getDate() + 1);
  return end;
}

/** Midnight-anchored copy, so date arithmetic never drifts on a DST boundary. */
function atMidnight(value: Date): Date {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function parseDate(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  // Rejects 2026-02-30, which `new Date` would happily roll into March.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function formatDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The next date this event runs on or after `now`, or `null` if it is over.
 *
 * The single most important function in this feature: it decides whether an
 * event appears on the merchant's website at all. Two rules that are easy to
 * get wrong and both matter:
 *
 *  1. **An event is "upcoming" until it *ends*, not until it starts.** A
 *     merchant's Friday trivia night must not vanish from their homepage at
 *     9:01pm while the room is still full. Occurrences are compared on their
 *     end, which is why `occurrenceEnd` handles the overnight case.
 *
 *  2. **Monthly and yearly repeats clamp rather than roll.** The 31st in a
 *     30-day month is the 30th, not the 1st of the next one — rolling would
 *     march an event's date forward a day every short month until it had
 *     wandered into the wrong week entirely.
 */
export function nextOccurrence(
  event: Pick<SiteEvent, "startDate" | "startTime" | "endTime" | "repeat">,
  now: Date = new Date(),
): Date | null {
  const start = parseDate(event.startDate);
  if (!start) return null;

  // The first occurrence is still the answer if it has not finished yet — which
  // includes an event happening right now.
  if (occurrenceEnd(event, start) > now) return start;
  if (event.repeat === "none") return null;

  const today = atMidnight(now);

  switch (event.repeat) {
    case "daily": {
      const candidate = new Date(today);
      // It may still be running from yesterday, so start one day back and let
      // the end-time comparison decide.
      candidate.setDate(candidate.getDate() - 1);
      return advanceBy(event, candidate, now, (date) => date.setDate(date.getDate() + 1));
    }

    case "weekly": {
      // Keep the original weekday by stepping in whole weeks from the start.
      const weeks = Math.floor((today.getTime() - start.getTime()) / (7 * 86_400_000));
      const candidate = new Date(start);
      candidate.setDate(candidate.getDate() + Math.max(0, weeks - 1) * 7);
      return advanceBy(event, candidate, now, (date) => date.setDate(date.getDate() + 7));
    }

    case "monthly":
      return advanceClamped(event, start, now, "month");

    case "yearly":
      return advanceClamped(event, start, now, "year");
  }
}

/** Steps a candidate forward until its occurrence has not yet ended. */
function advanceBy(
  event: Pick<SiteEvent, "startTime" | "endTime">,
  from: Date,
  now: Date,
  step: (date: Date) => void,
): Date | null {
  const candidate = new Date(from);

  // Bounded so a corrupt row can never spin: 400 steps covers a year of daily
  // occurrences, and every other cadence reaches the answer far sooner.
  for (let i = 0; i < 400; i++) {
    if (occurrenceEnd(event, candidate) > now) return candidate;
    step(candidate);
  }
  return null;
}

/**
 * Monthly and yearly stepping, clamped to the end of short months.
 *
 * An event on the 31st recurs on the 30th of a 30-day month and the 28th of
 * February, then returns to the 31st — because the *intended* day is kept and
 * only the rendered occurrence is clamped. Stepping the stored date instead
 * would permanently lose the original day.
 */
function advanceClamped(
  event: Pick<SiteEvent, "startDate" | "startTime" | "endTime">,
  start: Date,
  now: Date,
  unit: "month" | "year",
): Date | null {
  const intendedDay = start.getDate();

  for (let i = 1; i <= 400; i++) {
    const candidate = new Date(start);
    if (unit === "month") {
      // Day 1 first, so setMonth cannot roll a 31st into the following month.
      candidate.setDate(1);
      candidate.setMonth(start.getMonth() + i);
    } else {
      candidate.setDate(1);
      candidate.setFullYear(start.getFullYear() + i);
    }

    const daysInMonth = new Date(
      candidate.getFullYear(),
      candidate.getMonth() + 1,
      0,
    ).getDate();
    candidate.setDate(Math.min(intendedDay, daysInMonth));

    if (occurrenceEnd(event, candidate) > now) return candidate;
  }
  return null;
}

/** Upcoming events, soonest first. Events that are over are dropped entirely. */
export function upcomingEvents<T extends Pick<SiteEvent, "startDate" | "startTime" | "endTime" | "repeat">>(
  events: T[],
  now: Date = new Date(),
): { event: T; occursOn: Date }[] {
  return events
    .flatMap((event) => {
      const occursOn = nextOccurrence(event, now);
      return occursOn ? [{ event, occursOn }] : [];
    })
    .sort((a, b) => a.occursOn.getTime() - b.occursOn.getTime());
}

/**
 * A URL-safe slug for the detail page.
 *
 * Suffixed by the caller with a short id when it collides — an event named
 * "Trivia Night" every January should not fight the one from last year for the
 * same address.
 */
export function eventSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      // Strip accents so "Café Night" becomes "cafe-night" rather than losing
      // the word entirely.
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "event"
  );
}

/** `23:00` → `11:00 PM`. */
export function formatTime(value: string, locale = "en-US"): string {
  if (!TIME_RE.test(value)) return value;
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/** "Friday, 21 August · 11:00 PM – 2:00 AM". */
export function formatOccurrence(
  event: Pick<SiteEvent, "startTime" | "endTime">,
  occursOn: Date,
  locale = "en-US",
): string {
  const day = occursOn.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return `${day} · ${formatTime(event.startTime, locale)} – ${formatTime(event.endTime, locale)}`;
}
