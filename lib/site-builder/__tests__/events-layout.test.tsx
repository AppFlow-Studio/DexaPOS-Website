import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EventsSection from "@/components/site-builder/sections/EventsSection";
import { emptyResolvedMap } from "../bindings/resolved";
import type { RenderEvent } from "../events/event-map";
import { createRenderContext, type RenderMode } from "../render-context";
import { describeField } from "../schema-introspect";
import { SECTION_KINDS } from "../sections/kinds";
import { eventsDefaults, eventsSchema } from "../sections/schemas/events";
import { SECTION_REGISTRY, pageNeedsEvents } from "../sections/registry";
import type { EventsProps } from "../sections/schemas";

const ROOT = join(__dirname, "..", "..", "..");

// ─────────────────────────────────────────────────────────────────────────────
// fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** `n` days from now, as the `YYYY-MM-DD` the schema stores. */
function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function event(overrides: Partial<RenderEvent> & { id: string }): RenderEvent {
  return {
    slug: overrides.id,
    name: `Event ${overrides.id}`,
    description: "Something worth turning up for.",
    photoAssetId: `asset_${overrides.id}`,
    photoUrl: `https://cdn.test/${overrides.id}.jpg`,
    photoAlt: null,
    locationId: null,
    locationName: null,
    startDate: dayOffset(7),
    startTime: "23:00",
    endTime: "02:00",
    repeat: "none",
    ...overrides,
  };
}

function section(props: Partial<EventsProps> = {}) {
  return {
    id: "sec_1",
    kind: "events" as const,
    props: { ...eventsDefaults(), ...props },
  };
}

function render(
  props: Partial<EventsProps>,
  events: RenderEvent[],
  mode: RenderMode = "public",
): string {
  const ctx = createRenderContext({
    mode,
    events,
    // The public renderer supplies this; the builder canvas deliberately does
    // not, which is what suppresses the "Event details" link there.
    ...(mode === "public" ? { eventUrl: (slug: string) => `/sites/tonys/events/${slug}` } : {}),
    site: {
      siteId: "site_1",
      locationId: "loc_1",
      slug: "tonys",
      name: "Tony's Pizza",
      logoUrl: null,
      heroImageUrl: null,
      phone: null,
      basePath: "/sites/tonys",
      orderUrl: "/sites/tonys",
      menuUrl: "/sites/tonys",
      nav: [],
      pricingDisclosureText: null,
    },
  });

  return renderToStaticMarkup(
    // `resolved` is required by the render contract and unused by this section:
    // it binds to no platform records, only to the events on the context.
    <EventsSection section={section(props)} resolved={emptyResolvedMap()} ctx={ctx} />,
  );
}

const spotlight = (props: Partial<EventsProps> = {}) =>
  ({ layout: "spotlight", ...props }) as Partial<EventsProps>;

// ─────────────────────────────────────────────────────────────────────────────

describe("one Events section, two layouts", () => {
  it("is a single kind — the separate featured-event kind is gone", () => {
    expect(SECTION_KINDS).toContain("events");
    expect(SECTION_KINDS).not.toContain("featured-event");
    expect(eventsSchema.safeParse(eventsDefaults()).success).toBe(true);
    expect(eventsDefaults().layout).toBe("grid");
  });

  /**
   * Events are fetched only for pages that want them, and both render paths
   * used to decide that with a literal `kind === "events"`. That happened to be
   * right while events were one kind and would silently break the moment they
   * were not — a section rendering against an empty list, with no error
   * anywhere, blank on a live homepage.
   */
  it("declares that it needs the events list", () => {
    expect(SECTION_REGISTRY.events.usesEvents).toBe(true);
    expect(pageNeedsEvents([{ kind: "events" }])).toBe(true);
    expect(pageNeedsEvents([{ kind: "hero" }, { kind: "gallery" }])).toBe(false);
    expect(pageNeedsEvents([])).toBe(false);
  });

  /**
   * Reading the sources rather than the behaviour, because the failure is a
   * *divergence* between two files and no single-path test can see it.
   */
  it("has both render paths ask the registry, not a hard-coded kind", () => {
    for (const path of [
      "app/sites/[slug]/built-site.tsx",
      "app/dashboard/website/pages/render-canvas.tsx",
    ]) {
      const source = readFileSync(join(ROOT, path), "utf8");
      expect(source, `${path} should use pageNeedsEvents`).toContain("pageNeedsEvents(");
      expect(source, `${path} still matches a kind by name`).not.toMatch(
        /kind === ["']events["']/,
      );
    }
  });

  /** A uuid text box is not a control. Same reasoning as `formId`. */
  it("gives eventId a picker rather than a text field", () => {
    const control = describeField("eventId", eventsSchema.shape.eventId);
    expect(control.kind).toBe("event");
    // Optional: blank means "whichever event is next".
    expect(control.optional).toBe(true);
  });

  /** Every icon a registry entry names must actually be in the UI allowlist. */
  it("names an icon the allowlist can resolve", () => {
    const source = readFileSync(
      join(ROOT, "components/site-builder/builder/section-icons.tsx"),
      "utf8",
    );
    const allowlist = source.slice(source.indexOf("const ICONS"), source.indexOf("export function"));

    for (const kind of SECTION_KINDS) {
      const icon = SECTION_REGISTRY[kind].icon;
      expect(allowlist, `${kind} names ${icon}, which the allowlist does not carry`).toMatch(
        new RegExp(`\\b${icon}\\b`),
      );
    }
  });
});

describe("grid layout", () => {
  const events = [
    event({ id: "a", name: "Trivia Night", startDate: dayOffset(2) }),
    event({ id: "b", name: "Jazz Brunch", startDate: dayOffset(9) }),
    event({ id: "c", name: "Wine Tasting", startDate: dayOffset(16) }),
  ];

  it("shows every upcoming event, soonest first", () => {
    const html = render({}, events);
    expect(html).toContain("Trivia Night");
    expect(html).toContain("Jazz Brunch");
    expect(html).toContain("Wine Tasting");
    expect(html.indexOf("Trivia Night")).toBeLessThan(html.indexOf("Jazz Brunch"));
  });

  it("honours the limit", () => {
    const html = render({ limit: 2 }, events);
    expect(html).toContain("Trivia Night");
    expect(html).not.toContain("Wine Tasting");
  });

  /**
   * A published Events page with nothing on it must not look broken — that is
   * what makes it safe to publish before the first event exists. The grid says
   * so; the spotlight, which is a banner rather than a page, disappears.
   */
  it("says so rather than vanishing when nothing is upcoming", () => {
    const html = render({}, []);
    expect(html).toContain("no events right now");
  });

  it("drops descriptions when the merchant turns them off", () => {
    const withCopy = [event({ id: "a", description: "Bring a team of six." })];
    expect(render({}, withCopy)).toContain("Bring a team of six.");
    expect(render({ showDescription: false }, withCopy)).not.toContain("Bring a team of six.");
  });
});

describe("spotlight layout — which event it shows", () => {
  const soon = event({ id: "soon", name: "Trivia Night", startDate: dayOffset(2) });
  const later = event({ id: "later", name: "Jazz Brunch", startDate: dayOffset(30) });
  const over = event({ id: "over", name: "New Year's Party", startDate: dayOffset(-30) });

  it("shows the soonest upcoming event when nothing is pinned", () => {
    const html = render(spotlight(), [later, soon, over]);
    expect(html).toContain("Trivia Night");
    expect(html).not.toContain("Jazz Brunch");
  });

  it("shows the pinned event even when another one is sooner", () => {
    const html = render(spotlight({ eventId: "later" }), [later, soon]);
    expect(html).toContain("Jazz Brunch");
    expect(html).not.toContain("Trivia Night");
  });

  /**
   * A merchant who pinned their New Year's party gets a closed-up homepage in
   * January, not somebody else's event promoted into the slot they chose —
   * which they never approved and would have no reason to check.
   */
  it("renders nothing publicly when the pinned event is over", () => {
    expect(render(spotlight({ eventId: "over" }), [over, soon])).toBe("");
  });

  it("renders nothing publicly when the pinned event has been deleted", () => {
    expect(render(spotlight({ eventId: "deleted_id" }), [soon])).toBe("");
  });

  it("renders nothing publicly when there are no events at all", () => {
    expect(render(spotlight(), [])).toBe("");
  });

  it("keeps a repeating event that already started once", () => {
    const weekly = event({ id: "weekly", name: "Weekly Quiz", startDate: dayOffset(-30) });
    weekly.repeat = "weekly";
    expect(render(spotlight(), [weekly])).toContain("Weekly Quiz");
  });
});

/**
 * The canvas must explain the empty states rather than reproduce them, because
 * a merchant staring at a gap has no way to tell "nothing chosen" from "the
 * thing you chose is over" — and the fix is different for each.
 */
describe("spotlight layout — what the builder canvas says when there is nothing to show", () => {
  const over = event({ id: "over", startDate: dayOffset(-30) });

  it("tells the merchant a pinned event has ended", () => {
    expect(render(spotlight({ eventId: "over" }), [over], "builder")).toContain(
      "This event is over",
    );
  });

  it("tells the merchant a pinned event has been deleted", () => {
    expect(render(spotlight({ eventId: "gone" }), [over], "builder")).toContain(
      "has been deleted",
    );
  });

  it("explains the unpinned empty state differently", () => {
    const html = render(spotlight(), [], "builder");
    expect(html).toContain("whichever event is next");
    expect(html).not.toContain("This event is over");
  });
});

describe("spotlight layout — how the photo and text are arranged", () => {
  const soon = event({ id: "soon", startDate: dayOffset(2) });
  const POSITION_UTILITIES = ["static", "fixed", "absolute", "relative", "sticky"];

  /**
   * The invariant the hero carousel broke: two position utilities on one
   * element hands the decision to Tailwind's emission order, which put
   * `.relative` after `.absolute` and collapsed every frame to zero height.
   * Nothing about that failure is visible in the JSX, so this scans every
   * element rather than one known wrapper.
   */
  function positionClashes(html: string): string[] {
    const clashes: string[] = [];
    for (const match of html.matchAll(/class="([^"]*)"/g)) {
      const positions = match[1]
        .split(/\s+/)
        .filter((c) => POSITION_UTILITIES.includes(c));
      if (positions.length > 1) clashes.push(match[1]);
    }
    return clashes;
  }

  it.each(["left", "right", "behind"] as const)(
    "never puts two position classes on one element in %s",
    (photoPosition) => {
      expect(positionClashes(render(spotlight({ photoPosition }), [soon]))).toEqual([]);
    },
  );

  it("also holds for the grid", () => {
    expect(positionClashes(render({}, [soon]))).toEqual([]);
  });

  it("makes the band a containing block when the photo sits behind the text", () => {
    const html = render(spotlight({ photoPosition: "behind" }), [soon]);
    expect(html).toContain("relative w-full overflow-hidden");
    // The photo is `absolute inset-0` and needs that ancestor to resolve against.
    const img = html.match(/<img[^>]*class="([^"]*)"/);
    expect(img?.[1]).toContain("absolute");
    expect(img?.[1]).toContain("inset-0");
  });

  /**
   * With a heading the band needs a padded section above it to sit in; without
   * one it *is* the section and should stay full-bleed. Getting this backwards
   * either floats a heading over the photograph, competing with the event's own
   * name, or wraps a bare banner in dead vertical space.
   */
  it("keeps the band full-bleed only when there is no heading to place", () => {
    const bare = render(spotlight({ photoPosition: "behind", title: undefined }), [soon]);
    expect(bare.startsWith("<div")).toBe(true);

    const titled = render(spotlight({ photoPosition: "behind", title: "Don't miss" }), [soon]);
    expect(titled.startsWith("<section")).toBe(true);
    expect(titled).toContain("Don&#x27;t miss");
  });

  it("reverses the flex direction rather than reordering the markup for 'right'", () => {
    // Source order stays photo-then-copy, so a screen reader hears the event
    // name in the same place whichever side the merchant put the picture on.
    expect(render(spotlight({ photoPosition: "right" }), [soon])).toContain("md:flex-row-reverse");
    expect(render(spotlight({ photoPosition: "left" }), [soon])).not.toContain(
      "md:flex-row-reverse",
    );
  });

  it("applies the scrim only behind the text, at the chosen strength", () => {
    expect(render(spotlight({ photoPosition: "behind", overlayOpacity: 60 }), [soon])).toContain(
      "opacity:0.6",
    );
    expect(render(spotlight({ photoPosition: "left", overlayOpacity: 60 }), [soon])).not.toContain(
      "opacity:0.6",
    );
  });

  it("scales the event name with the text size", () => {
    expect(render(spotlight({ textSize: "small" }), [soon])).toContain("text-2xl");
    expect(render(spotlight({ textSize: "large" }), [soon])).toContain("text-4xl md:text-5xl");
  });

  it("scales the photo column with the photo size", () => {
    expect(render(spotlight({ photoSize: "small" }), [soon])).toContain("md:w-1/3");
    expect(render(spotlight({ photoSize: "large" }), [soon])).toContain("md:w-3/5");
  });

  /**
   * The button is driven by the event's own data, so there is no toggle that
   * could sit on screen doing nothing for an event without a ticket link.
   */
  it("offers tickets only when the event carries a ticket link", () => {
    const ticketed = event({ id: "soon", ticketUrl: "https://tickets.test/trivia" });
    expect(render(spotlight(), [ticketed])).toContain("https://tickets.test/trivia");
    expect(render(spotlight(), [event({ id: "soon" })])).not.toContain("Get tickets");
  });

  it("does not link out of the editor from the builder canvas", () => {
    expect(render(spotlight(), [event({ id: "soon" })], "builder")).not.toContain("Event details");
    expect(render(spotlight(), [event({ id: "soon" })])).toContain("Event details");
  });
});

/**
 * A control that is on screen and does nothing is the defect this feature has
 * spent a session removing — the hero's overlay slider was inert in the one
 * variant that renders no scrim. Merging two sections into one layout control
 * multiplies the opportunities, so this is the check that keeps the panel
 * honest.
 */
describe("controls that cannot apply are hidden", () => {
  const hidden = (props: Partial<EventsProps>) =>
    SECTION_REGISTRY.events.hiddenFields?.({ ...eventsDefaults(), ...props }) ?? [];

  it("hides every spotlight control while the layout is a grid", () => {
    const grid = hidden({ layout: "grid" });
    for (const field of ["eventId", "photoPosition", "photoSize", "textSize", "overlayOpacity"]) {
      expect(grid, `grid should hide ${field}`).toContain(field);
    }
    // The count is the grid's own control and must stay.
    expect(grid).not.toContain("limit");
  });

  it("hides the count while the layout is a spotlight", () => {
    expect(hidden({ layout: "spotlight" })).toContain("limit");
    expect(hidden({ layout: "spotlight" })).not.toContain("eventId");
  });

  it("hides the photo size when the photo fills the band", () => {
    const props = { layout: "spotlight", photoPosition: "behind" } as Partial<EventsProps>;
    expect(hidden(props)).toContain("photoSize");
    expect(hidden(props)).not.toContain("overlayOpacity");
  });

  it("hides the scrim when there is no text sitting on the photo", () => {
    for (const photoPosition of ["left", "right"] as const) {
      const props = { layout: "spotlight", photoPosition } as Partial<EventsProps>;
      expect(hidden(props)).toContain("overlayOpacity");
      expect(hidden(props)).not.toContain("photoSize");
    }
  });

  /** Every hidden name must be a real field, or the hook is quietly a no-op. */
  it("only ever names fields that exist on the schema", () => {
    const fields = new Set(Object.keys(eventsSchema.shape));
    for (const layout of ["grid", "spotlight"] as const) {
      for (const photoPosition of ["left", "right", "behind"] as const) {
        for (const name of hidden({ layout, photoPosition })) {
          expect(fields, `${layout}/${photoPosition} hides unknown field ${name}`).toContain(name);
        }
      }
    }
  });
});
