/**
 * The API paths a published storefront calls from its own host.
 *
 * A storefront is served on a host that is not the app's: `{slug}.dexaposai.com`,
 * a merchant's custom domain, or `{slug}.localhost` in development. The proxy
 * turns every path on such a host into `/sites/{slug}{path}` so the storefront
 * renders — and that rewrite used to catch API calls too, which sent the
 * booking widget's `POST /api/site-reservations/availability` into the
 * storefront's page catch-all. The reply was a 404 HTML page, `res.json()`
 * threw, and every guest was told "We could not load times just now".
 *
 * These paths therefore have to reach their route handlers unrewritten. They
 * are safe to exempt because every one of them is already public, anonymous and
 * self-authorising — rate limited, honeypotted, and scoped by a `siteId` in the
 * body rather than by anything in the path or the Host header.
 *
 * **Deliberately these two prefixes and not `/api`.** Exempting the whole
 * namespace would make every gated app endpoint reachable on a customer-facing
 * host — including a merchant's own domain, where a signed-in staff session's
 * cookie may still travel. Those stay rewritten, and so stay a 404 on a
 * storefront host. A new *public* storefront endpoint has to be added here and
 * to `isPublicApiRoute` in `proxy.ts`: the first decides whether the request
 * reaches the handler, the second whether Clerk lets an anonymous caller past.
 */
export const PUBLIC_STOREFRONT_API_PREFIXES = [
  "/api/site-reservations",
  "/api/site-forms",
] as const;

/**
 * Whether this path is one of them.
 *
 * Matched on a segment boundary, never a bare `startsWith`: `/api/site-formsx`
 * is a different route and must not inherit the exemption.
 */
export function isPublicStorefrontApiPath(pathname: string): boolean {
  return PUBLIC_STOREFRONT_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
