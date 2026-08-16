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
}

/**
 * Builds the JSON-LD object, omitting anything not actually known.
 *
 * Every field is dropped rather than emitted empty: structured data asserting
 * `"telephone": ""` is worse than silence, because it is a claim rather than an
 * absence.
 */
export function buildRestaurantJsonLd(input: RestaurantJsonLdInput): Record<string, unknown> {
  const { name, url, description, image, location } = input;

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
