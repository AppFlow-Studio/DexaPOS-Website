import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, resetFakeIds, type FakeTables } from "./fake-supabase";

/**
 * Page CRUD — `ListPages`, `CreatePage`, `RenamePage`, `DeletePage`.
 *
 * These actions have been written, correct, and unreachable: nothing in the UI
 * calls them, so every rule below has only ever been enforced by reading the
 * code. Plan item W3 wires them to real buttons, at which point a merchant can
 * reach the home-page and reserved-path guards for the first time. Covering
 * them now means that work starts from a known-good base rather than
 * discovering the rules by breaking them.
 */

const MERCHANT = "merchant_a";
const SITE = "site_1";
const ORG = "org_a";

let tables: FakeTables;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables).client,
}));

vi.mock("@/app/dashboard/actions/audit-logs", () => ({
  LogAuditEvent: vi.fn(async () => undefined),
}));

const { ListPages, CreatePage, RenamePage, DeletePage, GetHomePage } = await import("../pages");

function homePage() {
  return tables.site_pages.find((row) => row.is_home)!;
}

beforeEach(() => {
  resetFakeIds();
  tables = {
    merchant_sites: [{ id: SITE, merchant_id: MERCHANT, max_pages: null }],
    site_pages: [
      {
        id: "page_home",
        site_id: SITE,
        merchant_id: MERCHANT,
        location_id: null,
        title: "Home",
        path: "",
        is_home: true,
        status: "published",
        revision: 2,
        draft_content: { schemaVersion: 1, sections: [], seo: {}, settings: {} },
        published_version_id: "version_1",
        published_at: "2026-08-01T00:00:00.000Z",
      },
    ],
  };
});

describe("CreatePage", () => {
  it("derives an address from the title when none is given", async () => {
    const result = await CreatePage(ORG, SITE, { title: "Our Story" });

    expect(result.error).toBeUndefined();
    expect(result.data?.path).toBe("our-story");
    expect(result.data?.title).toBe("Our Story");
    expect(result.data?.is_home).toBe(false);
  });

  it("inherits the site's merchant rather than trusting a caller", async () => {
    const result = await CreatePage(ORG, SITE, { title: "Contact" });

    expect(result.data?.merchant_id).toBe(MERCHANT);
  });

  it("makes a brand page when no location is given, and a location page when one is", async () => {
    const brand = await CreatePage(ORG, SITE, { title: "About" });
    const branch = await CreatePage(ORG, SITE, { title: "Downtown", locationId: "loc_1" });

    // NULL is what lets `canShowPrices` refuse to guess at a price before the
    // visitor has picked a branch.
    expect(brand.data?.location_id).toBeNull();
    expect(branch.data?.location_id).toBe("loc_1");
  });

  it("refuses a reserved address that online ordering already owns", async () => {
    const result = await CreatePage(ORG, SITE, { title: "Checkout", path: "checkout" });

    expect(result.code).toBe("invalid_path");
    expect(tables.site_pages).toHaveLength(1);
  });

  it("refuses a title that cannot become an address", async () => {
    const result = await CreatePage(ORG, SITE, { title: "!!!" });

    expect(result.code).toBe("invalid_path");
  });

  it("refuses an empty title", async () => {
    const result = await CreatePage(ORG, SITE, { title: "   " });

    expect(result.code).toBe("invalid_path");
  });

  it("reports a taken address as such, not as a database error", async () => {
    await CreatePage(ORG, SITE, { title: "Our Story" });
    const again = await CreatePage(ORG, SITE, { title: "Our Story" });

    expect(again.code).toBe("path_taken");
    expect(again.error).toMatch(/already uses that address/i);
  });

  it("rejects an unknown site", async () => {
    const result = await CreatePage(ORG, "site_missing", { title: "Our Story" });

    expect(result.code).toBe("site_not_found");
  });

  it("enforces a page quota when the plan sets one", async () => {
    tables.merchant_sites[0].max_pages = 2;

    const second = await CreatePage(ORG, SITE, { title: "About" });
    const third = await CreatePage(ORG, SITE, { title: "Contact" });

    expect(second.error).toBeUndefined();
    expect(third.code).toBe("page_limit_reached");
    expect(third.error).toMatch(/includes 2 pages/);
  });

  it("requires an organization", async () => {
    const result = await CreatePage("", SITE, { title: "Our Story" });

    expect(result.code).toBe("unauthenticated");
    expect(tables.site_pages).toHaveLength(1);
  });
});

describe("RenamePage", () => {
  it("renames without touching the address", async () => {
    const created = await CreatePage(ORG, SITE, { title: "Our Story" });

    const result = await RenamePage(ORG, created.data!.id, { title: "Our History" });

    expect(result.data?.title).toBe("Our History");
    expect(result.data?.path).toBe("our-story");
  });

  /**
   * The home page's address is structural, not editorial: it is the site root,
   * and moving it would break every published link at once.
   */
  it("refuses to move the home page", async () => {
    const result = await RenamePage(ORG, "page_home", { path: "welcome" });

    expect(result.code).toBe("invalid_path");
    expect(result.error).toMatch(/home page address cannot be changed/i);
    expect(homePage().path).toBe("");
  });

  it("still allows the home page to be retitled", async () => {
    const result = await RenamePage(ORG, "page_home", { title: "Welcome" });

    expect(result.error).toBeUndefined();
    expect(homePage().title).toBe("Welcome");
    expect(homePage().path).toBe("");
  });

  it("refuses a reserved address", async () => {
    const created = await CreatePage(ORG, SITE, { title: "Our Story" });

    const result = await RenamePage(ORG, created.data!.id, { path: "cart" });

    expect(result.code).toBe("invalid_path");
  });

  it("is a no-op when given nothing to change", async () => {
    const result = await RenamePage(ORG, "page_home", {});

    expect(result.error).toBeUndefined();
    expect(result.data?.title).toBe("Home");
  });

  it("reports a missing page", async () => {
    const result = await RenamePage(ORG, "page_missing", { title: "Anything" });

    expect(result.code).toBe("page_not_found");
  });
});

describe("DeletePage", () => {
  it("archives rather than destroying, and drops the published pointer", async () => {
    const created = await CreatePage(ORG, SITE, { title: "Our Story" });
    const id = created.data!.id;
    const row = tables.site_pages.find((p) => p.id === id)!;
    row.published_version_id = "version_9";
    row.published_at = "2026-08-10T00:00:00.000Z";

    const result = await DeletePage(ORG, id);

    expect(result.data?.id).toBe(id);
    // Still present: a hard delete would take the version history with it.
    expect(row.status).toBe("archived");
    expect(row.published_version_id).toBeNull();
    expect(row.published_at).toBeNull();
  });

  it("refuses to delete the home page", async () => {
    const result = await DeletePage(ORG, "page_home");

    expect(result.code).toBe("not_deletable");
    expect(homePage().status).toBe("published");
  });

  it("reports a missing page", async () => {
    const result = await DeletePage(ORG, "page_missing");

    expect(result.code).toBe("page_not_found");
  });
});

describe("ListPages", () => {
  it("lists home first and hides archived pages", async () => {
    const created = await CreatePage(ORG, SITE, { title: "Our Story" });
    await CreatePage(ORG, SITE, { title: "Contact" });
    await DeletePage(ORG, created.data!.id);

    const result = await ListPages(ORG, SITE);

    expect(result.data?.map((p) => p.title)).toEqual(["Home", "Contact"]);
  });

  it("frees a path once the page using it is archived", async () => {
    const created = await CreatePage(ORG, SITE, { title: "Our Story" });
    await DeletePage(ORG, created.data!.id);

    const again = await CreatePage(ORG, SITE, { title: "Our Story" });

    expect(again.error).toBeUndefined();
  });
});

describe("GetHomePage", () => {
  it("returns the site's home page", async () => {
    const result = await GetHomePage(ORG, SITE);

    expect(result.data?.id).toBe("page_home");
  });

  it("reports a site with no home page rather than returning nothing", async () => {
    tables.site_pages = [];

    const result = await GetHomePage(ORG, SITE);

    expect(result.code).toBe("page_not_found");
  });
});
