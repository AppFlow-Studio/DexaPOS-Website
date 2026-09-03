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

  /**
   * Brand settings — the toggles and facts every page reads.
   *
   * Takes an optional location because it is linked to from inside the editor,
   * which may be on a page with no location of its own; the screen itself is
   * merchant-wide and only uses the parameter to resolve a storefront.
   */
  settings: (locationId?: string) =>
    locationId
      ? `/dashboard/website/settings?location=${q(locationId)}`
      : "/dashboard/website/settings",

  /**
   * Marketing pixels. Named `tracking` rather than `analytics` because it shows
   * no data — decision W6, and the one place this plan deliberately departs
   * from Owner's own naming.
   */
  tracking: (locationId?: string) =>
    locationId
      ? `/dashboard/website/tracking?location=${q(locationId)}`
      : "/dashboard/website/tracking",

  /** The events list. */
  events: (locationId?: string) =>
    locationId
      ? `/dashboard/website/events?location=${q(locationId)}`
      : "/dashboard/website/events",

  /** The forms list. Forms are brand-level, so no location is required. */
  forms: (locationId?: string) =>
    locationId
      ? `/dashboard/website/forms?location=${q(locationId)}`
      : "/dashboard/website/forms",

  /** The form builder — the page editor's shell, editing a form. */
  formEditor: (formId: string, locationId?: string) =>
    locationId
      ? `/dashboard/website/forms/${q(formId)}?location=${q(locationId)}`
      : `/dashboard/website/forms/${q(formId)}`,

  /** One form's submissions. */
  formSubmissions: (formId: string, locationId?: string) =>
    locationId
      ? `/dashboard/website/forms/${q(formId)}/submissions?location=${q(locationId)}`
      : `/dashboard/website/forms/${q(formId)}/submissions`,

  /** Full-page render of the current draft. */
  preview: (locationId: string, pageId?: string) => {
    const base = `/dashboard/website/preview?location=${q(locationId)}`;
    return pageId ? `${base}&page=${q(pageId)}` : base;
  },
};
