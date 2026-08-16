import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStarterPage, type PageDocument } from "@/lib/site-builder/page-document";
import {
  createFakeSupabase,
  resetFakeIds,
  type FakeSupabaseOptions,
  type FakeTables,
} from "./fake-supabase";

/**
 * `PublishPage` — the append-only version pipeline.
 *
 * The first tests in this feature to touch a server action. Everything covered
 * here was previously verified by exactly one manual browser run: the version
 * numbering race, the content-hash no-op, and the supersede step all live in
 * the gap between "the unit tests are green" and "a merchant published twice".
 *
 * Tenancy is not tested here and cannot be — every one of these queries selects
 * by `id` alone and relies entirely on RLS, which is the correct design and is
 * proven against a real database by `scripts/verify-site-tenancy.ts`.
 */

const MERCHANT = "merchant_a";
const LOCATION = "loc_1";
const ORG = "org_a";

let tables: FakeTables;
let hooks: FakeSupabaseOptions;
let calls: { table: string; op: string }[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => {
    const fake = createFakeSupabase(tables, hooks);
    calls = fake.calls;
    return fake.client;
  },
}));

vi.mock("@/app/dashboard/actions/audit-logs", () => ({
  LogAuditEvent: vi.fn(async () => undefined),
}));

const { PublishPage, GetPublishedDocument } = await import("../publish");

/**
 * A publishable document, differing only in its hero heading.
 *
 * Built from `createStarterPage` rather than hand-rolled: it is what the
 * product actually creates for a merchant, so these tests cannot drift into
 * passing against a document shape the feature never produces. A hand-written
 * three-section stand-in failed `validatePage` on the footer's location binding
 * — which is the validator doing its job.
 */
function documentWith(heading: string): PageDocument {
  const doc = createStarterPage({ locationId: LOCATION });
  const hero = doc.sections.find((section) => section.kind === "hero");
  if (hero) (hero.props as { heading?: string }).heading = heading;
  return doc;
}

/** The hero heading of whatever document a result carries. */
function headingOf(doc: PageDocument): string | undefined {
  const hero = doc.sections.find((section) => section.kind === "hero");
  return (hero?.props as { heading?: string } | undefined)?.heading;
}

function seed(document: PageDocument = documentWith("Welcome")) {
  tables = {
    merchant_sites: [
      { id: "site_1", merchant_id: MERCHANT, first_published_at: null, last_published_at: null },
    ],
    site_pages: [
      {
        id: "page_1",
        site_id: "site_1",
        merchant_id: MERCHANT,
        location_id: "loc_1",
        title: "Home",
        path: "",
        is_home: true,
        status: "draft",
        revision: 3,
        draft_content: document,
        published_version_id: null,
        published_at: null,
      },
    ],
    site_page_versions: [],
  };
}

function page() {
  return tables.site_pages[0];
}

beforeEach(() => {
  resetFakeIds();
  hooks = {};
  calls = [];
  seed();
});

describe("PublishPage", () => {
  it("appends a version, points the page at it, and leaves the draft alone", async () => {
    const draftBefore = page().draft_content;

    const result = await PublishPage(ORG, "page_1");

    expect(result.error).toBeUndefined();
    expect(result.data?.versionNumber).toBe(1);
    expect(result.data?.unchanged).toBe(false);

    expect(tables.site_page_versions).toHaveLength(1);
    const version = tables.site_page_versions[0];
    expect(version.page_id).toBe("page_1");
    expect(version.site_id).toBe("site_1");
    expect(version.version_number).toBe(1);

    expect(page().published_version_id).toBe(version.id);
    expect(page().status).toBe("published");

    // Publishing takes a snapshot beside the draft; it never consumes it.
    expect(page().draft_content).toEqual(draftBefore);
    expect(page().revision).toBe(3);
  });

  it("numbers versions consecutively across republishes", async () => {
    await PublishPage(ORG, "page_1");

    page().draft_content = documentWith("Second");
    const second = await PublishPage(ORG, "page_1");

    page().draft_content = documentWith("Third");
    const third = await PublishPage(ORG, "page_1");

    expect(second.data?.versionNumber).toBe(2);
    expect(third.data?.versionNumber).toBe(3);
    expect(tables.site_page_versions.map((v) => v.version_number)).toEqual([1, 2, 3]);
  });

  it("supersedes exactly the version that was live", async () => {
    await PublishPage(ORG, "page_1");
    const first = tables.site_page_versions[0];

    page().draft_content = documentWith("Second");
    await PublishPage(ORG, "page_1");
    const second = tables.site_page_versions[1];

    expect(first.superseded_at).toBe(second.published_at);
    expect(second.superseded_at).toBeNull();
  });

  it("never rewrites a published version's content", async () => {
    await PublishPage(ORG, "page_1");
    const original = structuredClone(tables.site_page_versions[0].content);

    page().draft_content = documentWith("Edited after publishing");
    await PublishPage(ORG, "page_1");

    expect(tables.site_page_versions[0].content).toEqual(original);
    expect(tables.site_page_versions).toHaveLength(2);
  });

  describe("the content-hash no-op", () => {
    it("republishing identical content writes nothing new", async () => {
      const first = await PublishPage(ORG, "page_1");
      const again = await PublishPage(ORG, "page_1");

      expect(again.data?.unchanged).toBe(true);
      expect(again.data?.versionId).toBe(first.data?.versionId);
      expect(again.data?.versionNumber).toBe(1);
      expect(tables.site_page_versions).toHaveLength(1);
    });

    /**
     * The reason the hash is computed over sorted keys rather than
     * `JSON.stringify`. Key order is decided by however the document was built
     * and is not something a merchant can see or influence, so letting it
     * create a version would fill the history with entries that say nothing.
     */
    it("is insensitive to property order", async () => {
      await PublishPage(ORG, "page_1");

      const stored = page().draft_content as PageDocument;
      page().draft_content = {
        settings: stored.settings,
        seo: stored.seo,
        sections: stored.sections.map((section) => ({
          props: section.props,
          kind: section.kind,
          id: section.id,
        })),
        schemaVersion: stored.schemaVersion,
      };

      const again = await PublishPage(ORG, "page_1");

      expect(again.data?.unchanged).toBe(true);
      expect(tables.site_page_versions).toHaveLength(1);
    });

    it("a real edit does create a version", async () => {
      await PublishPage(ORG, "page_1");
      page().draft_content = documentWith("Now open on Sundays");

      const again = await PublishPage(ORG, "page_1");

      expect(again.data?.unchanged).toBe(false);
      expect(again.data?.versionNumber).toBe(2);
    });
  });

  it("reports a lost version-number race instead of corrupting history", async () => {
    // A second publisher lands version 1 between this call reading the current
    // maximum and inserting its own — the exact window the unique index exists
    // to close.
    hooks.beforeInsert = (call, store) => {
      if (call.table !== "site_page_versions") return;
      if (store.site_page_versions.length > 0) return;
      store.site_page_versions.push({
        id: "version_rival",
        page_id: "page_1",
        site_id: "site_1",
        merchant_id: MERCHANT,
        version_number: 1,
        content: documentWith("Published by another tab"),
        content_hash: "rival",
        published_at: new Date().toISOString(),
        superseded_at: null,
      });
    };

    const result = await PublishPage(ORG, "page_1");

    expect(result.code).toBe("stale_revision");
    expect(result.error).toMatch(/published somewhere else/i);
    // The rival's version survives untouched and the page is not left pointing
    // at something that was never written.
    expect(tables.site_page_versions).toHaveLength(1);
    expect(tables.site_page_versions[0].id).toBe("version_rival");
    expect(page().published_version_id).toBeNull();
  });

  it("refuses to publish a document that fails validation", async () => {
    page().draft_content = { schemaVersion: 1, sections: [], seo: {}, settings: {} };

    const result = await PublishPage(ORG, "page_1");

    expect(result.code).toBe("invalid_document");
    expect(tables.site_page_versions).toHaveLength(0);
    expect(page().published_version_id).toBeNull();
  });

  it("publishes what is stored, not what a caller claims", async () => {
    // There is no parameter for the document on purpose: only the stored draft
    // has been through `SaveDraft`'s normalization.
    expect(PublishPage.length).toBe(2);

    page().draft_content = documentWith("Only this can go live");
    const result = await PublishPage(ORG, "page_1");

    expect(headingOf(result.data!.document)).toBe("Only this can go live");
  });

  it("rejects an unknown page without writing anything", async () => {
    const result = await PublishPage(ORG, "page_missing");

    expect(result.code).toBe("page_not_found");
    expect(tables.site_page_versions).toHaveLength(0);
  });

  it("requires an organization", async () => {
    const result = await PublishPage("", "page_1");

    expect(result.code).toBe("unauthenticated");
    expect(calls ?? []).toHaveLength(0);
  });

  describe("site publish stamps", () => {
    it("records the first publish once and the last publish every time", async () => {
      await PublishPage(ORG, "page_1");
      const site = tables.merchant_sites[0];
      const firstPublishedAt = site.first_published_at;

      expect(firstPublishedAt).not.toBeNull();
      expect(site.last_published_at).toBe(firstPublishedAt);

      page().draft_content = documentWith("Second");
      await PublishPage(ORG, "page_1");

      // "When did this restaurant go live" must not be rewritten by later work.
      expect(site.first_published_at).toBe(firstPublishedAt);
      expect(site.last_published_at).not.toBe(firstPublishedAt);
    });
  });

  /**
   * Guards the §0.2 blocker in the gap-closure plan. `render_mode` is what
   * decides whether the public route serves the built site at all, and nothing
   * writes it — so publishing is invisible to visitors no matter what else is
   * built. This test asserts today's (wrong) behaviour deliberately, so that
   * the fix in plan item W2.5 has to come here and say so.
   */
  it("does NOT yet flip render_mode — see plan §0.2 / W2.5", async () => {
    await PublishPage(ORG, "page_1");

    expect(tables.merchant_sites[0].render_mode).toBeUndefined();
  });
});

describe("GetPublishedDocument", () => {
  it("returns null for a page that has never been published", async () => {
    const result = await GetPublishedDocument(ORG, "page_1");

    expect(result.error).toBeUndefined();
    expect(result.data).toBeNull();
  });

  it("returns the live document, not the draft", async () => {
    await PublishPage(ORG, "page_1");
    page().draft_content = documentWith("Unpublished edit");

    const result = await GetPublishedDocument(ORG, "page_1");

    expect(headingOf(result.data!.document)).toBe("Welcome");
  });

  it("costs no queries when the caller already knows there is no version", async () => {
    await GetPublishedDocument(ORG, "page_1", null);

    expect(calls).toHaveLength(0);
  });

  it("skips the lookup when handed a known version id", async () => {
    const published = await PublishPage(ORG, "page_1");
    const versionId = published.data!.versionId;

    await GetPublishedDocument(ORG, "page_1", versionId);

    // One read of site_page_versions, and no read of site_pages to resolve the
    // pointer the caller already held.
    expect(calls.filter((c) => c.table === "site_pages")).toHaveLength(0);
    expect(calls.filter((c) => c.table === "site_page_versions")).toHaveLength(1);
  });
});
