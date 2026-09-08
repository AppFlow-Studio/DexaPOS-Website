"use client";

import { SaveDraft } from "@/app/dashboard/website/actions/draft";
import type { PageDocument } from "@/lib/site-builder/page-document";
import type { SaveAdapter, SaveOutcome } from "./store";

/**
 * The real autosave path: `site_pages.draft_content`, guarded by revision.
 *
 * Everything the builder needs from persistence is already expressed by
 * `SaveAdapter` — this only translates the action's `ActionResult` into the
 * store's three outcomes. The optimistic-concurrency contract is the server's;
 * all that matters here is that a `stale_revision` becomes a `conflict` rather
 * than a generic error, because the two have completely different UI.
 */
export function createDraftSaveAdapter(clerkOrgId: string, pageId: string): SaveAdapter {
  return {
    async save(doc: PageDocument, revision: number): Promise<SaveOutcome> {
      try {
        const result = await SaveDraft(clerkOrgId, pageId, doc, revision);

        if (result.data) return { ok: true, revision: result.data.revision };

        if (result.code === "stale_revision" && result.conflict) {
          return {
            ok: false,
            reason: "conflict",
            serverDoc: result.conflict.currentDocument,
            revision: result.conflict.currentRevision,
          };
        }

        return {
          ok: false,
          reason: "error",
          message: result.error ?? "Could not save your changes.",
        };
      } catch (error) {
        // A network failure, a signed-out session, a deploy mid-keystroke. The
        // merchant's edits stay in memory either way; the store surfaces this as
        // a persistent state with a retry rather than a toast that vanishes.
        console.error("[site-builder] draft save failed:", error);
        return {
          ok: false,
          reason: "error",
          message: "Could not reach the server. Your changes are still here.",
        };
      }
    },
  };
}
