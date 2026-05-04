// =============================================================================
// merchant-context — server-side resolver for "which merchant is this action
// targeting?"
// =============================================================================
// This is the trust chokepoint dashboard server actions must call before any
// merchant-scoped read or write. It folds three concerns into one place:
//
//   1. Honor an active impersonation session if one is in effect (resolved
//      from the httpOnly cookies; never from a client-passed value).
//   2. Validate a client-passed clerkOrgId against the user's actual Clerk
//      org membership — closes the long-standing gap where dashboard actions
//      blindly trust whatever clerkOrgId the browser sent.
//   3. Fall back to auth().orgId when no clerkOrgId was passed.
//
// React.cache memoizes the result per request so call sites can invoke it
// freely without thrashing the DB.
// =============================================================================

import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveImpersonationFromCookies } from "@/lib/admin/impersonation";

const HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID;

export class UnauthorizedOrgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedOrgError";
  }
}

export interface EffectiveMerchantContext {
  /**
   * The merchant's Clerk org id. During impersonation, this is the
   * impersonated merchant's clerk_org_id, NOT the HQ admin's org.
   */
  clerkOrgId: string;
  /** UUID of the merchants row this action will read/write against. */
  merchantId: string;
  /** True iff resolved via an active impersonation cookie + valid session. */
  isImpersonating: boolean;
  /** Set when isImpersonating === true. */
  sessionId?: string;
}

/**
 * Resolve the effective merchant context for the current request.
 *
 * @param passedClerkOrgId - The clerkOrgId the client provided (e.g. the value
 *   useClerkOrgId() returned). Pass null when the action does not receive one.
 * @throws UnauthorizedOrgError when the passed value can't be reconciled
 *   against either the user's real org or an active impersonation session.
 */
export const getEffectiveMerchantContext = cache(
  async (
    passedClerkOrgId: string | null,
  ): Promise<EffectiveMerchantContext> => {
    const { userId, orgId: sessionOrgId } = await auth();

    if (!userId) {
      throw new UnauthorizedOrgError("Not authenticated");
    }

    const supabase = createServerSupabaseClient();

    // ── Path A: active impersonation ─────────────────────────────────────
    const impersonation = await resolveImpersonationFromCookies();
    if (impersonation) {
      // If the client also sent a clerkOrgId and it disagrees with the
      // impersonated merchant, it usually means the client is mid-transition
      // (Zustand hadn't flipped yet when the request was queued). Fail fast
      // rather than write to the wrong tenant.
      if (
        passedClerkOrgId &&
        passedClerkOrgId !== impersonation.clerkOrgId &&
        // Allow the HQ admin's own org as the "stale" value — the React Query
        // layer will refetch with the correct one momentarily.
        passedClerkOrgId !== sessionOrgId
      ) {
        throw new UnauthorizedOrgError(
          "clerkOrgId does not match the active impersonation session",
        );
      }
      return {
        clerkOrgId: impersonation.clerkOrgId,
        merchantId: impersonation.merchantId,
        isImpersonating: true,
        sessionId: impersonation.sessionId,
      };
    }

    // ── Path B: client-supplied clerkOrgId, validate it ──────────────────
    if (passedClerkOrgId) {
      // HQ admins outside an impersonation session must not act as merchants.
      // The middleware already redirects them off /dashboard, but defend in
      // depth here.
      if (HQ_ORG_ID && sessionOrgId === HQ_ORG_ID) {
        throw new UnauthorizedOrgError(
          "HQ admin cannot act as merchant without an active impersonation session",
        );
      }

      // The clerkOrgId must belong to the calling user's org membership AND
      // resolve to a merchant row.
      const { data: merchant } = await supabase
        .from("merchants")
        .select("id, clerk_org_id")
        .eq("clerk_org_id", passedClerkOrgId)
        .single();

      if (!merchant) {
        throw new UnauthorizedOrgError(
          `No merchant found for clerk_org_id ${passedClerkOrgId}`,
        );
      }

      // Cross-check: the calling user is actually a member of that org.
      const { data: membership } = await supabase
        .from("members")
        .select("id")
        .eq("user_id", userId)
        .eq("organization_id", passedClerkOrgId)
        .maybeSingle();

      if (!membership) {
        throw new UnauthorizedOrgError(
          "User is not a member of the supplied clerk_org_id",
        );
      }

      return {
        clerkOrgId: merchant.clerk_org_id,
        merchantId: merchant.id,
        isImpersonating: false,
      };
    }

    // ── Path C: no param, derive from session ────────────────────────────
    if (!sessionOrgId) {
      throw new UnauthorizedOrgError("No org context available");
    }

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id, clerk_org_id")
      .eq("clerk_org_id", sessionOrgId)
      .single();

    if (!merchant) {
      throw new UnauthorizedOrgError(
        `No merchant found for session org ${sessionOrgId}`,
      );
    }

    return {
      clerkOrgId: merchant.clerk_org_id,
      merchantId: merchant.id,
      isImpersonating: false,
    };
  },
);

/**
 * Convenience for callers that only need the clerkOrgId. Equivalent to
 * `(await getEffectiveMerchantContext(passed)).clerkOrgId`.
 */
export async function getEffectiveClerkOrgId(
  passedClerkOrgId: string | null,
): Promise<string> {
  const ctx = await getEffectiveMerchantContext(passedClerkOrgId);
  return ctx.clerkOrgId;
}
