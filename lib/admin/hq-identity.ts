// =============================================================================
// hq-identity — resolve "which organization is the HQ console itself?"
// =============================================================================
// The HQ console must identify itself by the HQ membership specifically —
// never by members[0]. Two reasons index 0 is wrong:
//
//   1. HQ admins may ALSO hold a merchant membership (e.g. a support account
//      that owns a merchant org). The `members` embed in GetUserInfo has no
//      ORDER BY, so which membership lands at index 0 is plan- and heap-
//      dependent and flips whenever the row is UPDATEd (Clerk webhooks, role
//      changes, staff linking). That produced the reported bug where /manage
//      intermittently rendered a merchant DBA as the admin console's name.
//
//   2. Under impersonation, GetUserInfo replaces `members` with a single
//      synthesized merchant.owner row. There is no HQ membership in the array
//      at all, so this correctly returns null and callers fall back to the HQ
//      literal instead of branding /manage as the impersonated merchant.
//
// See tasks/BUG-hq-portal-shows-merchant-dba.md.
// =============================================================================

/** The subset of an `organizations` row the HQ header actually renders. */
export interface HqOrganization {
  name?: string | null;
  imageURL?: string | null;
}

interface MembershipLike {
  organization_id?: unknown;
  organizations?: unknown;
}

/**
 * Pick the caller's Dexa HQ organization out of a `GetUserInfo` payload.
 *
 * @param userInfo - Whatever `useUserInfo()` returned. Deliberately typed as
 *   `unknown`: GetUserInfo returns an `Error` instance on failure (rather than
 *   throwing), and the value is `undefined` while the query is loading.
 * @param hqOrgId - The HQ Clerk org id
 *   (`NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID`).
 * @returns The HQ `organizations` row, or `null` when the user holds no HQ
 *   membership, the payload is an error/loading shape, or `hqOrgId` is unset.
 */
export function selectHqOrganization(
  userInfo: unknown,
  hqOrgId: string,
): HqOrganization | null {
  // No configured HQ org id — return null rather than guessing a membership.
  if (!hqOrgId) return null;

  if (!userInfo || typeof userInfo !== "object" || userInfo instanceof Error) {
    return null;
  }

  const members = (userInfo as { members?: unknown }).members;
  if (!Array.isArray(members)) return null;

  const hqMembership = (members as MembershipLike[]).find(
    (member) =>
      !!member &&
      typeof member === "object" &&
      member.organization_id === hqOrgId,
  );

  const organizations = hqMembership?.organizations;
  if (!organizations || typeof organizations !== "object") return null;

  return organizations as HqOrganization;
}
