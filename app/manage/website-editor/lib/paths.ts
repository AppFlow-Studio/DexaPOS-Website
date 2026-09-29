/**
 * URL helpers shared by the website editor's screens.
 *
 * A page's route (`/pricing`, `/`) travels in the editor URL as one encoded
 * segment; the home page, whose route is empty once the slash is stripped,
 * travels as `root`.
 */

export function routeToSlug(route: string) {
  return route.replace(/^\/+/, "") || "root";
}

export function pageEditorHref(route: string) {
  return `/manage/website-editor/pages/${encodeURIComponent(routeToSlug(route))}`;
}

/** The public page with the CMS preview flag, which also shows drafts. */
export function pagePreviewHref(route: string) {
  return `${route === "/" ? "/" : route}?cmsPreview=1`;
}

export const WEBSITE_EDITOR_HOME = "/manage/website-editor";
