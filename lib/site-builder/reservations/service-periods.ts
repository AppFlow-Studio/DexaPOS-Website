/**
 * Service-period shapes, defaults and validation.
 *
 * **A plain module, not part of the server actions, and that is a hard
 * requirement rather than tidiness.** A `"use server"` file may only export
 * async functions; a synchronous `validatePeriod` or a plain
 * `DEFAULT_SERVICE_PERIOD` const exported from one is a build error. These are
 * also needed in the browser — the editor validates a draft before it round
 * trips — so they belong on neither side of that boundary.
 *
 * The validation here restates the CHECK constraints on
 * `reservation_service_periods` in a restaurant owner's words. The constraints
 * remain the real guarantee: they are the only thing a direct SQL write passes
 * through. This exists so a merchant sees a sentence rather than
 * `violates check constraint "reservation_service_periods_window"`.
 */

import type { BlackoutInput } from "./blackouts";

export interface ServicePeriodInput {
  id?: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday, matching Postgres `EXTRACT(DOW)`. */
  daysOfWeek: number[];
  /** `HH:MM`. */
  startTime: string;
  /** `HH:MM`. The LAST seating, not closing time. */
  endTime: string;
  slotIntervalMin: number;
  turnTimeMin: number;
  minPartySize: number;
  maxPartySize: number;
  leadTimeMin: number;
  maxAdvanceDays: number;
  /** `null` means capacity comes from the floor plan. */
  maxCoversPerSlot: number | null;
  isActive: boolean;
}

export interface LocationReservationConfig {
  locationId: string;
  locationName: string;
  acceptsReservations: boolean;
  bookingPolicy: string | null;
  notifyEmails: string[];
  collectBirthday: boolean;
  occasionTags: string[];
  dietaryTags: string[];
  cancellationCutoffMin: number;
  largePartyPhone: string | null;
  periods: ServicePeriodInput[];
  /**
   * Days and windows this branch does not seat, past ones included.
   *
   * Carried on the same config object as the periods because they are read
   * together and edited on the same screen — a merchant closing New Year's Eve
   * is looking at their dinner service while they do it.
   */
  blackouts: BlackoutInput[];
  /**
   * How many reservable tables this location has.
   *
   * Surfaced because it decides whether the location can take bookings at all:
   * with no tables the availability engine falls back to a covers-per-slot cap,
   * and with neither it can only ever offer an empty grid.
   */
  reservableTables: number;
  /** Everything the location still needs before a guest could book. */
  blockers: string[];
}

/**
 * What a merchant gets if they save nothing.
 *
 * Deliberately a complete, working service rather than an empty form. Switching
 * a location on and being handed an empty list is how a merchant ends up with a
 * published booking page that offers no times — and how a feature gets
 * abandoned halfway through being configured.
 */
export const DEFAULT_SERVICE_PERIOD: Omit<ServicePeriodInput, "id"> = {
  name: "Dinner",
  // Every day but Monday: the closed day most restaurants actually take.
  daysOfWeek: [0, 2, 3, 4, 5, 6],
  startTime: "17:00",
  endTime: "22:00",
  slotIntervalMin: 15,
  turnTimeMin: 90,
  minPartySize: 1,
  maxPartySize: 8,
  leadTimeMin: 60,
  maxAdvanceDays: 60,
  maxCoversPerSlot: null,
  isActive: true,
};

/** What a merchant adding a second service starts from. */
export const BLANK_SERVICE_PERIOD: ServicePeriodInput = {
  name: "Lunch",
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: "12:00",
  endTime: "14:30",
  slotIntervalMin: 15,
  turnTimeMin: 90,
  minPartySize: 1,
  maxPartySize: 8,
  leadTimeMin: 60,
  maxAdvanceDays: 60,
  maxCoversPerSlot: null,
  isActive: true,
};

/** The intervals a grid can actually be laid out on. */
export const SLOT_INTERVALS = [5, 10, 15, 20, 30, 60] as const;

/** Returns a merchant-facing message, or null when the period is valid. */
export function validatePeriod(input: ServicePeriodInput): string | null {
  if (input.daysOfWeek.length === 0) {
    return "Choose at least one day. A service that runs on no days shows guests an empty page.";
  }
  if (input.startTime >= input.endTime) {
    return "The last seating has to be after the first one.";
  }
  if (!(SLOT_INTERVALS as readonly number[]).includes(input.slotIntervalMin)) {
    return "Times can be 5, 10, 15, 20, 30 or 60 minutes apart.";
  }
  if (input.turnTimeMin < 15 || input.turnTimeMin > 480) {
    return "How long a table is held has to be between 15 minutes and 8 hours.";
  }
  if (input.minPartySize < 1 || input.maxPartySize < input.minPartySize) {
    return "The largest party has to be at least as big as the smallest.";
  }
  if (input.maxAdvanceDays < 1 || input.maxAdvanceDays > 365) {
    return "Guests can book between 1 and 365 days ahead.";
  }
  if (input.maxCoversPerSlot !== null && input.maxCoversPerSlot < 1) {
    return "Guests per time slot has to be at least 1, or left blank to use your floor plan.";
  }
  return null;
}

/**
 * Why this location could not take a booking today.
 *
 * Computed and shown rather than left for the merchant to discover from an
 * empty grid on their live site. Every one of these produces a page that looks
 * broken while being, technically, configured exactly as asked.
 */
export function describeBlockers(
  periods: ServicePeriodInput[],
  reservableTables: number,
): string[] {
  const blockers: string[] = [];
  const active = periods.filter((p) => p.isActive);

  if (active.length === 0) {
    blockers.push("No service times yet — guests would see an empty page.");
  }

  // The no-floor-plan fallback: with no tables, availability can only come from
  // a covers-per-slot cap. With neither, every slot fails the fit test.
  if (reservableTables === 0 && active.every((p) => p.maxCoversPerSlot === null)) {
    blockers.push(
      "No tables on your floor plan, and no limit on guests per time. Set “Guests per time slot” or build a floor plan.",
    );
  }

  return blockers;
}
