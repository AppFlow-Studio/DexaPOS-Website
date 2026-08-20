/**
 * `Restaurant` structured data for a built page.
 *
 * Why it earns its place on a restaurant site specifically: this is what puts
 * opening hours, the phone number and the map pin into a Google result directly,
 * rather than leaving a searcher to click through and hunt. The storefront
 * template has emitted it since before the builder existed
 * ([app/sites/[slug]/page.tsx](../../app/sites/[slug]/page.tsx)); a built page
 * returned from the routing fork *above* that code and so emitted none, which
 * meant moving to the website builder silently downgraded a merchant's search
 * presence.
 *
 * Pure, and separate from the renderer, because the rules about what may be
 * claimed are the interesting part and they deserve tests without a database.
 */

import type { ResolvedLocation } from "./bindings/resolved";
import type { SiteBrand } from "./site-settings";

const DAY_SCHEMA: Record<string, string> = {
  monday: "https://schema.org/Monday",
  tuesday: "https://schema.org/Tuesday",
  wednesday: "https://schema.org/Wednesday",
  thursday: "https://schema.org/Thursday",
  friday: "https://schema.org/Friday",
  saturday: "https://schema.org/Saturday",
  sunday: "https://schema.org/Sunday",
};

interface OpeningHoursSpec {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string;
  opens: string;
  closes: string;
}

/**
 * `locations.business_hours` → schema.org opening hours.
 *
 * Reads the raw column rather than `parseBusinessHours`, whose output is
 * display-ready text ("9:00 AM – 5:00 PM"). Parsing that back into 24-hour
 * times to satisfy a machine format would be a lossy round trip through a
 * string meant for humans.
 */
export function buildOpeningHoursSpec(raw: unknown): OpeningHoursSpec[] | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

  const hours = raw as Record<
    string,
    { enabled?: boolean; from?: string; to?: string; is24Hours?: boolean } | undefined
  >;

  const out: OpeningHoursSpec[] = [];
  for (const [day, schemaDay] of Object.entries(DAY_SCHEMA)) {
    const entry = hours[day];
    if (!entry?.enabled) continue;
    out.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: schemaDay,
      opens: entry.is24Hours ? "00:00" : (entry.from ?? "09:00"),
      closes: entry.is24Hours ? "23:59" : (entry.to ?? "21:00"),
    });
  }

  return out.length ? out : undefined;
}

export interface RestaurantJsonLdInput {
  /** The restaurant's name, as the site presents it. */
  name: string;
  /** Absolute canonical URL of this page. */
  url: string;
  description?: string | null;
  /** Absolute URL of a logo or hero image, or null. */
  image?: string | null;
  /**
   * The single location this page is about, or null.
   *
   * Null on a brand page covering several branches. A `Restaurant` node with a
   * name but no address is still worth emitting — it associates the site with
   * the business — whereas one branch's address on a page about all of them
   * would be a claim the page does not make.
   */
  location: ResolvedLocation | null;
  /**
   * The merchant's brand settings, if any.
   *
   * This is where structured data stops being a restatement of the page and
   * starts being worth emitting: `servesCuisine` and `priceRange` are two of
   * the fields a search engine uses to decide whether a restaurant belongs in
   * "cheap Thai near me", and neither appears anywhere in a page document. A
   * merchant types them once on the settings screen and every page carries them.
   */
  brand?: SiteBrand;
  /**
   * Whether the reservation link may be claimed.
   *
   * The link alone is not enough: a merchant may have pasted one and then
   * turned Reservations off, and `acceptsReservations: true` on a restaurant
   * that has stopped taking bookings sends guests to a dead end from a Google
   * result — which is worse than saying nothing.
   */
  acceptsReservations?: boolean;
}

/**
 * Builds the JSON-LD object, omitting anything not actually known.
 *
 * Every field is dropped rather than emitted empty: structured data asserting
 * `"telephone": ""` is worse than silence, because it is a claim rather than an
 * absence.
 */
export function buildRestaurantJsonLd(input: RestaurantJsonLdInput): Record<string, unknown> {
  const { name, url, description, image, location, brand, acceptsReservations } = input;

  const address =
    location?.addressLine1
      ? {
          "@type": "PostalAddress",
          streetAddress: location.addressLine1,
          addressLocality: location.city ?? undefined,
          addressRegion: location.state ?? undefined,
          postalCode: location.postalCode ?? undefined,
        }
      : undefined;

  const geo =
    location?.latitude != null && location?.longitude != null
      ? { "@type": "GeoCoordinates", latitude: location.latitude, longitude: location.longitude }
      : undefined;

  const raw: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name,
    url,
    description: description?.trim() || undefined,
    image: image || undefined,
    telephone: location?.phone || undefined,
    address,
    geo,
    openingHoursSpecification: location ? buildOpeningHoursSpec(location.businessHours) : undefined,

    // A single cuisine is emitted as a string rather than a one-element array:
    // both are valid schema.org, and the scalar is what every example in
    // Google's own documentation uses.
    servesCuisine:
      brand?.cuisines.length === 1
        ? brand.cuisines[0]
        : brand?.cuisines.length
          ? brand.cuisines
          : undefined,
    priceRange: brand?.priceRange,

    // `sameAs` is how a search engine ties this website to the restaurant's
    // Instagram and its Yelp page — the mechanism behind a knowledge panel
    // showing the right social accounts.
    sameAs: brand?.social.length ? brand.social.map((link) => link.url) : undefined,

    // Only claimed when the merchant has both switched reservations on and said
    // where they happen. `false` is not emitted: "we do not take reservations"
    // is a claim we have no basis for either, since the merchant may simply
    // never have opened the settings screen.
    ...(acceptsReservations && brand?.reservationUrl
      ? {
          acceptsReservations: true,
          potentialAction: {
            "@type": "ReserveAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: brand.reservationUrl,
              inLanguage: "en",
              actionPlatform: [
                "http://schema.org/DesktopWebPlatform",
                "http://schema.org/MobileWebPlatform",
              ],
            },
            result: { "@type": "FoodEstablishmentReservation", name: "Reserve a table" },
          },
        }
      : {}),
  };

  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== null));
}

/**
 * Picks the one location a page can honestly claim to be about.
 *
 * A page bound to exactly one location is about that restaurant, whatever its
 * `site_pages.location_id` says — a brand home page with a single Location &
 * Hours section is the common case, and it would be a shame to withhold the
 * address from search results over a technicality. More than one, and there is
 * no single address to give.
 */
export function soleLocation(
  locations: Map<string, { status: string; data?: ResolvedLocation }>,
): ResolvedLocation | null {
  const ok = [...locations.values()].filter((l) => l.status === "ok" && l.data);
  return ok.length === 1 ? (ok[0].data as ResolvedLocation) : null;
}

/**
 * `Event` structured data for one event's detail page.
 *
 * This is what puts a restaurant's trivia night into Google's event results and
 * into the "Events" panel on a business listing — which for a marketing site is
 * a materially bigger prize than the page itself ranking.
 *
 * **Claims only what is true.** `eventAttendanceMode` is always in-person
 * because that is the only kind this product models; `offers` appears only when
 * the merchant supplied a ticket link, and it deliberately carries no price —
 * we do not know it, and inventing `"price": "0"` would advertise a paid event
 * as free.
 */
export function buildEventJsonLd(input: {
  name: string;
  description?: string | null;
  url: string;
  image?: string | null;
  /** ISO 8601 local datetimes, e.g. `2026-08-21T23:00`. */
  startDate: string;
  endDate: string;
  ticketUrl?: string | null;
  location: ResolvedLocation | null;
  /** Falls back to the brand when the event is not pinned to one restaurant. */
  organizerName: string;
}): Record<string, unknown> {
  const place = input.location?.addressLine1
    ? {
        "@type": "Place",
        name: input.organizerName,
        address: {
          "@type": "PostalAddress",
          streetAddress: input.location.addressLine1,
          addressLocality: input.location.city ?? undefined,
          addressRegion: input.location.state ?? undefined,
          postalCode: input.location.postalCode ?? undefined,
        },
      }
    : undefined;

  const raw: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: input.name,
    description: input.description?.trim() || undefined,
    url: input.url,
    image: input.image || undefined,
    startDate: input.startDate,
    endDate: input.endDate,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: place,
    organizer: { "@type": "Organization", name: input.organizerName },
    offers: input.ticketUrl
      ? { "@type": "Offer", url: input.ticketUrl, availability: "https://schema.org/InStock" }
      : undefined,
  };

  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== null));
}
