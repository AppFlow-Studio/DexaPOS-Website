/**
 * The document a merchant's first home page starts from.
 *
 * Distinct from `fixtures/demo-page.ts`, which is a *fixture*: it describes
 * Tony's Pizza, wood-fired since 1998, on Union Square. That is exactly right
 * for proving renderers against a realistic document and exactly wrong as
 * someone's actual draft — a merchant who publishes before editing would put a
 * stranger's history on their own website.
 *
 * So the copy here is deliberately neutral and instructive: every string either
 * comes from the merchant's real record or reads as a prompt to replace it. The
 * page is complete and publishable on day one; nothing is a placeholder that
 * renders as an empty box.
 *
 * Structure follows the recommended default order — header, hero, featured
 * menu, features, story, location, FAQ, footer — so the merchant's first
 * experience is replacing words in a credible page rather than assembling one.
 */

import type { PageDocument } from "./page-document";
import { CURRENT_SCHEMA_VERSION } from "./page-document";

export interface StarterPageOptions {
  /** The one restaurant this page is about. Bound live for hours and address. */
  locationId: string;
  /** Real menu item ids, so the featured section is populated from the start. */
  menuItemIds?: string[];
  /** The merchant's own restaurant name, used instead of generic copy. */
  restaurantName?: string;
}

export function createStarterHomePage(options: StarterPageOptions): PageDocument {
  const { locationId, restaurantName } = options;
  const itemIds = options.menuItemIds ?? [];
  const name = restaurantName?.trim() || "our restaurant";

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sections: [
      {
        id: "s_home_header",
        kind: "header",
        props: {
          logoAlign: "left",
          sticky: true,
          showOrderButton: true,
          orderButtonLabel: "Order Online",
          showPhone: true,
          transparentOverHero: false,
        },
      },
      {
        id: "s_home_hero",
        kind: "hero",
        props: {
          variant: "classic",
          heading: `Welcome to ${name}`,
          subheading:
            "Add one sentence about what makes your food worth the trip. Guests read this first.",
          overlayOpacity: 45,
          primaryCta: { label: "Order Online", target: { kind: "order" } },
          secondaryCta: { label: "See the menu", target: { kind: "menu" } },
        },
      },
      {
        id: "s_home_popular",
        kind: "popular-items",
        props: {
          heading: "Guest favorites",
          subheading: "The dishes people come back for.",
          // Bindings, not copies: prices, photos and availability resolve live
          // from the POS, so this section is correct before it is ever edited.
          items: itemIds.slice(0, 6).map((id) => ({ type: "menu_item" as const, id })),
          layout: "grid-3",
          showPrices: true,
          showDescriptions: true,
          cta: { label: "See full menu", target: { kind: "menu" } },
        },
      },
      {
        id: "s_home_features",
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
        id: "s_home_story",
        kind: "content",
        props: {
          background: "none",
          media: "none",
          alignment: "left",
          title: "Our story",
          subtitle:
            "Write a sentence or two about how this restaurant started and who runs it. Keep it concrete — a year, a family name, a dish you refuse to change.",
          button: { label: "Contact us", target: { kind: "contact" } },
        },
      },
      {
        id: "s_home_location",
        kind: "location",
        props: {
          heading: "Find us",
          // Address, hours, phone and map all resolve live from the location
          // record — updating opening hours never requires republishing.
          location: { type: "location", id: locationId },
          showMap: true,
          showHours: true,
          showPhone: true,
          showDirectionsLink: true,
          mapStyle: "roadmap",
        },
      },
      {
        id: "s_home_faq",
        kind: "faq",
        props: {
          heading: "Frequently asked questions",
          items: [
            {
              question: "Do you take reservations?",
              answer: "<p>Replace this with how guests should book a table, or remove the question.</p>",
            },
            {
              question: "Do you cater private events?",
              answer: "<p>Say yes or no, and how much notice you need.</p>",
            },
            {
              question: "Is there parking nearby?",
              answer: "<p>Answer the question guests actually ask you on the phone.</p>",
            },
          ],
          defaultOpenFirst: true,
        },
      },
      {
        id: "s_home_footer",
        kind: "footer",
        props: {
          location: { type: "location", id: locationId },
          showAddress: true,
          showHours: true,
          showPhone: true,
          showSocial: false,
          tagline: "Add a short line guests will remember.",
          links: [
            { label: "Order online", target: { kind: "order" } },
            { label: "Menu", target: { kind: "menu" } },
          ],
        },
      },
    ],
    seo: {
      title: restaurantName?.trim() || "Home",
      description:
        "Write one sentence describing your restaurant for search engines and shared links.",
    },
    settings: {},
  };
}
