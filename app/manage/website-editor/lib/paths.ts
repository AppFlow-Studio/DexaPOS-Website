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

/**
 * The editor for one page. `back` is the pages list's own query (search,
 * filters, page), so "Back to Pages" returns to the same page of 10 (§5.9).
 */
export function pageEditorHref(route: string, back?: string) {
  const href = `/manage/website-editor/pages/${encodeURIComponent(routeToSlug(route))}`;
  return back ? `${href}?back=${encodeURIComponent(back)}` : href;
}

/** The pages list, restored from the query the editor was opened with. */
export function pagesListHref(back?: string | null) {
  return back ? `${WEBSITE_EDITOR_HOME}?${back}` : WEBSITE_EDITOR_HOME;
}

/** The public page with the CMS preview flag, which also shows drafts. */
export function pagePreviewHref(route: string) {
  return `${route === "/" ? "/" : route}?cmsPreview=1`;
}

export const WEBSITE_EDITOR_HOME = "/manage/website-editor";
