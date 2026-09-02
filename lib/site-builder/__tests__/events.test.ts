import { describe, expect, it } from "vitest";

import { buildEventJsonLd } from "../json-ld";
import {
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  eventInputSchema,
  eventSlug,
  formatDateValue,
  formatOccurrence,
  formatTime,
  isOvernight,
  nextOccurrence,
  occurrenceEnd,
  upcomingEvents,
  type EventRepeat,
} from "../events/event";

/** A local-time `Date`, so these tests read the way the maths works. */
function at(iso: string): Date {
  const [date, time = "00:00"] = iso.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function ev(
  startDate: string,
  repeat: EventRepeat = "none",
  startTime = "19:00",
  endTime = "21:00",
) {
  return { startDate, startTime, endTime, repeat };
}

describe("overnight events", () => {
  /**
   * The shipped default is `11:00 PM → 2:00 AM`, so this is the common case
   * rather than an edge one.
   */
  it("treats an end at or before the start as finishing the next day", () => {
    expect(isOvernight({ startTime: "23:00", endTime: "02:00" })).toBe(true);
    expect(isOvernight({ startTime: "19:00", endTime: "21:00" })).toBe(false);
    // Exactly equal is still overnight — a zero-length event is not a thing.
    expect(isOvernight({ startTime: "20:00", endTime: "20:00" })).toBe(true);
  });

  it("ends an 11pm–2am event at 2am the following morning", () => {
    const end = occurrenceEnd({ startTime: "23:00", endTime: "02:00" }, at("2026-08-21"));
    expect(formatDateValue(end)).toBe("2026-08-22");
    expect(end.getHours()).toBe(2);
  });

  it("uses the shipped restaurant-shaped defaults", () => {
    expect(DEFAULT_START_TIME).toBe("23:00");
    expect(DEFAULT_END_TIME).toBe("02:00");
  });
});

describe("nextOccurrence — one-off events", () => {
  it("returns the date while it is still in the future", () => {
    const next = nextOccurrence(ev("2026-08-21"), at("2026-08-01"));
    expect(next && formatDateValue(next)).toBe("2026-08-21");
  });

  /**
   * The rule that keeps a merchant's Friday trivia night on their homepage
   * while the room is still full, instead of vanishing the minute it starts.
   */
  it("stays upcoming while the event is actually happening", () => {
    const next = nextOccurrence(ev("2026-08-21"), at("2026-08-21T20:00"));
    expect(next && formatDateValue(next)).toBe("2026-08-21");
  });

  it("stays upcoming past midnight for a late-night event", () => {
    const late = ev("2026-08-21", "none", "23:00", "02:00");
    const next = nextOccurrence(late, at("2026-08-22T01:30"));
    expect(next && formatDateValue(next)).toBe("2026-08-21");
  });

  it("disappears once it has finished", () => {
    expect(nextOccurrence(ev("2026-08-21"), at("2026-08-21T21:01"))).toBeNull();
    expect(nextOccurrence(ev("2026-08-21"), at("2026-09-01"))).toBeNull();
  });

  it("returns null for a date that does not exist", () => {
    expect(nextOccurrence(ev("2026-02-30"), at("2026-01-01"))).toBeNull();
    expect(nextOccurrence(ev("not-a-date"), at("2026-01-01"))).toBeNull();
  });
});

describe("nextOccurrence — repeating events", () => {
  it("rolls a daily event forward to today", () => {
    const next = nextOccurrence(ev("2026-01-01", "daily"), at("2026-08-20T08:00"));
    expect(next && formatDateValue(next)).toBe("2026-08-20");
  });

  it("keeps a daily event visible while last night's is still running", () => {
    const late = ev("2026-01-01", "daily", "23:00", "02:00");
    const next = nextOccurrence(late, at("2026-08-20T01:00"));
    expect(next && formatDateValue(next)).toBe("2026-08-19");
  });

  /** Weekly trivia must stay on its weekday for ever. */
  it("keeps a weekly event on the same weekday", () => {
    const start = at("2026-08-07"); // a Friday
    expect(start.getDay()).toBe(5);

    const next = nextOccurrence(ev("2026-08-07", "weekly"), at("2026-09-15"));
    expect(next).not.toBeNull();
    expect(next!.getDay()).toBe(5);
    expect(next!.getTime()).toBeGreaterThan(at("2026-09-15").getTime() - 86_400_000);
  });

  it("returns the same day for a weekly event happening today", () => {
    const next = nextOccurrence(ev("2026-08-07", "weekly"), at("2026-08-21T10:00"));
    expect(next && formatDateValue(next)).toBe("2026-08-21");
  });

  it("rolls a monthly event to the current month", () => {
    const next = nextOccurrence(ev("2026-01-15", "monthly"), at("2026-08-01"));
    expect(next && formatDateValue(next)).toBe("2026-08-15");
  });

  /**
   * The clamping rule. Rolling instead would march the 31st into the 1st of the
   * next month and, a few short months later, into an entirely different week.
   */
  it("clamps a monthly event on the 31st to the end of a short month", () => {
    const next = nextOccurrence(ev("2026-01-31", "monthly"), at("2026-04-01"));
    // April has 30 days.
    expect(next && formatDateValue(next)).toBe("2026-04-30");
  });

  it("returns to the intended day after a short month", () => {
    const next = nextOccurrence(ev("2026-01-31", "monthly"), at("2026-05-01"));
    expect(next && formatDateValue(next)).toBe("2026-05-31");
  });

  it("clamps 29 February to the 28th in a non-leap year", () => {
    const next = nextOccurrence(ev("2024-02-29", "yearly"), at("2026-01-01"));
    expect(next && formatDateValue(next)).toBe("2026-02-28");
  });

  it("rolls a yearly event to this year", () => {
    const next = nextOccurrence(ev("2020-12-25", "yearly"), at("2026-08-01"));
    expect(next && formatDateValue(next)).toBe("2026-12-25");
  });

  /** A corrupt row must not spin the render thread. */
  it("terminates rather than looping for ever", () => {
    const started = Date.now();
    nextOccurrence(ev("1970-01-01", "daily"), at("2026-08-20"));
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("upcomingEvents", () => {
  it("sorts by when they next happen and drops the ones that are over", () => {
    const events = [
      { id: "c", ...ev("2026-09-10") },
      { id: "a", ...ev("2026-08-25") },
      { id: "gone", ...ev("2026-01-01") },
      { id: "b", ...ev("2026-01-05", "monthly") },
    ];

    // a = 25 Aug, b = the monthly one's next turn on 5 Sep, c = 10 Sep.
    const upcoming = upcomingEvents(events, at("2026-08-20"));
    expect(upcoming.map((u) => u.event.id)).toEqual(["a", "b", "c"]);
    expect(upcoming.map((u) => formatDateValue(u.occursOn))).toEqual([
      "2026-08-25",
      "2026-09-05",
      "2026-09-10",
    ]);
  });

  it("returns nothing when every event has passed", () => {
    expect(upcomingEvents([{ id: "x", ...ev("2020-01-01") }], at("2026-08-20"))).toEqual([]);
  });
});

describe("eventInputSchema", () => {
  const valid = {
    name: "Trivia Night",
    photoAssetId: "asset_1",
    locationId: null,
    startDate: "2026-08-21",
    startTime: "23:00",
    endTime: "02:00",
    repeat: "weekly" as const,
  };

  it("accepts a well-formed event", () => {
    expect(eventInputSchema.safeParse(valid).success).toBe(true);
  });

  /**
   * The one field this product is opinionated about: an event with no
   * photograph is a bare line of text in a grid of images, and it makes a
   * restaurant's website look broken.
   */
  it("requires a photo", () => {
    expect(eventInputSchema.safeParse({ ...valid, photoAssetId: "" }).success).toBe(false);
    const { photoAssetId, ...without } = valid;
    void photoAssetId;
    expect(eventInputSchema.safeParse(without).success).toBe(false);
  });

  it("rejects malformed dates and times", () => {
    expect(eventInputSchema.safeParse({ ...valid, startDate: "21/08/2026" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...valid, startTime: "11:00 PM" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...valid, endTime: "25:00" }).success).toBe(false);
  });

  it("refuses a ticket link that is not an http address", () => {
    expect(eventInputSchema.safeParse({ ...valid, ticketUrl: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(eventInputSchema.safeParse({ ...valid, ticketUrl: "eventbrite.com/x" }).success).toBe(
      false,
    );
    expect(
      eventInputSchema.safeParse({ ...valid, ticketUrl: "https://eventbrite.com/x" }).success,
    ).toBe(true);
  });

  it("refuses an unknown repeat", () => {
    expect(eventInputSchema.safeParse({ ...valid, repeat: "fortnightly" }).success).toBe(false);
  });
});

describe("eventSlug", () => {
  it("makes a readable address", () => {
    expect(eventSlug("Trivia Night!")).toBe("trivia-night");
    expect(eventSlug("  Live Jazz — Fridays  ")).toBe("live-jazz-fridays");
  });

  it("keeps accented words rather than losing them", () => {
    expect(eventSlug("Café Night")).toBe("cafe-night");
  });

  it("always returns something usable", () => {
    expect(eventSlug("!!!")).toBe("event");
    expect(eventSlug("")).toBe("event");
    expect(eventSlug("مطعم")).toBe("event");
  });

  it("never ends in a hyphen after truncation", () => {
    const slug = eventSlug("a".repeat(58) + " bbbb");
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("formatting", () => {
  it("renders 24-hour storage as a readable time", () => {
    expect(formatTime("23:00")).toBe("11:00 PM");
    expect(formatTime("02:00")).toBe("2:00 AM");
  });

  it("passes a malformed time through rather than throwing", () => {
    expect(formatTime("nope")).toBe("nope");
  });

  it("describes an occurrence in one line", () => {
    const text = formatOccurrence({ startTime: "23:00", endTime: "02:00" }, at("2026-08-21"));
    expect(text).toContain("Friday");
    expect(text).toContain("11:00 PM");
    expect(text).toContain("2:00 AM");
  });
});

/**
 * Structured data is what puts a restaurant's trivia night into Google's event
 * results — a materially bigger prize for a marketing site than the page
 * itself ranking. What it may *claim* therefore matters more than what it
 * emits.
 */
describe("buildEventJsonLd", () => {
  const base = {
    name: "Friday Trivia",
    url: "https://joes.dexaposai.com/events/friday-trivia",
    startDate: "2026-08-21T23:00",
    endDate: "2026-08-22T02:00",
    location: null,
    organizerName: "Joe's Coffee",
  };

  it("emits an in-person, scheduled Event", () => {
    const json = buildEventJsonLd(base);
    expect(json["@type"]).toBe("Event");
    expect(json.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode");
    expect(json.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(json.startDate).toBe("2026-08-21T23:00");
    expect(json.endDate).toBe("2026-08-22T02:00");
  });

  it("omits everything it does not know rather than emitting it empty", () => {
    const json = buildEventJsonLd(base);
    expect("description" in json).toBe(false);
    expect("image" in json).toBe(false);
    expect("location" in json).toBe(false);
    expect("offers" in json).toBe(false);
  });

  /**
   * Inventing `"price": "0"` would advertise a paid event as free, which is a
   * claim nobody made.
   */
  it("offers a ticket link without inventing a price", () => {
    const json = buildEventJsonLd({ ...base, ticketUrl: "https://eventbrite.com/e/1" });
    expect(json.offers).toEqual({
      "@type": "Offer",
      url: "https://eventbrite.com/e/1",
      availability: "https://schema.org/InStock",
    });
    expect(JSON.stringify(json)).not.toContain("price");
  });

  it("gives a place only when there is a real address to give", () => {
    const json = buildEventJsonLd({
      ...base,
      location: {
        addressLine1: "1 High Street",
        city: "Camden",
        state: null,
        postalCode: "NW1",
      } as never,
    });

    expect(json.location).toMatchObject({
      "@type": "Place",
      address: { streetAddress: "1 High Street", addressLocality: "Camden" },
    });
  });
});
