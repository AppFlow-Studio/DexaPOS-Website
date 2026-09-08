import { describe, expect, it } from "vitest";

import {
  DEFAULT_SERVICE_PERIOD,
  validatePeriod,
  type ServicePeriodInput,
} from "@/lib/site-builder/reservations/service-periods";

/**
 * Service-period validation, in the merchant's words.
 *
 * These rules are also CHECK constraints on `reservation_service_periods`, and
 * the constraints are the real guarantee — they must stay, because they are the
 * only thing a direct SQL write goes through. This layer exists so a restaurant
 * owner gets a sentence instead of
 * `violates check constraint "reservation_service_periods_window"`.
 *
 * The pair has to agree, so every case here names the constraint it mirrors.
 */

const period = (over: Partial<ServicePeriodInput> = {}): ServicePeriodInput => ({
  ...DEFAULT_SERVICE_PERIOD,
  ...over,
});

describe("the defaults a merchant gets without configuring anything", () => {
  /**
   * The point of seeding rather than presenting an empty list: switching a
   * location on and being handed nothing is how a merchant ends up with a
   * published booking page that offers no times.
   */
  it("is a complete, valid, bookable service", () => {
    expect(validatePeriod(period())).toBeNull();
    expect(DEFAULT_SERVICE_PERIOD.daysOfWeek.length).toBeGreaterThan(0);
    expect(DEFAULT_SERVICE_PERIOD.startTime < DEFAULT_SERVICE_PERIOD.endTime).toBe(true);
  });

  it("leaves the covers cap unset, so capacity comes from the floor plan", () => {
    expect(DEFAULT_SERVICE_PERIOD.maxCoversPerSlot).toBeNull();
  });

  /** Monday is the day most restaurants actually close. */
  it("runs every day except Monday", () => {
    expect(DEFAULT_SERVICE_PERIOD.daysOfWeek).not.toContain(1);
    expect(DEFAULT_SERVICE_PERIOD.daysOfWeek).toHaveLength(6);
  });
});

describe("validatePeriod", () => {
  /** Mirrors `reservation_service_periods_days`, the cardinality() check. */
  it("refuses a service that runs on no days", () => {
    expect(validatePeriod(period({ daysOfWeek: [] }))).toMatch(/at least one day/i);
  });

  /** Mirrors `reservation_service_periods_window`. */
  it("refuses a last seating before the first", () => {
    expect(validatePeriod(period({ startTime: "22:00", endTime: "17:00" }))).toMatch(/after/i);
    expect(validatePeriod(period({ startTime: "17:00", endTime: "17:00" }))).toMatch(/after/i);
  });

  /** Mirrors `reservation_service_periods_interval`. */
  it("refuses an interval that produces times nobody reads as a time", () => {
    expect(validatePeriod(period({ slotIntervalMin: 7 }))).toMatch(/5, 10, 15/);
    for (const ok of [5, 10, 15, 20, 30, 60]) {
      expect(validatePeriod(period({ slotIntervalMin: ok }))).toBeNull();
    }
  });

  /** Mirrors `reservation_service_periods_turn_time`. */
  it("keeps turn time between 15 minutes and 8 hours", () => {
    expect(validatePeriod(period({ turnTimeMin: 5 }))).toMatch(/15 minutes/);
    expect(validatePeriod(period({ turnTimeMin: 600 }))).toMatch(/8 hours/);
    expect(validatePeriod(period({ turnTimeMin: 90 }))).toBeNull();
  });

  /** Mirrors `reservation_service_periods_party_range`. */
  it("refuses a largest party smaller than the smallest", () => {
    expect(validatePeriod(period({ minPartySize: 6, maxPartySize: 2 }))).toMatch(/at least as big/i);
    expect(validatePeriod(period({ minPartySize: 0 }))).not.toBeNull();
  });

  /** Mirrors `reservation_service_periods_advance`. */
  it("keeps the booking window between 1 and 365 days", () => {
    expect(validatePeriod(period({ maxAdvanceDays: 0 }))).toMatch(/1 and 365/);
    expect(validatePeriod(period({ maxAdvanceDays: 400 }))).toMatch(/1 and 365/);
  });

  /** Mirrors `reservation_service_periods_covers`. */
  it("accepts a blank covers cap but not a nonsensical one", () => {
    expect(validatePeriod(period({ maxCoversPerSlot: null }))).toBeNull();
    expect(validatePeriod(period({ maxCoversPerSlot: 0 }))).toMatch(/at least 1/);
    expect(validatePeriod(period({ maxCoversPerSlot: 20 }))).toBeNull();
  });

  /**
   * A one-table restaurant with a single seating is legitimate, and the rules
   * must not accidentally require a busy dining room.
   */
  it("allows a small, narrow service", () => {
    expect(
      validatePeriod(
        period({
          daysOfWeek: [6],
          startTime: "19:00",
          endTime: "19:00",
          slotIntervalMin: 60,
          minPartySize: 2,
          maxPartySize: 2,
        }),
      ),
    ).toMatch(/after/i);

    expect(
      validatePeriod(
        period({
          daysOfWeek: [6],
          startTime: "19:00",
          endTime: "20:00",
          slotIntervalMin: 60,
          minPartySize: 2,
          maxPartySize: 2,
        }),
      ),
    ).toBeNull();
  });
});
