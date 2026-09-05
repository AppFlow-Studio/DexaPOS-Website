/**
 * A complete demo restaurant homepage, as a `PageDocument`.
 *
 * This is what lets Stage 4 be verified **before the Stage 2 migration is
 * applied** — the preview route renders this fixture through the exact same
 * `PageRenderer` the public site will use, so the renderers are proven against
 * a real document without any of the new tables existing.
 *
 * It doubles as the shape a starter template takes (PLAN-06 §4): plain JSON,
 * hydrated with the merchant's real details on apply. Nothing here is a
 * database concept.
 */

import type { PageDocument } from "../page-document";
import { CURRENT_SCHEMA_VERSION } from "../page-document";

export interface DemoPageOptions {
  locationId?: string;
  /** Menu item ids to feature. Real ids render real prices in the preview. */
  menuItemIds?: string[];
}

export function createDemoPage(options: DemoPageOptions = {}): PageDocument {
  const locationId = options.locationId ?? "demo-location";
  const itemIds = options.menuItemIds ?? [];

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sections: [
      {
        id: "s_demo_header",
        kind: "header",
        props: {
          logoAlign: "left",
          sticky: true,
          showOrderButton: true,
          orderButtonLabel: "Order Now",
          showPhone: true,
          transparentOverHero: false,
        },
      },
      {
        id: "s_demo_hero",
        kind: "hero",
        props: {
          variant: "classic",
          heading: "Wood-fired pizza, made the slow way",
          subheading:
            "Neapolitan dough proofed for 48 hours, San Marzano tomatoes, and mozzarella pulled the same morning.",
          overlayOpacity: 45,
          primaryCta: { label: "Order Now", target: { kind: "order" } },
          secondaryCta: { label: "See the menu", target: { kind: "menu" } },
        },
      },
      {
        id: "s_demo_popular",
        kind: "popular-items",
        props: {
          heading: "Guest Favorites",
          subheading: "The dishes people come back for.",
          // Bindings only — every price, photo and availability flag on screen
          // is resolved live. This section is the proof of decision D6.
          items: itemIds.slice(0, 6).map((id) => ({ type: "menu_item" as const, id })),
          layout: "grid-3",
          showPrices: true,
          showDescriptions: true,
          cta: { label: "See full menu", target: { kind: "menu" } },
        },
      },
      {
        id: "s_demo_features",
        kind: "features",
        props: {
          heading: "Why order direct",
          items: [
            {
              title: "Free delivery over $30",
              description: "Straight from our kitchen, no third-party markup.",
              icon: "Truck",
            },
            {
              title: "Open until 11pm",
              description: "Kitchen runs late, seven nights a week.",
              icon: "Clock",
            },
            {
              title: "Local ingredients",
              description: "Produce from the Union Square greenmarket.",
              icon: "Leaf",
            },
          ],
          iconTone: "brand",
        },
      },
      {
        id: "s_demo_content",
        kind: "content",
        props: {
          background: "none",
          media: "none",
          alignment: "left",
          title: "Our story",
          subtitle:
            "We opened in 1998 with one oven and a short menu. Twenty-six years later the menu is still short — we would rather do a few things properly. Everything is made in house.",
          button: { label: "Book a table", target: { kind: "contact" } },
        },
      },
      {
        id: "s_demo_faq",
        kind: "faq",
        props: {
          heading: "Frequently asked questions",
          items: [
            {
              question: "Do you take reservations?",
              answer: "<p>We hold a few tables each night. Call us and we will do our best.</p>",
            },
            {
              question: "Is there gluten-free dough?",
              answer:
                "<p>Yes — ask when ordering. It is made in the same kitchen, so we cannot promise zero cross-contact.</p>",
            },
            {
              question: "Do you cater?",
              answer: "<p>We do. Get in touch at least a week ahead for parties over twenty.</p>",
            },
          ],
          defaultOpenFirst: true,
        },
      },
      {
        id: "s_demo_location",
        kind: "location",
        props: {
          heading: "Find us",
          // A binding: address, phone, hours and coordinates all resolve live and
          // reach the published page immediately, with no republish.
          location: { type: "location", id: locationId },
          showMap: true,
          showHours: true,
          showPhone: true,
          showDirectionsLink: true,
          mapStyle: "roadmap",
        },
      },
      {
        id: "s_demo_footer",
        kind: "footer",
        props: {
          location: { type: "location", id: locationId },
          showAddress: true,
          showHours: true,
          showPhone: true,
          showSocial: false,
          tagline: "Wood-fired since 1998.",
          links: [
            { label: "Order online", target: { kind: "order" } },
            { label: "Menu", target: { kind: "menu" } },
          ],
        },
      },
    ],
    seo: {
      title: "Tony's Pizza — Wood-fired Neapolitan in Brooklyn",
      description:
        "Wood-fired Neapolitan pizza in Williamsburg. Order online for pickup or delivery, open until 11pm every night.",
    },
    settings: {},
  };
}
