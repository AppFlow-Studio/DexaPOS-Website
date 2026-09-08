import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, resetFakeIds, type FakeTables } from "./fake-supabase";

/**
 * `ClaimSubdomain` — the last step between publishing and a visitor.
 *
 * A built site is served only at `{subdomain}.dexaposai.com`, never at a
 * storefront slug, so a merchant without one can publish repeatedly and stay
 * unreachable. These cover the two rules that make the address safe to hand
 * out: it must be a usable hostname, and it must not collide with anything —
 * including another merchant's *ordering* storefront, which is a tenancy
 * boundary rather than a naming clash.
 */

const ORG = "org_a";
const SITE = "site_1";

let tables: FakeTables;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables).client,
}));

vi.mock("@/app/dashboard/actions/audit-logs", () => ({
  LogAuditEvent: vi.fn(async () => undefined),
}));

const { ClaimSubdomain } = await import("../site");

function site() {
  return tables.merchant_sites[0];
}

beforeEach(() => {
  resetFakeIds();
  tables = {
    merchants: [{ id: "merchant_a", clerk_org_id: ORG }],
    merchant_sites: [
      { id: SITE, merchant_id: "merchant_a", subdomain: null, render_mode: "template" },
    ],
  };
});

describe("ClaimSubdomain", () => {
  it("claims a free address", async () => {
    const result = await ClaimSubdomain(ORG, SITE, "joes-coffee");

    expect(result.error).toBeUndefined();
    expect(result.data?.subdomain).toBe("joes-coffee");
    expect(site().subdomain).toBe("joes-coffee");
  });

  it("normalizes case and surrounding whitespace", async () => {
    const result = await ClaimSubdomain(ORG, SITE, "  JoesCoffee  ");

    expect(result.data?.subdomain).toBe("joescoffee");
  });

  it("rejects an address that is not a usable hostname", async () => {
    for (const bad of ["-leading", "trailing-", "has space", "under_score", "ab"]) {
      const result = await ClaimSubdomain(ORG, SITE, bad);
      expect(result.code, `${bad} should be refused`).toBe("invalid_path");
    }
    expect(site().subdomain).toBeNull();
  });

  it("rejects a platform-owned name", async () => {
    const result = await ClaimSubdomain(ORG, SITE, "www");

    expect(result.code).toBe("invalid_path");
    expect(result.error).toMatch(/reserved/i);
  });

  /**
   * Availability is decided by the database, not by a prior SELECT: checking
   * and then writing is a race, and the losing merchant would be told
   * "available" a moment before being told otherwise.
   */
  it("reports a taken address in the merchant's terms, not Postgres's", async () => {
    tables.merchant_sites.push({
      id: "site_2",
      merchant_id: "merchant_b",
      subdomain: "joes-coffee",
    });

    const result = await ClaimSubdomain(ORG, SITE, "joes-coffee");

    expect(result.code).toBe("path_taken");
    expect(result.error).toMatch(/already taken/i);
    expect(result.error).not.toMatch(/duplicate key|constraint/i);
  });

  it("is idempotent when the address is already ours", async () => {
    await ClaimSubdomain(ORG, SITE, "joes-coffee");

    const again = await ClaimSubdomain(ORG, SITE, "joes-coffee");

    expect(again.error).toBeUndefined();
    expect(again.data?.subdomain).toBe("joes-coffee");
  });

  it("replaces an existing address when the merchant changes it", async () => {
    await ClaimSubdomain(ORG, SITE, "joes-coffee");

    const result = await ClaimSubdomain(ORG, SITE, "joes-cafe");

    expect(result.data?.subdomain).toBe("joes-cafe");
    expect(site().subdomain).toBe("joes-cafe");
  });

  it("requires an organization before touching anything", async () => {
    const result = await ClaimSubdomain("", SITE, "joes-coffee");

    expect(result.code).toBe("unauthenticated");
    expect(site().subdomain).toBeNull();
  });
});
