import { clerkClient } from "@clerk/nextjs/server";

export interface ResolvedOrgInviter {
  inviterUserId: string;
  cleanup: () => Promise<void>;
}

/**
 * Resolve a userId that Clerk will accept as the inviter for an org invitation
 * on behalf of `clerkOrgId`. Prefers an existing org:admin; if the org has only
 * org:member rows, temporarily promotes the first one and returns a `cleanup`
 * that demotes them back. Throws if the org has no members at all.
 *
 * Why: Clerk's createOrganizationInvitation requires the inviter to be a member
 * of the target org. HQ admins acting via impersonation are not members, so
 * they need to borrow an existing org:admin's identity for the call.
 */
export async function resolveOrgInviterUserId(
  clerkOrgId: string,
): Promise<ResolvedOrgInviter> {
  const clerk = await clerkClient();

  const memberships = await clerk.organizations.getOrganizationMembershipList({
    organizationId: clerkOrgId,
    limit: 50,
  });

  const adminMember = memberships.data.find((m) => m.role === "org:admin");
  if (adminMember?.publicUserData?.userId) {
    return {
      inviterUserId: adminMember.publicUserData.userId,
      cleanup: async () => {},
    };
  }

  const firstMember = memberships.data[0];
  const promotedUserId = firstMember?.publicUserData?.userId;
  if (!promotedUserId) {
    throw new Error("No eligible inviter found in this merchant org");
  }

  await clerk.organizations.updateOrganizationMembership({
    organizationId: clerkOrgId,
    userId: promotedUserId,
    role: "org:admin",
  });

  return {
    inviterUserId: promotedUserId,
    cleanup: async () => {
      try {
        await clerk.organizations.updateOrganizationMembership({
          organizationId: clerkOrgId,
          userId: promotedUserId,
          role: "org:member",
        });
      } catch (err) {
        console.warn(
          "[resolveOrgInviterUserId] Failed to demote temporarily promoted member:",
          err,
        );
      }
    },
  };
}
