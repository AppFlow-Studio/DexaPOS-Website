"use client";

import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useAdminPermissions } from "@/lib/hooks/useAdminPermissions";
import { PageShell, PageHeader } from "@/components/dashboard/shell";
import { ClerkAccountPanel, ProfileIdentityPanel } from "@/components/profile/AccountProfile";

/**
 * The HQ twin of `/dashboard/profile`: the same identity and account panels,
 * with the admin's HQ role as the label instead of their organizations.
 */
export default function AdminProfilePage() {
  const { data: userInfo, isLoading, isError, refetch } = useUserInfo();
  // The role loads apart from `useUserInfo`, so its pill can land after the name.
  const { role, isLoading: isRoleLoading } = useAdminPermissions();
  // `GetUserInfo` reports some failures by resolving to an Error, not throwing.
  const loaded = userInfo && !(userInfo instanceof Error) ? userInfo : null;

  return (
    <PageShell as="div" width="narrow">
      <PageHeader
        title="My Profile"
        subtitle="Manage your account information and preferences"
      />

      <ProfileIdentityPanel
        identity={
          loaded
            ? {
                firstName: loaded.first_name,
                lastName: loaded.last_name,
                email: loaded.email,
                avatarUrl: loaded.avatar_url,
              }
            : null
        }
        labels={role?.role_name ? [role.role_name] : []}
        labelsLoading={isRoleLoading}
        isLoading={isLoading}
        isError={isError || userInfo instanceof Error}
        onRetry={() => void refetch()}
      />

      <ClerkAccountPanel />
    </PageShell>
  );
}
