"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import { normalizePageWithReport } from "@/lib/site-builder/normalize";
import type { PageDocument } from "@/lib/site-builder/page-document";
import type {
  ActionResult,
  SitePage,
  SitePageRow,
} from "@/lib/site-builder/db-types";

/**
 * Draft load and autosave.
 *
 * The unit of work is the whole document — there are no partial-section patches.
 * Pages are a few tens of KB, so writing the whole thing costs nothing measurable
 * and buys atomicity: a save either lands completely or not at all.
 */

export interface SaveDraftSuccess {
  revision: number;
  updatedAt: string;
}

export interface StaleDraftConflict {
  currentRevision: number;
  currentDocument: PageDocument;
}

/**
 * Loads a page and normalizes its stored document.
 *
 * `normalizePage` never throws, so a document written by an older build — or
 * corrupted by anything at all — comes back renderable rather than blowing up
 * the builder. Repairs are logged server-side; the merchant is not shown them
 * unless something was actually dropped.
 */
export async function LoadDraft(
  clerkOrgId: string,
  pageId: string,
): Promise<ActionResult<SitePage>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("site_pages")
    .select("*")
    .eq("id", pageId)
    .maybeSingle();

  if (error) return { error: error.message, code: "db_error" };
  if (!data) return { error: "Page not found", code: "page_not_found" };

  const row = data as SitePageRow;
  const { doc, repairs } = normalizePageWithReport(row.draft_content);

  if (repairs.length > 0) {
    console.warn(
      `[site-builder] repaired ${repairs.length} issue(s) loading page ${pageId}:`,
      repairs.map((r) => `${r.kind}(${r.detail})`).join(", "),
    );
  }

  const { draft_content: _ignored, ...rest } = row;
  return { data: { ...rest, document: doc } };
}

/**
 * Saves a draft, refusing to clobber a newer version.
 *
 * The caller sends the `revision` it loaded; the update only matches while that
 * is still current, and a trigger bumps it. Zero rows back means someone else
 * saved first — most often the same merchant in a second browser tab.
 *
 * On conflict this returns the current document so the UI can offer
 * reload / keep-mine / compare. It never auto-merges and never silently wins:
 * both are ways to lose a merchant's work without telling them.
 */
export async function SaveDraft(
  clerkOrgId: string,
  pageId: string,
  document: PageDocument,
  expectedRevision: number,
): Promise<ActionResult<SaveDraftSuccess> & { conflict?: StaleDraftConflict }> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  // Never store raw client input. Normalizing here is what makes the contract's
  // guarantees hold at the network boundary rather than stopping at the client.
  const { doc: normalized } = normalizePageWithReport(document);

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("site_pages")
    .update({ draft_content: normalized })
    .eq("id", pageId)
    .eq("revision", expectedRevision)
    .select("revision, updated_at")
    .maybeSingle();

  if (error) return { error: error.message, code: "db_error" };

  if (data) {
    const saved = data as { revision: number; updated_at: string };
    return { data: { revision: saved.revision, updatedAt: saved.updated_at } };
  }

  // No row updated: either the revision moved on, or the page is gone / not ours.
  // Distinguish them, because "someone else edited this" and "this page no longer
  // exists" need very different UI.
  const { data: current } = await supabase
    .from("site_pages")
    .select("*")
    .eq("id", pageId)
    .maybeSingle();

  if (!current) return { error: "Page not found", code: "page_not_found" };

  const row = current as SitePageRow;
  const { doc } = normalizePageWithReport(row.draft_content);

  return {
    error: "This page was changed somewhere else since you opened it.",
    code: "stale_revision",
    conflict: { currentRevision: row.revision, currentDocument: doc },
  };
}

/**
 * Force-saves, discarding whatever is stored.
 *
 * Only ever called after the merchant explicitly chooses "keep my version" in
 * the conflict dialog — never automatically.
 */
export async function OverwriteDraft(
  clerkOrgId: string,
  pageId: string,
  document: PageDocument,
): Promise<ActionResult<SaveDraftSuccess>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const { doc: normalized } = normalizePageWithReport(document);
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("site_pages")
    .update({ draft_content: normalized })
    .eq("id", pageId)
    .select("revision, updated_at, site_id")
    .maybeSingle();

  if (error) return { error: error.message, code: "db_error" };
  if (!data) return { error: "Page not found", code: "page_not_found" };

  const saved = data as { revision: number; updated_at: string };

  await LogAuditEvent({
    clerkOrgId,
    action: "overwrote_website_draft",
    actionCategory: "website",
    severity: "warning",
    resourceType: "site_page",
    resourceId: pageId,
    resourceName: "Website page",
    changes: { reason: "Merchant chose to keep their version after an edit conflict" },
  });

  return { data: { revision: saved.revision, updatedAt: saved.updated_at } };
}
