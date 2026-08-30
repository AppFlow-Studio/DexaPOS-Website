import { describe, expect, it } from "vitest";

import type { BookableLocation } from "../protocol";
import { resolveBookingTarget } from "../resolve-branch";

/**
 * The rule, in isolation.
 *
 * It exists in one place because it used to exist in two: `ReservationsSection`
 * knew how to resolve a branch and `HeaderSection` did not, so the header's
 * "Book a table" dialog — the feature's primary entry point — opened onto an
 * empty picker and could not book.
 *
 * Every case below is the same question asked from a different angle: **can the
 * guest end up somewhere they did not choose, or be told something untrue about
 * availability?** Both answers must be no.
 */

function branch(id: string): BookableLocation {
  return {
    id,
    name: `Branch ${id}`,
    address: null,
    timezone: "America/New_York",
    phone: null,
    bookingPolicy: null,
    collectBirthday: false,
    largePartyPhone: null,
    cancellationCutoffMin: 120,
    minPartySize: 1,
    maxPartySize: 8,
    maxAdvanceDays: 60,
  };
}

describe("a pin", () => {
  it("is honoured when the branch is bookable", () => {
    const t = resolveBookingTarget([branch("a"), branch("b")], "b");
    expect(t.resolved?.id).toBe("b");
    expect(t.missing).toBe(false);
  });

  /**
   * The branch switched bookings off, or lost its last service period. Honouring
   * the pin would render a widget that queries forever and reports "No tables
   * available" — telling a guest the restaurant is full when nothing was asked.
   */
  it("is ignored when the branch is no longer bookable", () => {
    const t = resolveBookingTarget([branch("a"), branch("b")], "gone");
    expect(t.resolved).toBeNull();
    expect(t.offered.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("falls through to the only bookable branch when it is stale", () => {
    const t = resolveBookingTarget([branch("a")], "gone");
    expect(t.resolved?.id).toBe("a");
  });

  it("treats null, undefined and empty string alike as no pin", () => {
    for (const pin of [null, undefined, ""]) {
      expect(resolveBookingTarget([branch("a"), branch("b")], pin).resolved, String(pin)).toBeNull();
    }
  });
});

describe("with no pin", () => {
  /**
   * The common case, and the one that must never become a question: a single
   * restaurant is not a choice.
   */
  it("resolves a lone branch without asking", () => {
    const t = resolveBookingTarget([branch("a")], null);
    expect(t.resolved?.id).toBe("a");
    expect(t.offered).toHaveLength(1);
  });

  it("asks when there is a genuine choice", () => {
    const t = resolveBookingTarget([branch("a"), branch("b")], null);
    expect(t.resolved).toBeNull();
    expect(t.offered.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("what gets offered to the widget", () => {
  /**
   * A resolved branch is sent as a one-entry list rather than nothing, so the
   * widget always has that branch's policy, party bounds and timezone without a
   * second round trip.
   */
  it("is the single resolved branch when one is settled", () => {
    expect(resolveBookingTarget([branch("a"), branch("b")], "a").offered.map((l) => l.id)).toEqual([
      "a",
    ]);
  });

  it("is everything bookable when the guest must choose", () => {
    expect(resolveBookingTarget([branch("a"), branch("b")], null).offered).toHaveLength(2);
  });
});

describe("with nothing bookable", () => {
  /** Surfaces show the venue's phone number rather than a form that cannot book. */
  it("reports missing, whatever was pinned", () => {
    for (const pin of [null, "a"]) {
      const t = resolveBookingTarget([], pin);
      expect(t.missing, String(pin)).toBe(true);
      expect(t.resolved, String(pin)).toBeNull();
      expect(t.offered, String(pin)).toEqual([]);
    }
  });

  it("never reports missing while a branch is bookable", () => {
    expect(resolveBookingTarget([branch("a")], null).missing).toBe(false);
  });
});
