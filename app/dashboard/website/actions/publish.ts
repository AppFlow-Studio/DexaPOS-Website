"use server";

import { createHash } from "node:crypto";

import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import type { ActionResult, SitePageRow, SitePageVersionRow } from "@/lib/site-builder/db-types";
import { normalizePageWithReport } from "@/lib/site-builder/normalize";
import type { PageDocument } from "@/lib/site-builder/page-document";
import { validatePage } from "@/lib/site-builder/validate";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Publishing.
 *
 * Saving and publishing are deliberately different operations on different
 * tables: `SaveDraft` overwrites one mutable `site_pages.draft_content`, while
 * publishing *appends* an immutable `site_page_versions` row and points the page
 * at it. That is what makes "what was live last Tuesday" answerable, and it is
 * why nothing here ever UPDATEs a version's content.
 *
 * The draft is not touched by a publish. A merchant who publishes and keeps
 * typing is still editing the same draft; the published version is a snapshot
 * taken beside it.
 */

export interface PublishResult {
  versionId: string;
  versionNumber: number;
  publishedAt: string;
  /** The exact document that went live, so the client can set its baseline. */
  document: PageDocument;
  /** True when the draft already matched the live version and nothing was written. */
  unchanged: boolean;
}

/**
 * A stable fingerprint of a document.
 *
 * Keys are sorted before hashing so that two documents differing only in
 * property order — which `JSON.stringify` order depends on and merchants cannot
 * influence — produce the same hash and do not create a redundant version.
 */
function contentHash(doc: PageDocument): string {
  return createHash("sha256").update(canonicalJson(doc)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * Publishes the current draft of a page.
 *
 * Refuses on validation *errors* only. Warnings — a missing SEO description, an
 * 86'd menu item that will not render — never block: a restaurant that cannot
 * put its new hours live because of a missing alt text is a tool failure, not a
 * quality win.
 */
export async function PublishPage(
  clerkOrgId: string,
  pageId: string,
): Promise<ActionResult<PublishResult>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data: pageData, error: pageError } = await supabase
    .from("site_pages")
    .select("*")
    .eq("id", pageId)
    .maybeSingle();

  if (pageError) return { error: pageError.message, code: "db_error" };
  if (!pageData) return { error: "Page not found", code: "page_not_found" };

  const page = pageData as SitePageRow;

  // Publish what is stored, not what the client claims — the draft on the server
  // is the only thing that has been through `SaveDraft`'s normalization.
  const { doc } = normalizePageWithReport(page.draft_content);

  const validation = validatePage(doc);
  if (!validation.ok) {
    return {
      error: validation.errors[0]?.message ?? "This page cannot be published yet.",
      code: "invalid_document",
    };
  }

  const hash = contentHash(doc);

  // Republishing identical content would add a history row that says nothing.
  if (page.published_version_id) {
    const { data: live } = await supabase
      .from("site_page_versions")
      .select("id, version_number, content_hash, published_at")
      .eq("id", page.published_version_id)
      .maybeSingle();

    const liveVersion = live as Pick<
      SitePageVersionRow,
      "id" | "version_number" | "content_hash" | "published_at"
    > | null;

    if (liveVersion?.content_hash === hash) {
      return {
        data: {
          versionId: liveVersion.id,
          versionNumber: liveVersion.version_number,
          publishedAt: liveVersion.published_at,
          document: doc,
          unchanged: true,
        },
      };
    }
  }

  // `version_number` is unique per page, so a concurrent publish loses the
  // insert rather than silently sharing a number.
  const { data: latest } = await supabase
    .from("site_page_versions")
    .select("version_number")
    .eq("page_id", pageId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber = ((latest as { version_number: number } | null)?.version_number ?? 0) + 1;

  const { data: inserted, error: insertError } = await supabase
    .from("site_page_versions")
    .insert({
      page_id: pageId,
      site_id: page.site_id,
      merchant_id: page.merchant_id,
      version_number: versionNumber,
      content: doc,
      content_hash: hash,
      published_by: clerkOrgId,
    })
    .select("id, version_number, published_at")
    .single();

  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      return {
        error: "This page was published somewhere else a moment ago. Try again.",
        code: "stale_revision",
      };
    }
    return { error: insertError?.message ?? "Could not publish the page", code: "db_error" };
  }

  const version = inserted as Pick<SitePageVersionRow, "id" | "version_number" | "published_at">;

  // The version that was live stops being live. Done after the insert so a
  // failure here leaves two rows looking live rather than none.
  if (page.published_version_id) {
    await supabase
      .from("site_page_versions")
      .update({ superseded_at: version.published_at })
      .eq("id", page.published_version_id);
  }

  const { error: pointerError } = await supabase
    .from("site_pages")
    .update({
      published_version_id: version.id,
      published_at: version.published_at,
      status: "published",
    })
    .eq("id", pageId);

  if (pointerError) return { error: pointerError.message, code: "db_error" };

  await stampSitePublishTimes(supabase, page.site_id, version.published_at);

  await LogAuditEvent({
    clerkOrgId,
    locationId: page.location_id,
    action: "published_website_page",
    actionCategory: "website",
    severity: "info",
    resourceType: "site_page",
    resourceId: pageId,
    resourceName: page.title,
    changes: { after: { versionNumber: version.version_number, publishedAt: version.published_at } },
  });

  return {
    data: {
      versionId: version.id,
      versionNumber: version.version_number,
      publishedAt: version.published_at,
      document: doc,
      unchanged: false,
    },
  };
}

/**
 * Loads the document that is currently live for a page.
 *
 * The builder's change count is measured against this, so "3 changes" means
 * three differences from what visitors can see — not three edits this session.
 * A page that has never been published has no baseline and returns null; the
 * caller decides what that means rather than being handed an empty document
 * that would report every section as newly added.
 *
 * `knownVersionId` lets a caller that already holds the page row skip the lookup
 * — `ListPages` selects `published_version_id`, so the builder route was paying
 * a round trip to re-read a column it had in hand. Pass `null` for a page that
 * has never been published and this costs no queries at all. Omit the argument
 * and it resolves the id itself, as before.
 */
export async function GetPublishedDocument(
  clerkOrgId: string,
  pageId: string,
  knownVersionId?: string | null,
): Promise<ActionResult<{ document: PageDocument; publishedAt: string } | null>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  let versionId = knownVersionId;

  if (versionId === undefined) {
    const { data, error } = await supabase
      .from("site_pages")
      .select("published_version_id")
      .eq("id", pageId)
      .maybeSingle();

    if (error) return { error: error.message, code: "db_error" };
    versionId = (data as { published_version_id: string | null } | null)?.published_version_id;
  }

  if (!versionId) return { data: null };

  const { data: version, error: versionError } = await supabase
    .from("site_page_versions")
    .select("content, published_at")
    .eq("id", versionId)
    .maybeSingle();

  if (versionError) return { error: versionError.message, code: "db_error" };
  if (!version) return { data: null };

  const row = version as Pick<SitePageVersionRow, "content" | "published_at">;
  const { doc } = normalizePageWithReport(row.content);
  return { data: { document: doc, publishedAt: row.published_at } };
}

/**
 * Records first/last publish on the site.
 *
 * `first_published_at` is written only once — it is the answer to "when did this
 * restaurant go live", which a later publish must not overwrite.
 */
async function stampSitePublishTimes(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  siteId: string,
  publishedAt: string,
): Promise<void> {
  const { data } = await supabase
    .from("merchant_sites")
    .select("first_published_at")
    .eq("id", siteId)
    .maybeSingle();

  const first = (data as { first_published_at: string | null } | null)?.first_published_at;

  await supabase
    .from("merchant_sites")
    .update({
      last_published_at: publishedAt,
      ...(first ? {} : { first_published_at: publishedAt }),
    })
    .eq("id", siteId);
}
