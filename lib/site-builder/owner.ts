import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server-side counterpart to the client `useIsMerchantOwner` hook: is the current
 * user the owner of this merchant (Clerk org)?
 *
 * Used by server components (the page editor route) to render read-only for
 * non-owners before any bootstrap write runs. Delegates to the same SQL predicate
 * the RLS policies use (`is_merchant_owner_strict`), so it accounts for HQ
 * super-admins and active impersonation without special-casing.
 */
export async function isMerchantOwnerForOrg(clerkOrgId: string): Promise<boolean> {
  if (!clerkOrgId) return false;

  const supabase = createServerSupabaseClient();

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .maybeSingle();

  if (!merchant) return false;

  const { data: allowed } = await supabase.rpc(
    "is_merchant_owner_strict" as never,
    { p_merchant_id: (merchant as { id: string }).id } as never,
  );

  return allowed === true;
}
