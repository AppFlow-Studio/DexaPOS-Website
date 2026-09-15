import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/site-builder/db-types";

type ServerSupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Website editing is **owner-only** (product decision 2026-09-13): only the
 * merchant owner may change a store's website. Every mutating website action
 * calls this before it touches the database.
 *
 * The real enforcement lives in RLS — the website-content tables narrow
 * INSERT/UPDATE/DELETE to `is_merchant_owner_strict()` (migration
 * 20260913120000). This guard mirrors that check in application code for two
 * reasons:
 *
 *   1. A clear message. A blocked INSERT raises 42501, but a blocked UPDATE or
 *      DELETE simply matches no rows (RLS USING failures don't raise) — so
 *      without this guard a non-owner's edit looks like a silent no-op or a
 *      spurious "not found". Here they get "Only the store owner…".
 *   2. Defence in depth, one query at the top of each action.
 *
 * It delegates to the same SQL predicate RLS uses, so HQ super-admins and active
 * impersonation sessions (both covered by `is_dexapos_admin()` inside
 * `is_merchant_owner_strict`) stay allowed without special-casing here.
 */
export async function assertMerchantOwner(
  supabase: ServerSupabaseClient,
  clerkOrgId: string,
): Promise<
  | { ok: true; merchantId: string }
  | { ok: false; failure: ActionResult<never> }
> {
  if (!clerkOrgId) {
    return {
      ok: false,
      failure: { error: "Organization ID is required", code: "unauthenticated" },
    };
  }

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .maybeSingle();

  if (!merchant) {
    return {
      ok: false,
      failure: { error: "Merchant not found", code: "merchant_not_found" },
    };
  }

  const merchantId = (merchant as { id: string }).id;

  // Same predicate the RLS policies use, so this guard can never drift from the
  // database's answer (and it accounts for HQ + impersonation for free).
  const { data: allowed, error } = await supabase.rpc(
    "is_merchant_owner_strict" as never,
    { p_merchant_id: merchantId } as never,
  );

  if (error || !allowed) {
    return {
      ok: false,
      failure: {
        error: "Only the store owner can edit the website.",
        code: "forbidden",
      },
    };
  }

  return { ok: true, merchantId };
}
