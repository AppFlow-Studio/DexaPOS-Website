/**
 * The documents a new page can start from.
 *
 * Sibling to [starter-page.ts](./starter-page.ts), which seeds the merchant's
 * *first* home page and is a different problem: that one runs once, unattended,
 * and has to produce a complete restaurant homepage. These run every time a
 * merchant adds a page, and they are chosen from a picker that renders them —
 * so their job is to be recognisably different from each other at a glance.
 *
 * Copy follows the same rule as the starter: every string is either the
 * merchant's own data or reads as a prompt to replace it. Nothing is a
 * placeholder that renders as an empty box, because the picker shows the real
 * render and an empty box there looks like a broken template.
 *
 * **`gallery` is deliberately absent from Showcase.** The registry marks it
 * `unavailable` until the asset library exists, and a template that arrives
 * carrying a section the merchant cannot put a photo in teaches them the
 * product is broken. It goes in the moment Stage 7 lands.
 */

import type { PageDocument } from "./page-document";
import { CURRENT_SCHEMA_VERSION } from "./page-document";

export type PageTemplateId = "article" | "showcase" | "blank";

export interface PageTemplateOptions {
  /**
   * The restaurant whose address, hours and menu the bound sections resolve.
   *
   * Separate from whether the *page* is a location page: a brand page still has
   * a footer, and a footer with no location binding is a publish blocker the
   * merchant has no obvious way to clear.
   */
  locationId: string;
  /** Shown in the hero and used as the search title. */
  title: string;
}

export const PAGE_TEMPLATE_IDS: PageTemplateId[] = ["article", "showcase", "blank"];

export function createPageFromTemplate(
  template: PageTemplateId,
  options: PageTemplateOptions,
): PageDocument {
  switch (template) {
    case "showcase":
      return showcase(options);
    case "blank":
      return blank(options);
    case "article":
    default:
      return article(options);
  }
}

/** Header, hero, footer — the frame every template shares. */
function frame(locationId: string) {
  return {
    header: {
      id: "s_tpl_header",
      kind: "header" as const,
      props: {
        logoAlign: "left" as const,
        sticky: true,
        showOrderButton: true,
        orderButtonLabel: "Order Online",
        showPhone: false,
        transparentOverHero: false,
      },
    },
    footer: {
      id: "s_tpl_footer",
      kind: "footer" as const,
      props: {
        location: { type: "location" as const, id: locationId },
        showAddress: true,
        showHours: true,
        showPhone: true,
        showSocial: false,
        links: [
          { label: "Order online", target: { kind: "order" as const } },
          { label: "Menu", target: { kind: "menu" as const } },
        ],
      },
    },
  };
}

function shell(locationId: string, body: PageDocument["sections"], title: string): PageDocument {
  const { header, footer } = frame(locationId);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sections: [header, ...body, footer] as PageDocument["sections"],
    seo: { title },
    settings: {},
  };
}

/** A page that is mostly words — About, Our Story, a policy. */
function article({ locationId, title }: PageTemplateOptions): PageDocument {
  return shell(
    locationId,
    [
      {
        id: "s_tpl_hero",
        kind: "hero",
        props: {
          variant: "bistro",
          heading: title,
          subheading: "One sentence telling guests what this page is about.",
          overlayOpacity: 40,
          primaryCta: { label: "Order Online", target: { kind: "order" } },
        },
      },
      {
        id: "s_tpl_body",
        kind: "content",
        props: {
          background: "none",
          media: "none",
          alignment: "right",
          title: "Tell your story",
          subtitle:
            "Guests choosing between you and somewhere else read this page, so be concrete — a year, a family name, a dish you refuse to change.",
          button: { label: "Contact us", target: { kind: "contact" } },
        },
      },
    ] as PageDocument["sections"],
    title,
  );
}

/** A page that is mostly food — a landing page for a menu or an offer. */
function showcase({ locationId, title }: PageTemplateOptions): PageDocument {
  return shell(
    locationId,
    [
      {
        id: "s_tpl_hero",
        kind: "hero",
        props: {
          variant: "classic",
          heading: title,
          subheading: "A short line about what guests will find here.",
          overlayOpacity: 45,
          primaryCta: { label: "Order Online", target: { kind: "order" } },
          secondaryCta: { label: "See the menu", target: { kind: "menu" } },
        },
      },
      {
        id: "s_tpl_popular",
        kind: "popular-items",
        props: {
          heading: "See our most popular items",
          subheading: "A sneak peek at the dishes guests cannot stop talking about.",
          // Empty on purpose: the merchant picks the dishes. The section renders
          // its own prompt in the builder rather than inventing a selection.
          items: [],
          layout: "grid-3",
          showPrices: true,
          showDescriptions: true,
          cta: { label: "See full menu", target: { kind: "menu" } },
        },
      },
      {
        id: "s_tpl_features",
        kind: "features",
        props: {
          heading: "Featuring",
          items: [
            { title: "Delivery", icon: "Truck" },
            { title: "Takeout", icon: "UtensilsCrossed" },
            { title: "Dine In", icon: "House" },
            { title: "Catering", icon: "ShoppingBag" },
          ],
          iconTone: "brand",
        },
      },
      {
        id: "s_tpl_body",
        kind: "content",
        props: {
          background: "none",
          media: "none",
          alignment: "left",
          title: "About this page",
          subtitle: "Add a sentence here, or remove this section if the food says enough.",
        },
      },
    ] as PageDocument["sections"],
    title,
  );
}

/**
 * The required page frame with an empty body.
 *
 * Matches Owner's Blank exactly — the frame renders, the body is empty, and the
 * merchant builds from `Add Section`. The hero remains because it is a locked,
 * required section and cannot be added from the section catalogue.
 */
function blank({ locationId, title }: PageTemplateOptions): PageDocument {
  return shell(
    locationId,
    [
      {
        id: "s_tpl_hero",
        kind: "hero",
        props: {
          variant: "classic",
          heading: title,
          overlayOpacity: 35,
        },
      },
    ] as PageDocument["sections"],
    title,
  );
}
