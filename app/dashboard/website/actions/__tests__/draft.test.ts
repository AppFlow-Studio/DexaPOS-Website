import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStarterPage, type PageDocument } from "@/lib/site-builder/page-document";
import { createFakeSupabase, resetFakeIds, type FakeTables } from "./fake-supabase";

/**
 * `SaveDraft` / `LoadDraft` / `OverwriteDraft` — autosave and its concurrency.
 *
 * The behaviour under test is the promise the builder makes to a merchant with
 * two tabs open: a save either lands completely or is refused with the server's
 * own document in hand. It never auto-merges and it never silently wins, both
 * of which lose work without saying so.
 */

const MERCHANT = "merchant_a";
const LOCATION = "loc_1";
const ORG = "org_a";

let tables: FakeTables;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createFakeSupabase(tables).client,
}));

vi.mock("@/app/dashboard/actions/audit-logs", () => ({
  LogAuditEvent: vi.fn(async () => undefined),
}));

const { LoadDraft, SaveDraft, OverwriteDraft } = await import("../draft");

function documentWith(heading: string): PageDocument {
  const doc = createStarterPage({ locationId: LOCATION });
  const hero = doc.sections.find((section) => section.kind === "hero");
  if (hero) (hero.props as { heading?: string }).heading = heading;
  return doc;
}

function headingOf(doc: PageDocument): string | undefined {
  const hero = doc.sections.find((section) => section.kind === "hero");
  return (hero?.props as { heading?: string } | undefined)?.heading;
}

function page() {
  return tables.site_pages[0];
}

beforeEach(() => {
  resetFakeIds();
  tables = {
    site_pages: [
      {
        id: "page_1",
        site_id: "site_1",
        merchant_id: MERCHANT,
        location_id: LOCATION,
        title: "Home",
        path: "",
        is_home: true,
        status: "draft",
        revision: 7,
        draft_content: documentWith("Welcome"),
        published_version_id: null,
        published_at: null,
      },
    ],
  };
});

describe("SaveDraft", () => {
  it("saves against the expected revision and reports the new one", async () => {
    const result = await SaveDraft(ORG, "page_1", documentWith("Now open late"), 7);

    expect(result.error).toBeUndefined();
    expect(result.data?.revision).toBe(8);
    expect(headingOf(page().draft_content as PageDocument)).toBe("Now open late");
  });

  it("refuses a stale write and hands back the server's document", async () => {
    // Another tab saved first: the stored revision has moved past what this
    // caller loaded.
    page().draft_content = documentWith("Saved by the other tab");
    page().revision = 9;

    const result = await SaveDraft(ORG, "page_1", documentWith("Saved by this tab"), 7);

    expect(result.code).toBe("stale_revision");
    expect(result.data).toBeUndefined();
    expect(result.conflict?.currentRevision).toBe(9);
    expect(headingOf(result.conflict!.currentDocument)).toBe("Saved by the other tab");

    // The losing write must not have landed — that is the whole point.
    expect(headingOf(page().draft_content as PageDocument)).toBe("Saved by the other tab");
    expect(page().revision).toBe(9);
  });

  it("distinguishes a vanished page from a stale revision", async () => {
    const result = await SaveDraft(ORG, "page_missing", documentWith("Anything"), 7);

    expect(result.code).toBe("page_not_found");
    expect(result.conflict).toBeUndefined();
  });

  /**
   * Normalization happens server-side, so the contract holds at the network
   * boundary rather than stopping at the client. A document that arrives with
   * an unknown section kind must be stored repaired, not stored as sent.
   */
  it("normalizes what a caller sends before storing it", async () => {
    const doc = documentWith("Welcome");
    (doc.sections as unknown[]).push({ id: "sec_bogus", kind: "not-a-real-kind", props: {} });

    await SaveDraft(ORG, "page_1", doc, 7);

    // Compared as a plain string: the union deliberately has no member for a
    // kind this build does not know, which is the situation being tested.
    const kinds = (page().draft_content as PageDocument).sections.map(
      (section) => section.kind as string,
    );
    expect(kinds).not.toContain("not-a-real-kind");
  });

  it("requires an organization before touching the database", async () => {
    const result = await SaveDraft("", "page_1", documentWith("Anything"), 7);

    expect(result.code).toBe("unauthenticated");
    expect(page().revision).toBe(7);
  });

  /**
   * The inverse of the concurrency check, and just as load-bearing: a save that
   * changes nothing must not advance the revision, or every autosave tick would
   * invalidate the merchant's other tab for no reason.
   */
  it("does not advance the revision when the content is unchanged", async () => {
    const identical = page().draft_content as PageDocument;

    const result = await SaveDraft(ORG, "page_1", identical, 7);

    expect(result.error).toBeUndefined();
    expect(page().revision).toBe(7);
  });
});

describe("OverwriteDraft", () => {
  it("wins regardless of revision, because the merchant chose it", async () => {
    page().draft_content = documentWith("Saved by the other tab");
    page().revision = 12;

    const result = await OverwriteDraft(ORG, "page_1", documentWith("Keep mine"));

    expect(result.error).toBeUndefined();
    expect(headingOf(page().draft_content as PageDocument)).toBe("Keep mine");
    expect(result.data?.revision).toBe(13);
  });

  it("reports a missing page rather than silently doing nothing", async () => {
    const result = await OverwriteDraft(ORG, "page_missing", documentWith("Keep mine"));

    expect(result.code).toBe("page_not_found");
  });
});

describe("LoadDraft", () => {
  it("returns the normalized document without the raw column", async () => {
    const result = await LoadDraft(ORG, "page_1");

    expect(result.error).toBeUndefined();
    expect(result.data?.revision).toBe(7);
    expect(headingOf(result.data!.document)).toBe("Welcome");
    expect(result.data).not.toHaveProperty("draft_content");
  });

  /**
   * A document written by an older build — or corrupted by anything at all —
   * must come back renderable. The builder opening on a repaired page is a far
   * better outcome than a merchant meeting a 500 on their own draft.
   */
  it("repairs a malformed stored document instead of throwing", async () => {
    page().draft_content = { schemaVersion: 1, sections: "not an array", seo: null };

    const result = await LoadDraft(ORG, "page_1");

    expect(result.error).toBeUndefined();
    expect(Array.isArray(result.data?.document.sections)).toBe(true);
  });

  it("reports a missing page", async () => {
    const result = await LoadDraft(ORG, "page_missing");

    expect(result.code).toBe("page_not_found");
  });
});
