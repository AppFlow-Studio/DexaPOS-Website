"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Clock, Mail, UserPlus, Users } from "lucide-react";

import { InviteUserWizard } from "@/components/dashboard/staff/InviteUserWizard";
import { PendingInvitesTable } from "@/components/dashboard/staff/PendingInvitesTable";
import { StaffDataTable } from "@/components/dashboard/staff/StaffDataTable";
import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
  StatRow,
  StatTile,
} from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import {
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { usePendingInvites } from "../hooks/useInvites";
import { useOrders } from "../hooks/useOrder";
import { useUnifiedStaff } from "../hooks/useStaff";

export default function MerchantStaffPage() {
  const selectedLocation = useSelectedLocation();
  const isAllLocations = useIsAllLocations();
  const { data: staffMembers, isLoading, refetch } = useUnifiedStaff();
  const { data: orders } = useOrders();
  const { data: pendingInvites } = usePendingInvites();
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const staff = useMemo(() => staffMembers || [], [staffMembers]);
  const ordersList = useMemo(
    () => (Array.isArray(orders) ? orders : []),
    [orders],
  );

  const stats = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return {
      active: staff.filter((member) => member.overall_is_active).length,
      clerk: staff.filter((member) => member.is_clerk_user).length,
      recentOrders: ordersList.filter(
        (order) => new Date(order.created_at) >= sevenDaysAgo,
      ).length,
    };
  }, [staff, ordersList]);

  return (
    <PageShell>
      <PageHeader
        title="Staff & Access"
        subtitle="Manage dashboard users and POS staff with location-specific access."
        indicator={
          <LocationIndicator
            isAllLocations={isAllLocations}
            locationName={selectedLocation?.name}
          />
        }
        actions={
          <>
            <Button
              variant="outline"
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              asChild
            >
              <Link href="/dashboard/staff/timesheets">
                <Clock className="mr-1.5 h-4 w-4" />
                Timesheets
              </Link>
            </Button>
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
          <StatTile
            label="Recent activity"
            value={stats.recentOrders}
            meta="Orders in the last 7 days"
            icon={<Activity />}
            isLoading={isLoading}
          />
        </StatRow>
      </Panel>

      {pendingInvites && pendingInvites.length > 0 && (
        <Panel>
          <PanelSection
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
