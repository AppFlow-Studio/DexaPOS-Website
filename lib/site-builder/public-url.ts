/**
 * Where a built site lives on the public internet.
 *
 * The domain was written out by hand in four places — the builder page, the web
 * address card, the overview checklist and a doc comment — which is three too
 * many for a string that decides what a canonical URL points at. Centralised
 * here so a future custom-domain feature has one place to change.
 */

/** The address a deployment falls back to when nothing configures one. */
const DEFAULT_SITE_DOMAIN = "dexaposai.com";

/**
 * The configured root host, split into the domain and the scheme it implies.
 *
 * Exported for its own sake so the parsing is testable without reaching into
 * the environment, which module-level constants make awkward.
 *
 * **`http` for anything local.** A `https://joes.localhost:3000` link does not
 * connect, so a hardcoded scheme makes every generated URL useless in
 * development — which is precisely the failure this function exists to fix.
 */
export function resolveSiteHost(rootDomain: string | undefined): {
  domain: string;
  protocol: "http" | "https";
} {
  const raw = (rootDomain ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .split("/")[0]
    .toLowerCase();

  if (!raw) return { domain: DEFAULT_SITE_DOMAIN, protocol: "https" };

  const bare = raw.split(":")[0];
  const local = bare === "localhost" || bare.endsWith(".localhost") || bare === "127.0.0.1";

  return { domain: raw, protocol: local ? "http" : "https" };
}

/**
 * The parent domain every brand subdomain hangs off.
 *
 * Read from `NEXT_PUBLIC_ROOT_DOMAIN`, the same variable `proxy.ts` routes on
 * and `use-storefront-path.ts` reads — not a second literal beside them. It was
 * a literal, and the cost was concrete: every View link, every canonical URL and
 * every JSON-LD `url` emitted by a staging or development deployment pointed at
 * **production**, where that merchant does not exist. Following one landed on
 * the DexaPOS marketing page.
 */
const { domain: SITE_DOMAIN_RESOLVED, protocol: SITE_PROTOCOL_RESOLVED } = resolveSiteHost(
  process.env.NEXT_PUBLIC_ROOT_DOMAIN,
);

export const SITE_DOMAIN = SITE_DOMAIN_RESOLVED;

/** `https` everywhere except a local host, which has no certificate. */
export const SITE_PROTOCOL = SITE_PROTOCOL_RESOLVED;

/** `https://{subdomain}.dexaposai.com` — the origin a built site is served at. */
export function siteOrigin(subdomain: string): string {
  return `${SITE_PROTOCOL}://${subdomain}.${SITE_DOMAIN}`;
}

/**
 * The brand subdomain a request's Host header addresses, or null.
 *
 * Lives here rather than in `proxy.ts` so the routing layer and the links the
 * dashboard hands out are reading one definition of "which host is a brand
 * site". They were two, and two is how a link gets built for an address the
 * router does not recognise.
 *
 * Returns null for the root domain itself, for a reserved infrastructure name,
 * and for anything nested deeper than one label — `a.b.dexaposai.com` is not a
 * brand site, and treating it as one would hand a wildcard certificate's worth
 * of hosts to a database lookup.
 */
/**
 * Names the router will not treat as a brand site.
 *
 * Exported because `RESERVED_SUBDOMAINS` — what a merchant may claim — has to
 * stay a superset of it, and a test enforces that. A name the claim list
 * allowed and this one refused would be an address a merchant could buy
 * signage for and never reach.
 */
export const RESERVED_HOSTS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "cdn",
  "assets",
  "static",
]);

export function brandSubdomainFromHost(host: string, domain: string = SITE_DOMAIN): string | null {
  const hostname = host.trim().toLowerCase().split(":")[0];
  const root = domain.split(":")[0];

  if (!hostname || hostname === root) return null;

  const suffix = `.${root}`;
  if (!hostname.endsWith(suffix)) return null;

  const subdomain = hostname.slice(0, -suffix.length);
  // One label only, and never an infrastructure name.
  if (!subdomain || subdomain.includes(".")) return null;
  if (RESERVED_HOSTS.has(subdomain)) return null;

  return subdomain;
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
