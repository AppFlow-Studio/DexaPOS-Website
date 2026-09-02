import { describe, expect, it } from "vitest";

import {
  PUBLIC_STOREFRONT_API_PREFIXES,
  isPublicStorefrontApiPath,
} from "../public-api-paths";

/**
 * The rule that decides whether an API call made from a storefront host reaches
 * its route handler or is rewritten into the storefront's page tree.
 *
 * Worth its own test because both ways of getting it wrong are invisible in
 * development on `localhost:3000` — where no rewrite happens at all — and both
 * are serious. Too narrow and a guest is told "We could not load times just
 * now" on every published site; too wide and gated app endpoints become
 * reachable on a customer-facing domain.
 */
describe("isPublicStorefrontApiPath", () => {
  it("exempts the whole public booking flow", () => {
    for (const path of [
      "/api/site-reservations/availability",
      "/api/site-reservations/hold",
      "/api/site-reservations/book",
      "/api/site-reservations/cancel",
    ]) {
      expect(isPublicStorefrontApiPath(path), path).toBe(true);
    }
  });

  it("exempts a published site's form submissions", () => {
    expect(isPublicStorefrontApiPath("/api/site-forms/submit")).toBe(true);
  });

  /**
   * The reason this is not a `startsWith` on the bare prefix. `/api/site-formsx`
   * is a different route entirely and must not inherit an exemption written for
   * `/api/site-forms`.
   */
  it("matches on a segment boundary, not a string prefix", () => {
    expect(isPublicStorefrontApiPath("/api/site-formsx/submit")).toBe(false);
    expect(isPublicStorefrontApiPath("/api/site-reservations-internal/x")).toBe(false);
    expect(isPublicStorefrontApiPath("/api/site-forms")).toBe(true);
  });

  /**
   * Everything else keeps being rewritten, and therefore keeps 404ing on a
   * storefront host. That is the property that stops a merchant's own domain
   * from becoming a second front door to the app's authenticated API.
   */
  it("exempts nothing else, gated or public", () => {
    for (const path of [
      "/api/dashboard/orders",
      "/api/valor/passage-callback",
      "/api/internal/resync",
      "/api/cms/pages",
      "/api/contact",
      "/api/marketing/unsubscribe",
      "/api",
      "/",
      "/reservations",
      "/sites/joes/api/site-forms/submit",
    ]) {
      expect(isPublicStorefrontApiPath(path), path).toBe(false);
    }
  });

  /**
   * A guard on the list itself: every prefix has to be a rooted `/api` path, or
   * the segment-boundary match silently stops meaning what it says.
   */
  it("keeps every prefix an absolute /api path with no trailing slash", () => {
    for (const prefix of PUBLIC_STOREFRONT_API_PREFIXES) {
      expect(prefix.startsWith("/api/"), prefix).toBe(true);
      expect(prefix.endsWith("/"), prefix).toBe(false);
    }
  });
});
