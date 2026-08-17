/**
 * Every URL in the Website surface, in one place.
 *
 * The Owner-shaped rebuild moves three routes — the editor from
 * `/builder?page=` to `/pages/{id}`, style from `/design` to `/style`, and the
 * landing screen from `/website` to `/website/pages`. Those moves land in
 * different phases from the screens that link to them, so every href goes
 * through here and each move is one line rather than a grep across the feature.
 *
 * `location` stays a query parameter throughout, matching both the existing
 * dashboard convention and Owner's own `?locationId=`.
 */

const q = encodeURIComponent;

export const websiteRoutes = {
  /** The landing screen. */
  pages: (locationId?: string) =>
    locationId ? `/dashboard/website/pages?location=${q(locationId)}` : "/dashboard/website/pages",

  /** Creating a page: template picker. */
  newPage: (locationId: string) => `/dashboard/website/pages/new?location=${q(locationId)}`,

  /**
   * The page editor. `home` resolves to the merchant's home page, which is the
   * right answer when a caller has a location but not a page.
   */
  editor: (locationId: string, pageId?: string) =>
    `/dashboard/website/pages/${q(pageId ?? "home")}?location=${q(locationId)}`,

  /** Site-wide style. */
  style: (locationId: string) => `/dashboard/website/style?location=${q(locationId)}`,

  /** Full-page render of the current draft. */
  preview: (locationId: string, pageId?: string) => {
    const base = `/dashboard/website/preview?location=${q(locationId)}`;
    return pageId ? `${base}&page=${q(pageId)}` : base;
  },
};
