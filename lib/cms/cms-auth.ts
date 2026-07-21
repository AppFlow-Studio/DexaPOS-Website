import { auth } from "@clerk/nextjs/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const DEXA_HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID;

/**
 * Authorization gate for the marketing CMS admin (`/admin`, `/api/cms/*`).
 *
 * The CMS is gated by Clerk HQ: only members of the internal Dexa team
 * (DEXA_POS_INTERNAL_TEAM_ID) may read/write CMS content. All CMS mutations run
 * through the service-role client (bypasses RLS) once this check passes, so we
 * don't need a Supabase-Auth identity or a `cms_users` table.
 *
 * Returns `{ userId }` non-null only when the caller is an authorized HQ user;
 * callers should `if (!userId) → 401 / redirect`. `supabase` is the service-role
 * client, ready for privileged reads/writes.
 */
export async function requireHqUser() {
  const { userId, orgId } = await auth();
  const isHq = !!userId && !!DEXA_HQ_ORG_ID && orgId === DEXA_HQ_ORG_ID;
  return {
    userId: isHq ? userId : null,
    orgId,
    supabase: createServiceRoleClient(),
  };
}
