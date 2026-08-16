/**
 * Where a built site lives on the public internet.
 *
 * The domain was written out by hand in four places — the builder page, the web
 * address card, the overview checklist and a doc comment — which is three too
 * many for a string that decides what a canonical URL points at. Centralised
 * here so a future custom-domain feature has one place to change.
 */

/** The parent domain every brand subdomain hangs off. */
export const SITE_DOMAIN = "dexaposai.com";

/** `https://{subdomain}.dexaposai.com` — the origin a built site is served at. */
export function siteOrigin(subdomain: string): string {
  return `https://${subdomain}.${SITE_DOMAIN}`;
}

/**
 * The canonical, absolute URL of one page of a built site.
 *
 * **Always the brand subdomain, never `/sites/{slug}`.** A built site answers at
 * both while the subdomain is also a storefront slug, and search engines given
 * two addresses for one page split its authority between them. The subdomain is
 * the address the merchant chose and the one printed on their menus, so it is
 * the one that gets to be canonical.
 *
 * @param path Page path in storage form — no leading slash, `""` for home.
 */
export function sitePublicUrl(subdomain: string, path: string): string {
  const clean = path.replace(/^\/+/, "");
  return clean ? `${siteOrigin(subdomain)}/${clean}` : siteOrigin(subdomain);
}
