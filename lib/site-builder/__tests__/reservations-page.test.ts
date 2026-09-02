import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseNavItems, removeNavItemByPath } from "../nav";
import { CURRENT_SCHEMA_VERSION, createSection } from "../page-document";
import { normalizePage } from "../normalize";
import { SECTION_REGISTRY } from "../sections/registry";
import { DEFAULT_BRAND, DEFAULT_FEATURES, resolveReservationMode } from "../site-settings";
import { validatePage } from "../validate";

/**
 * The auto-provisioned reservations page.
 *
 * `EnsureReservationsPage` itself talks to Supabase and is covered by hand, but
 * the part that can silently break is pure: the document it builds has to
 * survive `validatePage`, because provisioning calls `PublishPage` and publish
 * refuses an invalid document. A merchant would see "could not create the
 * reservations page" with nothing to act on.
 *
 * These mirror what the action builds rather than importing it — the action is
 * `"use server"` and pulls in a Supabase client at module load.
 */

const LOCATION_ID = "11111111-1111-4111-8111-111111111111";

/** The same sections `buildReservationsPage()` assembles. */
function buildReservationsPage(locationId = LOCATION_ID) {
  const ctx = { locationId };
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sections: [
      createSection("header", ctx),
      createSection("hero", ctx),
      createSection("reservations", ctx),
      createSection("footer", ctx),
    ],
    seo: {
      title: "Reservations",
      description:
        "Book a table with us online — choose your party size, pick a date and time, and we will confirm straight away.",
    },
    settings: {},
  };
}

describe("the auto-provisioned reservations page", () => {
  it("is a document publish will accept", () => {
    const doc = normalizePage(buildReservationsPage());
    const result = validatePage(doc);

    expect(result.ok, JSON.stringify(result, null, 2)).toBe(true);
  });

  it("survives normalization without losing the widget", () => {
    const doc = normalizePage(buildReservationsPage());
    expect(doc.sections.map((s) => s.kind)).toContain("reservations");
  });

  /**
   * Hero is a REQUIRED section — `validatePage` refuses a document without one,
   * and `PublishPage` refuses an invalid document. An earlier version of this
   * page left it out on the aesthetic argument that a full-bleed image pushes
   * the time grid below the fold; the document contract settled it.
   */
  it("is header, hero, widget, footer", () => {
    const doc = normalizePage(buildReservationsPage());
    expect(doc.sections.map((s) => s.kind)).toEqual([
      "header",
      "hero",
      "reservations",
      "footer",
    ]);
  });

  /**
   * The footer shows an address and opening hours, so it needs to know whose.
   * Unbound, it fails validation with "Footer is not linked to a location yet"
   * and the page cannot publish — which for an auto-provisioned page means the
   * merchant sees a failure with nothing to act on.
   */
  it("binds the footer to a location, or it cannot publish", () => {
    const unbound = normalizePage({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sections: [
        createSection("header"),
        createSection("hero"),
        createSection("reservations"),
        createSection("footer"),
      ],
      seo: {},
      settings: {},
    });

    expect(validatePage(unbound).ok).toBe(false);
    expect(validatePage(normalizePage(buildReservationsPage())).ok).toBe(true);
  });

  it("gives the widget a heading, so the page is never a bare grid", () => {
    const section = createSection("reservations");
    expect(section.props.title).toBeTruthy();
  });
});

describe("the reservations section's place in the catalogue", () => {
  it("is offered only once the merchant turns Reservations on", () => {
    expect(SECTION_REGISTRY.reservations.requiresFeature).toBe("reservations");
  });

  /**
   * Availability config must never live in page JSON. A page's content is
   * snapshotted on publish, so opening hours stored here would mean a merchant
   * who shortens Tuesday dinner has to republish every page carrying the widget
   * — and any page they forgot would keep selling tables they no longer have.
   */
  it("stores presentation only, never opening hours", () => {
    const props = SECTION_REGISTRY.reservations.defaults() as Record<string, unknown>;
    const keys = Object.keys(props);

    for (const forbidden of [
      "startTime", "endTime", "slotInterval", "turnTime",
      "daysOfWeek", "leadTime", "maxPartySize", "blackouts",
    ]) {
      expect(keys, `${forbidden} belongs on reservation_service_periods`).not.toContain(forbidden);
    }
  });

  /** Availability is fetched live, so there is nothing to snapshot at publish. */
  it("binds to nothing", () => {
    expect(SECTION_REGISTRY.reservations.bindingTypes).toEqual([]);
    expect(SECTION_REGISTRY.reservations.liveFields).toEqual([]);
  });
});

/**
 * Provisioning does NOT put a Reservations item in the nav.
 *
 * It used to, and the result was two header entries for one page: a
 * "Reservations" menu link and the "Book a table" button beside it, both
 * pointing at `/reservations`. The button is the single entry point now.
 */
describe("the nav link that provisioning no longer adds", () => {
  const link = { label: "Reservations", path: "reservations" };

  it("is not added by provisioning", () => {
    const source = readFileSync(
      join(process.cwd(), "app/dashboard/website/actions/reservations-page.ts"),
      "utf-8",
    );
    // Cheap, and it is the actual regression: someone restoring the nav item
    // without removing the header button recreates the duplicate exactly.
    expect(source).not.toContain("appendNavItem");
  });

  /**
   * Retiring still removes it, and that is what cleans up sites provisioned by
   * the older code — switching bookings off and on again drops the stale link
   * and never puts it back.
   */
  it("is still removed when reservations are switched off", () => {
    const items = [{ label: "Menu", path: "menu" }, link];
    expect(removeNavItemByPath(items, "reservations")).toEqual([{ label: "Menu", path: "menu" }]);
  });

  /**
   * A merchant may still add the page to their own menu in the nav editor, so
   * the stored shape has to keep round-tripping. Nothing about the item is
   * special; it stopped being ours, not valid.
   */
  it("round-trips through the stored shape when a merchant adds it themselves", () => {
    const stored = { items: [link] };
    expect(parseNavItems(stored)).toEqual([link]);
  });
});

/**
 * One way to book, at every width.
 *
 * The anchor beside the Order button is `lg:inline`, and below `lg` the whole
 * navigation collapses into a single menu — so the booking link joins that menu
 * at exactly the widths where the anchor is hidden. Two entries at any size is
 * the bug this replaced; zero entries on a phone would be a worse one, and a
 * restaurant's traffic is mostly phones.
 */
describe("where booking appears in the header", () => {
  const source = readFileSync(
    join(process.cwd(), "components/site-builder/sections/HeaderSection.tsx"),
    "utf-8",
  );

  it("hides the desktop anchor exactly where the collapsed menu takes over", () => {
    // The booking anchor specifically, not any anchor: the phone number beside
    // it is legitimately `sm:inline`, and asserting over the whole file would
    // fail on correct code.
    const at = source.indexOf("href={reserveHere}");
    expect(at).toBeGreaterThan(-1);
    const anchor = source.slice(at, at + 400);

    expect(anchor).toContain("lg:inline");
    // `sm:inline` was the old breakpoint, and it left 640-1024px showing the
    // collapsed menu and the anchor at the same time.
    expect(anchor).not.toContain("sm:inline");

    // And the collapsed menu is hidden from exactly `lg` up, so the two hand
    // over cleanly rather than overlapping or leaving a gap.
    expect(source).toContain("lg:hidden");
  });

  it("puts booking into the collapsed menu rather than into stored nav", () => {
    expect(source).toContain("collapsedNav");
    expect(source).toContain('label: "Book a table"');
  });
});

describe("what provisioning is triggered by", () => {
  const on = { features: { ...DEFAULT_FEATURES, reservations: true } };

  /**
   * `SyncReservationsPage` provisions for `native` and retires for anything
   * else, so what counts as `native` is what decides whether a merchant ends up
   * with a published booking page.
   */
  it("provisions only when bookings happen on this site", () => {
    expect(
      resolveReservationMode({
        ...on,
        brand: { ...DEFAULT_BRAND, reservationMode: "native" },
      }),
    ).toBe("native");

    // A leftover provider URL is not a reason to provision anything. Link mode
    // is gone, and such a site has no booking page to point a header button at.
    expect(
      resolveReservationMode({
        ...on,
        brand: { ...DEFAULT_BRAND, reservationUrl: "https://resy.com/x" },
      }),
    ).toBe("off");

    expect(resolveReservationMode({ features: DEFAULT_FEATURES, brand: DEFAULT_BRAND })).toBe("off");
  });
});
