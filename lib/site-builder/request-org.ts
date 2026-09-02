import { auth } from "@clerk/nextjs/server";
import { cache } from "react";

import { resolveImpersonationFromCookies } from "@/lib/admin/impersonation";

/**
 * The Clerk org the Website surface should act as for the current request.
 *
 * Every `/dashboard/website/*` route resolved its merchant from raw
 * `auth().orgId`. During HQ impersonation that is still the HQ team's org — the
 * session's Clerk org never changes, impersonation rides on httpOnly cookies —
 * not the merchant being viewed. So `loadSiteContext` found no merchant for the
 * HQ org and every screen fell through to "Set up an Online Store first" for a
 * merchant that plainly had a storefront.
 *
 * Resolving the impersonation cookie first (never a client-supplied value; it is
 * re-validated by `touch_impersonation_session`) makes the whole surface honor
 * impersonation exactly as the rest of the dashboard does via
 * `getEffectiveMerchantContext`. When no session is active it returns raw
 * `auth().orgId` unchanged, so the non-impersonating path — and each caller's
 * existing `redirect("/sign-in")` / null guard — behaves exactly as before.
 *
 * `cache()` memoizes per request; `resolveImpersonationFromCookies` is itself
 * memoized, so the touch RPC still fires at most once even with many callers.
 */
export const resolveWebsiteOrgId = cache(async (): Promise<string | null> => {
  const impersonation = await resolveImpersonationFromCookies();
  if (impersonation) return impersonation.clerkOrgId;

  const { orgId } = await auth();
  return orgId ?? null;
});
