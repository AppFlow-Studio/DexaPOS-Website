/**
 * The wire contract between a rendered public form and the handler that
 * receives it.
 *
 * One tiny module so the renderer and the route handler cannot disagree about a
 * field name — a mismatch here would not throw, it would silently make the
 * honeypot useless or the redirect never fire, which is exactly the class of
 * bug nobody notices until the spam arrives.
 */

/** Where a public form posts. A route handler, so the form works without JS. */
export const FORM_SUBMIT_PATH = "/api/site-forms/submit";

/**
 * The honeypot field name.
 *
 * Matches `HONEYPOT_FIELD` in `lib/cms/form-security.ts` so the shared `isBot`
 * helper works unchanged — re-declared here rather than imported because that
 * module reaches for a Supabase client at import time, and this one is pulled
 * into a server-rendered section.
 */
export const HONEYPOT_FIELD = "company_website";

/**
 * When the page carrying this form was rendered.
 *
 * Server-stamped at render rather than measured in the browser, because there
 * is no JavaScript on this form to measure with. Spoofable, like the
 * client-side version it replaces — the honeypot is the real filter and this is
 * a soft second signal.
 */
export const RENDERED_AT_FIELD = "rendered_at";

/** A human takes at least this long to fill in a form honestly. */
export const MIN_FILL_MS = 2500;

/** Query parameters the handler redirects back with. */
export const FORM_SUBMITTED_PARAM = "submitted";
export const FORM_ERROR_PARAM = "form_error";
/** Random, non-record identifier used to deduplicate the client-side conversion event on refresh. */
export const FORM_EVENT_PARAM = "form_event";

/**
 * What the page should show for a given form, after a redirect.
 *
 * Returns `undefined` for every form except the one that was posted, so a page
 * carrying two forms confirms only the one the visitor actually sent.
 */
export function formStateFor(
  formId: string,
  params: { submitted?: string | null; error?: string | null } | undefined,
): "submitted" | "error" | undefined {
  if (!params) return undefined;
  if (params.submitted && params.submitted === formId) return "submitted";
  if (params.error && params.error === formId) return "error";
  return undefined;
}
