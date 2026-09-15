import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";

type MembershipLite = {
  role?: string | null;
  organizations?: { id?: string | null } | null;
};

/**
 * Is the current user the OWNER of the given merchant (Clerk org)?
 *
 * Website editing is owner-only (product decision 2026-09-13). Screens pass the
 * effective `clerkOrgId` they already hold (impersonation-aware) and use this to
 * render mutating controls read-only for everyone else.
 *
 * `useUserInfo()` returns `members[]` where each row carries `role` and its
 * `organizations.id` (which IS the Clerk org id). Under HQ impersonation the hook
 * synthesises a single `merchant.owner` membership pointing at the impersonated
 * merchant (see app/manage/actions/get-user-info.ts), so HQ support continues to
 * read as the owner here — matching the RLS predicate `is_merchant_owner_strict`.
 *
 * This is a convenience for the UI only; the database (RLS) and every write
 * action are the real enforcement.
 */
export function useIsMerchantOwner(clerkOrgId: string): boolean {
  const { data: userInfo } = useUserInfo();
  const members = (userInfo as { members?: MembershipLite[] } | null | undefined)?.members;
  if (!clerkOrgId || !members?.length) return false;
  return members.some(
    (m) => m?.organizations?.id === clerkOrgId && m?.role === "merchant.owner",
  );
}
