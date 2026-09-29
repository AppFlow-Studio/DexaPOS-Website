"use client";

import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { PageShell, PageHeader } from "@/components/dashboard/shell";
import { ClerkAccountPanel, ProfileIdentityPanel } from "@/components/profile/AccountProfile";

export default function ProfilePage() {
  const { data: userInfo, isLoading, isError, refetch } = useUserInfo();
  // `GetUserInfo` reports some failures by resolving to an Error, not throwing.
  const loaded = userInfo && !(userInfo instanceof Error) ? userInfo : null;

  // An org name is a label, not a status, so it never carries its own colour.
  const orgLabels: string[] = (loaded?.members ?? []).map(
    (member: any) =>
      member.organizations?.name ||
      member.organizations?.merchants?.name ||
      "Organization"
  );

  return (
    <PageShell width="narrow">
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
        labels={orgLabels}
        isLoading={isLoading}
        isError={isError || userInfo instanceof Error}
        onRetry={() => void refetch()}
      />

      <ClerkAccountPanel />
    </PageShell>
  );
}
