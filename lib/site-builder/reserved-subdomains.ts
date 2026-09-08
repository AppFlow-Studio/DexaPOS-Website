/**
 * Subdomains a merchant may not claim as their website address.
 *
 * A brand site is addressed as `{subdomain}.dexaposai.com`, and `proxy.ts`
 * turns that first label into the single key everything downstream routes on.
 * Two consequences make this a correctness guard rather than a naming policy:
 *
 *  - `proxy.ts` refuses to treat certain labels as store subdomains at all, so a
 *    merchant who claimed `www` would own an address that can never resolve.
 *    Those labels must be rejected at claim time or the failure surfaces much
 *    later, as "my website doesn't work".
 *  - The label shares one namespace with `online_store_config.slug`. Collisions
 *    across the two are refused by trigger in the database (a merchant answering
 *    on another merchant's storefront address is a tenancy break, not a clash),
 *    so this list only has to cover platform-owned names.
 *
 * Kept in application code rather than as a DB CHECK, matching
 * `reserved-paths.ts`: the list grows as the platform adds hostnames, and a
 * migration per hostname is the wrong trade. The *format* is a CHECK, and
 * `SUBDOMAIN_FORMAT` below mirrors it with a test asserting they agree.
 */

/**
 * Labels the platform owns.
 *
 * The first group must stay a superset of `proxy.ts`'s own RESERVED set — a
 * test asserts it, because a name this list allows and the proxy refuses is an
 * address that silently 404s.
 */
export const RESERVED_SUBDOMAINS: readonly string[] = [
  // Mirrors proxy.ts RESERVED — these never reach store resolution.
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "cdn",
  "assets",
  "static",
  // Product surfaces and things that will become hostnames.
  "dashboard",
  "manage",
  "sites",
  "site",
  "auth",
  "login",
  "account",
  "billing",
  "support",
  "help",
  "docs",
  "status",
  "blog",
  "dev",
  "staging",
  "test",
  "demo",
  "internal",
  "mx",
  "smtp",
  "ftp",
  "ns1",
  "ns2",
];

/**
 * Mirrors the `merchant_sites_subdomain_format` CHECK constraint.
 *
 * DNS label rules, which are stricter than the page-path rules because this
 * ends up in a hostname: 3–63 characters, lowercase alphanumerics and hyphens,
 * and it must both start and end with an alphanumeric.
 */
export const SUBDOMAIN_FORMAT = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export const MIN_SUBDOMAIN_LENGTH = 3;
export const MAX_SUBDOMAIN_LENGTH = 63;

export type SubdomainRejection = "reserved" | "invalid_characters" | "too_short" | "too_long";

export interface SubdomainCheck {
  ok: boolean;
  reason?: SubdomainRejection;
  message?: string;
}

/**
 * Validates a proposed website address.
 *
 * Deliberately does not accept `''` as "unset" — clearing an address is a
 * different operation from choosing one, and conflating them is how a merchant
 * takes their own site offline by submitting an empty form field.
 */
export function checkSubdomain(rawSubdomain: string): SubdomainCheck {
  const subdomain = rawSubdomain.trim().toLowerCase();

  if (subdomain.length < MIN_SUBDOMAIN_LENGTH) {
    return {
      ok: false,
      reason: "too_short",
      message: `Web addresses need at least ${MIN_SUBDOMAIN_LENGTH} characters.`,
    };
  }

  if (subdomain.length > MAX_SUBDOMAIN_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      message: `Web addresses can be at most ${MAX_SUBDOMAIN_LENGTH} characters.`,
    };
  }

  if (!SUBDOMAIN_FORMAT.test(subdomain)) {
    return {
      ok: false,
      reason: "invalid_characters",
      message:
        "Use lowercase letters, numbers and hyphens, starting and ending with a letter or number — for example, joes-coffee.",
    };
  }

  if (RESERVED_SUBDOMAINS.includes(subdomain)) {
    return {
      ok: false,
      reason: "reserved",
      message: `"${subdomain}" is reserved. Try another web address.`,
    };
  }

  return { ok: true };
}

/**
 * Best-effort conversion of a restaurant name into a usable address. Returns
 * `''` when nothing valid survives, which callers should treat as "ask the
 * merchant" rather than as a name to save.
 */
export function slugifySubdomain(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SUBDOMAIN_LENGTH)
    // A trailing hyphen can reappear after the length cut.
    .replace(/-+$/g, "");

  return checkSubdomain(slug).ok ? slug : "";
}
