import { describe, expect, it } from "vitest";

import {
  isWebsiteReservation,
  reservationSourceLabel,
  WEBSITE_SOURCE,
} from "@/lib/constants/reservation-source";
import type { BrandedEmailContext } from "@/lib/messaging/notification-shared";
import {
  renderReservationConfirmedHtml,
  renderReservationConfirmedText,
  renderReservationDeclinedHtml,
  renderReservationDeclinedText,
  renderReservationMerchantAlertHtml,
  renderReservationMerchantAlertText,
  renderReservationRequestedHtml,
  renderReservationRequestedText,
  type MerchantReservationAlertContext,
  type ReservationContext,
  type ReservationDeclinedContext,
} from "@/lib/messaging/reservation-templates";

/**
 * What a website booking actually tells people.
 *
 * These are the only checks standing between a guest and a confirmation with a
 * dead link in it — the manage URL is built from a subdomain that may not
 * exist, threaded through two templates, and rendered into HTML that no test
 * would otherwise open.
 */

const BRAND: BrandedEmailContext = {
  businessName: "Joe's Diner",
  address: "12 Main St · Springfield",
  phone: "+15555550123",
  logoUrl: null,
};

const BASE: ReservationContext = {
  partyName: "Sam Reyes",
  partySize: 4,
  reservationDate: "2026-09-04",
  reservationTime: "19:00",
  confirmationNumber: "R7K2QD",
};

const MANAGE_URL = "https://joes.dexaposai.com/r/" + "a".repeat(64);

describe("guest confirmation", () => {
  it("puts the manage link in the SMS when there is one", () => {
    const text = renderReservationConfirmedText(BRAND, { ...BASE, manageUrl: MANAGE_URL });
    expect(text).toContain(MANAGE_URL);
    expect(text).toContain("R7K2QD");
  });

  /**
   * The link REPLACES the sign-off rather than joining it. An SMS that scrolls
   * is one nobody finishes reading, and the URL is the only line worth a tap.
   */
  it("drops the sign-off when a manage link takes its place", () => {
    const withLink = renderReservationConfirmedText(BRAND, { ...BASE, manageUrl: MANAGE_URL });
    expect(withLink).not.toContain("We look forward to seeing you!");
  });

  /**
   * A staff-typed booking on a merchant with no published site has no manage
   * page. The message must still be a complete, sensible message — a dangling
   * "View or cancel:" with nothing after it would be worse than no link.
   */
  it("falls back to the sign-off when there is no manage link", () => {
    const text = renderReservationConfirmedText(BRAND, BASE);
    expect(text).toContain("We look forward to seeing you!");
    expect(text).not.toContain("View or cancel");
  });

  it("renders a real button in the email, not bare text", () => {
    const html = renderReservationConfirmedHtml(BRAND, { ...BASE, manageUrl: MANAGE_URL });
    expect(html).toContain(`href="${MANAGE_URL}"`);
    expect(html).toContain("View or cancel");
  });

  it("emits no button at all when there is no manage link", () => {
    const html = renderReservationConfirmedHtml(BRAND, BASE);
    expect(html).not.toContain("View or cancel");
    // …and specifically not an anchor with an empty or undefined href, which is
    // what a naive template interpolation would produce.
    expect(html).not.toContain('href=""');
    expect(html).not.toContain("undefined");
  });
});

describe("merchant alert", () => {
  const MERCHANT: MerchantReservationAlertContext = {
    ...BASE,
    email: "sam@example.com",
    phone: "+15555559876",
    locationName: "Joe's Diner — Downtown",
    occasionTags: ["Birthday"],
    dietaryTags: ["Gluten-free"],
    dashboardUrl: "https://app.dexapos.com/dashboard/reservations",
  };

  it("carries the unmasked contact details the merchant needs to act", () => {
    const html = renderReservationMerchantAlertHtml(BRAND, MERCHANT);
    expect(html).toContain("sam@example.com");
    expect(html).toContain("+15555559876");
    expect(html).toContain("Birthday");
    expect(html).toContain("Gluten-free");
  });

  /**
   * The guest's manage token is their credential, not a shared reference. It
   * must never reach a staff inbox, where forwarding it would hand a stranger
   * the ability to cancel someone's dinner.
   */
  it("never leaks the guest's manage link into the merchant's copy", () => {
    const html = renderReservationMerchantAlertHtml(BRAND, {
      ...MERCHANT,
      manageUrl: null,
    });
    expect(html).not.toContain("/r/");
    expect(html).not.toContain("View or cancel");
  });

  it("survives a booking with no tags, notes or dashboard URL", () => {
    const html = renderReservationMerchantAlertHtml(BRAND, {
      ...BASE,
      email: null,
      phone: null,
      locationName: null,
      occasionTags: null,
      dietaryTags: null,
      dashboardUrl: null,
    });
    expect(html).toContain("New website booking");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });

  it("summarises the same booking in plain text", () => {
    const text = renderReservationMerchantAlertText(BRAND, MERCHANT);
    expect(text).toContain("Sam Reyes");
    expect(text).toContain("party of 4");
    expect(text).toContain("+15555559876");
  });
});

describe("reservation source", () => {
  it("recognises what create_public_reservation writes", () => {
    expect(WEBSITE_SOURCE).toBe("website");
    expect(isWebsiteReservation("website")).toBe(true);
    expect(isWebsiteReservation("Website")).toBe(true);
  });

  it("does not mistake other sources for the website", () => {
    for (const source of ["phone", "walk_in", "pos", "dashboard", null, undefined, ""]) {
      expect(isWebsiteReservation(source)).toBe(false);
    }
  });

  /** A source this file has never heard of must still render as words. */
  it("degrades an unknown source to something readable", () => {
    expect(reservationSourceLabel("third_party_widget")).toBe("third party widget");
    expect(reservationSourceLabel(null)).toBe("Dashboard");
    expect(reservationSourceLabel("website")).toBe("Website");
  });
});

/**
 * Manual review: what the guest is told, and what they must never be told.
 *
 * The single most important assertion in this file is that a requested booking
 * never says "confirmed". A guest who reads that word has been given a table
 * the restaurant has not agreed to, and the day-view Confirm button is the only
 * thing that would have made it true.
 */
describe("renderReservationRequested — a booking that is not confirmed", () => {
  it("never says confirmed, in either channel", () => {
    const text = renderReservationRequestedText(BRAND, BASE);
    const html = renderReservationRequestedHtml(BRAND, BASE);

    expect(text.toLowerCase()).not.toContain("reservation confirmed");
    expect(html.toLowerCase()).not.toContain("reservation confirmed");
  });

  it("says plainly that nothing is confirmed yet", () => {
    expect(renderReservationRequestedText(BRAND, BASE).toLowerCase()).toContain(
      "not confirmed yet",
    );
    expect(renderReservationRequestedHtml(BRAND, BASE).toLowerCase()).toContain(
      "nothing is confirmed yet",
    );
  });

  /**
   * `reservation_occupancy` counts a pending booking as occupying its table, so
   * this promise is literally true. It is also the sentence that stops a guest
   * booking elsewhere as insurance, which is why it is asserted rather than
   * left to copy review.
   */
  it("promises the table is held", () => {
    expect(renderReservationRequestedText(BRAND, BASE).toLowerCase()).toContain("holding your table");
    expect(renderReservationRequestedHtml(BRAND, BASE).toLowerCase()).toContain("holding your table");
  });

  it("carries the reference number and the party, like its confirmed sibling", () => {
    const text = renderReservationRequestedText(BRAND, BASE);
    expect(text).toContain("R7K2QD");
    expect(text).toContain("Party of 4");
  });

  it("offers withdraw rather than cancel when there is a manage link", () => {
    const text = renderReservationRequestedText(BRAND, { ...BASE, manageUrl: "https://joes.test/r/tok" });
    expect(text).toContain("View or withdraw: https://joes.test/r/tok");
  });

  it("degrades to a promise rather than a dead link without one", () => {
    const text = renderReservationRequestedText(BRAND, BASE);
    expect(text).not.toContain("View or withdraw");
    expect(text.toLowerCase()).toContain("as soon as they answer");
  });
});

describe("renderReservationDeclined — the restaurant said no", () => {
  const DECLINED: ReservationDeclinedContext = { ...BASE, venuePhone: "+15555550123" };

  /**
   * A decline is NOT a cancellation. "Your reservation was cancelled" tells a
   * guest something they never had has been taken away, which reads as the
   * restaurant's mistake rather than an answer to their request.
   */
  it("does not describe itself as a cancellation", () => {
    const text = renderReservationDeclinedText(BRAND, DECLINED);
    const html = renderReservationDeclinedHtml(BRAND, DECLINED);
    expect(text.toLowerCase()).not.toContain("cancelled");
    expect(html.toLowerCase()).not.toContain("reservation was cancelled");
  });

  it("gives the phone number as the next step", () => {
    expect(renderReservationDeclinedText(BRAND, DECLINED)).toContain("+15555550123");
    expect(renderReservationDeclinedHtml(BRAND, DECLINED)).toContain("+15555550123");
  });

  it("shows the merchant's reason verbatim when one is given", () => {
    const withReason = { ...DECLINED, cancellationReason: "We're fully committed that evening" };
    expect(renderReservationDeclinedText(BRAND, withReason)).toContain(
      "We're fully committed that evening",
    );
    expect(renderReservationDeclinedHtml(BRAND, withReason)).toContain(
      "We&#39;re fully committed that evening",
    );
  });

  it("reads correctly with no reason at all", () => {
    const text = renderReservationDeclinedText(BRAND, DECLINED);
    expect(text).not.toContain('""');
    expect(text.toLowerCase()).toContain("can't fit you in");
  });

  it("still suggests something useful with no phone number", () => {
    const noPhone = renderReservationDeclinedText(BRAND, { ...BASE });
    expect(noPhone.toLowerCase()).toContain("try another time");
  });

  /**
   * A merchant reason is free text typed into a dashboard field, so it reaches
   * an HTML email as untrusted input.
   */
  it("escapes a reason containing markup", () => {
    const html = renderReservationDeclinedHtml(BRAND, {
      ...DECLINED,
      cancellationReason: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
