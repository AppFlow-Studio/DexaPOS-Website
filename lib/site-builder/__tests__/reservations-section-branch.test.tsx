import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReservationsSection from "@/components/site-builder/sections/ReservationsSection";
import { emptyResolvedMap } from "../bindings/resolved";
import { createRenderContext, type RenderMode } from "../render-context";
import type { BookableLocation } from "../reservations/protocol";
import { DEFAULT_BRAND, DEFAULT_FEATURES } from "../site-settings";

/**
 * Which branch the booking section decides to book.
 *
 * The bug this pins down: the section resolved its branch through the **pricing**
 * location, which is null whenever the merchant turns on "never show prices
 * before a branch is chosen". With no location the widget could not query, so it
 * rendered *"No tables available for 2 on Fri, Aug 28"* — not a degraded answer
 * but a false one, telling a guest the restaurant was full when nothing had been
 * asked. A pricing policy silently disabled bookings.
 *
 * Every case below is really the same question: **is the answer honest?** A
 * branch it can book, a picker when there is a real choice, or a phone number.
 * Never an empty grid.
 */

function branch(over: Partial<BookableLocation> = {}): BookableLocation {
  return {
    id: "loc_1",
    name: "Joes Downtown",
    address: "1 Main St",
    timezone: "America/New_York",
    phone: "(555) 010-0100",
    bookingPolicy: null,
    collectBirthday: false,
    largePartyPhone: null,
    cancellationCutoffMin: 120,
    minPartySize: 1,
    maxPartySize: 8,
    maxAdvanceDays: 60,
    ...over,
  };
}

function render({
  sectionLocationId = undefined as string | undefined,
  /** `ctx.site.locationId` — the PRICING scope. Must never pin a booking. */
  pricingLocationId = null as string | null,
  /** `ctx.site.pageLocationId` — the page's own branch. This one does pin. */
  pageLocationId = null as string | null,
  locations = [] as BookableLocation[],
  mode = "public" as RenderMode,
  phone = "(555) 111-2222" as string | null,
} = {}): string {
  const ctx = createRenderContext({
    mode,
    site: {
      siteId: "site_1",
      locationId: pricingLocationId,
      pageLocationId,
      slug: "joes",
      name: "Joes Coffee Shop",
      logoUrl: null,
      heroImageUrl: null,
      phone,
      basePath: "/sites/joes",
      orderUrl: "/sites/joes",
      menuUrl: "/sites/joes",
      nav: [],
      pricingDisclosureText: null,
      // Native bookings on, which is the only state where this section renders
      // anything but an editor hint.
      features: { ...DEFAULT_FEATURES, reservations: true },
      brand: { ...DEFAULT_BRAND, reservationMode: "native" },
      reservations: { locations },
    },
  });

  return renderToStaticMarkup(
    <ReservationsSection
      section={{
        id: "sec_1",
        kind: "reservations" as const,
        props: {
          title: "Book a table",
          subtitle: null,
          locationId: sectionLocationId,
          showDetails: true,
          showOtherDates: true,
        } as never,
      }}
      resolved={emptyResolvedMap()}
      ctx={ctx}
    />,
  );
}

/** The serialised config the runtime portals a widget against. */
function mountConfig(html: string): Record<string, unknown> | null {
  const match = html.match(/data-dexa-reservations="([^"]*)"/);
  if (!match) return null;
  const json = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
  return JSON.parse(json);
}

describe("with one bookable branch", () => {
  /**
   * The regression that started all of this. `forceLocationChoice` leaves the
   * pricing location null; before the picker that meant no widget at all.
   */
  it("books it even when the page resolves no pricing location", () => {
    const html = render({ pricingLocationId: null, locations: [branch()] });

    expect(mountConfig(html)).toMatchObject({ locationId: "loc_1" });
    expect(html).not.toContain("please call us");
  });

  it("hands the widget that branch's settings, so it needs no second lookup", () => {
    const html = render({
      locations: [branch({ bookingPolicy: "Cancel 2 hours ahead.", maxPartySize: 6 })],
    });

    const config = mountConfig(html) as { locations: BookableLocation[] };
    expect(config.locations).toHaveLength(1);
    expect(config.locations[0]).toMatchObject({
      bookingPolicy: "Cancel 2 hours ahead.",
      maxPartySize: 6,
    });
  });
});

describe("with several bookable branches", () => {
  it("asks, rather than guessing", () => {
    const html = render({
      locations: [branch({ id: "a", name: "Alpha" }), branch({ id: "b", name: "Beta" })],
    });

    const config = mountConfig(html) as { locationId: string | null; locations: BookableLocation[] };
    expect(config.locationId).toBeNull();
    expect(config.locations.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("books the branch the section is pinned to, without asking", () => {
    const html = render({
      sectionLocationId: "b",
      locations: [branch({ id: "a", name: "Alpha" }), branch({ id: "b", name: "Beta" })],
    });

    const config = mountConfig(html) as { locationId: string; locations: BookableLocation[] };
    expect(config.locationId).toBe("b");
    expect(config.locations).toHaveLength(1);
  });

  it("falls back to the page's own branch when the section pins nothing", () => {
    const html = render({
      pageLocationId: "a",
      locations: [branch({ id: "a" }), branch({ id: "b" })],
    });

    expect(mountConfig(html)).toMatchObject({ locationId: "a" });
  });

  /**
   * **This assertion used to be the opposite, and inverting it is the point.**
   *
   * `ctx.site.locationId` is the PRICING scope: on a brand page it falls back to
   * `brand.defaultLocationId`. Booking used to read it, so a merchant answering
   * "whose prices do I show before a branch is chosen" silently answered a
   * different question — which restaurant every guest eats at — and the flow
   * then never named the branch anywhere. A guest beside Uptown was booked into
   * Downtown and told nothing.
   *
   * A pricing default is not a booking choice. With a real choice available, ask.
   */
  it("does NOT let the pricing default pin a booking", () => {
    const html = render({
      pricingLocationId: "a",
      pageLocationId: null,
      locations: [branch({ id: "a" }), branch({ id: "b" })],
    });

    const config = mountConfig(html) as { locationId: string | null; locations: BookableLocation[] };
    expect(config.locationId).toBeNull();
    expect(config.locations.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("lets a section pin beat the page's own branch", () => {
    const html = render({
      sectionLocationId: "b",
      pageLocationId: "a",
      locations: [branch({ id: "a" }), branch({ id: "b" })],
    });

    expect(mountConfig(html)).toMatchObject({ locationId: "b" });
  });
});

describe("telling the widget the merchant is multi-branch", () => {
  /**
   * `locations.length` cannot answer this once a pin has narrowed the list to
   * one — and that is exactly the case where naming the branch matters most,
   * because the guest was never asked.
   */
  it("is true on a pinned page, where the offered list holds only one branch", () => {
    const html = render({
      pageLocationId: "a",
      locations: [branch({ id: "a" }), branch({ id: "b" })],
    });

    const config = mountConfig(html) as { multiBranch: boolean; locations: BookableLocation[] };
    expect(config.locations).toHaveLength(1);
    expect(config.multiBranch).toBe(true);
  });

  it("is false for a genuine single-restaurant merchant", () => {
    const html = render({ locations: [branch({ id: "a" })] });
    expect(mountConfig(html)).toMatchObject({ multiBranch: false });
  });
});

describe("when the pinned branch is not bookable", () => {
  /**
   * A branch that has since switched bookings off, or lost its last service
   * period. Honouring the pin would render a widget that queries forever and
   * reports an empty grid — the false zero again.
   */
  it("ignores the pin and asks instead of showing an empty grid", () => {
    const html = render({
      sectionLocationId: "gone",
      locations: [branch({ id: "a" }), branch({ id: "b" })],
    });

    expect(mountConfig(html)).toMatchObject({ locationId: null });
  });

  it("resolves to the only bookable branch when there is exactly one", () => {
    const html = render({ sectionLocationId: "gone", locations: [branch({ id: "a" })] });
    expect(mountConfig(html)).toMatchObject({ locationId: "a" });
  });
});

describe("with nothing bookable", () => {
  it("shows the phone number rather than a form that cannot book", () => {
    const html = render({ locations: [], phone: "(192) 391-0320" });

    expect(html).toContain("(192) 391-0320");
    expect(html).toContain("please call us");
    expect(mountConfig(html)).toBeNull();
  });

  it("still says something useful when the merchant has no phone number either", () => {
    const html = render({ locations: [], phone: null });

    expect(html).toContain("contact the restaurant directly");
    expect(mountConfig(html)).toBeNull();
  });

  /** Said where it can be acted on, instead of being discovered by a guest. */
  it("tells the merchant why, in the builder", () => {
    const html = render({ locations: [], mode: "builder" });
    expect(html).toContain("No branch is taking bookings yet");
  });
});

describe("the builder and the preview", () => {
  /**
   * Both render against a REAL restaurant, so a live widget would let a merchant
   * laying out their page place genuine holds on genuine tables during service.
   */
  it("never emit a mount point, however many branches are bookable", () => {
    for (const mode of ["builder", "preview"] as RenderMode[]) {
      expect(mountConfig(render({ locations: [branch()], mode })), mode).toBeNull();
    }
  });
});
