"use client";

import { useMemo, useState } from "react";
import { Mail, UserPlus, Users } from "lucide-react";

import { InviteUserWizard } from "@/components/dashboard/staff/InviteUserWizard";
import { PendingInvitesTable } from "@/components/dashboard/staff/PendingInvitesTable";
import { StaffDataTable } from "@/components/dashboard/staff/StaffDataTable";
import {
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
  StatRow,
  StatTile,
} from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";

import { usePendingInvites } from "../hooks/useInvites";
import { useUnifiedStaff } from "../hooks/useStaff";

export default function MerchantStaffPage() {
  const { data: staffMembers, isLoading, refetch } = useUnifiedStaff();
  const { data: pendingInvites } = usePendingInvites();
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const staff = useMemo(() => staffMembers || [], [staffMembers]);
  const stats = useMemo(
    () => ({
      active: staff.filter((member) => member.overall_is_active).length,
      clerk: staff.filter((member) => member.is_clerk_user).length,
      pendingInvites: pendingInvites?.length ?? 0,
    }),
    [staff, pendingInvites],
  );

  return (
    <PageShell>
      <PageHeader
        title="People"
        subtitle="Find staff, invite someone new, and manage their access."
        stackActionsBelowIndicatorOnMobile
        actions={
          <>
            <InviteUserWizard
              open={isWizardOpen}
              onOpenChange={setIsWizardOpen}
              onSuccess={refetch}
            >
              <Button className="h-9 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm">
                <UserPlus className="h-4 w-4" />
                Add Staff
              </Button>
            </InviteUserWizard>
          </>
        }
      />

      <Panel padded>
        <StatRow columns={4}>
          <StatTile
            label="Total staff"
            value={staff.length}
            meta="All staff members"
            icon={<Users />}
            isLoading={isLoading}
          />
          <StatTile
            label="Active staff"
            value={stats.active}
            meta={
              staff.length > 0
                ? `${Math.round((stats.active / staff.length) * 100)}% of total`
                : "No staff added yet"
            }
            icon={<Users />}
            isLoading={isLoading}
          />
          <StatTile
            label="Dashboard users"
            value={stats.clerk}
            meta="Clerk accounts"
            icon={<Mail />}
            isLoading={isLoading}
          />
          <StatTile showMetaOnMobile
            label="Pending invites"
            value={stats.pendingInvites}
            meta="Awaiting acceptance"
            icon={<Mail />}
            isLoading={isLoading}
          />
        </StatRow>
      </Panel>

      {pendingInvites && pendingInvites.length > 0 && (
        <Panel>
          <PanelSection showCaptionOnMobile
            icon={Mail}
            label="Pending invitations"
            caption={`${pendingInvites.length} invitation${
              pendingInvites.length === 1 ? "" : "s"
            } awaiting acceptance`}
            action={
              <span className="inline-flex h-8 items-center rounded-full bg-amber-500/10 px-3 text-xs font-medium text-amber-700 dark:text-amber-300">
                {pendingInvites.length} pending
              </span>
            }
          >
            <PendingInvitesTable />
          </PanelSection>
        </Panel>
      )}

      <Panel>
        <PanelSection
          icon={Users}
          label="Staff directory"
          caption="Manage roles, location access, account status, and POS credentials."
        >
          <StaffDataTable data={staff} isLoading={isLoading} />
        </PanelSection>
      </Panel>
    </PageShell>
  );
}
