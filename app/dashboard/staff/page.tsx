"use client";
import { useMemo, useState } from "react";

import {
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { useUnifiedStaff } from "../hooks/useStaff";
import { useOrders } from "../hooks/useOrder";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  UserPlus,
  Users,
  MapPin,
  Globe,
  Lock,
  Mail,
  TrendingUp,
  Activity,
  Clock,
} from "lucide-react";
import { InviteUserWizard } from "@/components/dashboard/staff/InviteUserWizard";
import { StaffDataTable } from "@/components/dashboard/staff/StaffDataTable";
import { PendingInvitesTable } from "@/components/dashboard/staff/PendingInvitesTable";
import { usePendingInvites } from "../hooks/useInvites";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

export default function MerchantStaffPage() {
  const selectedLocation = useSelectedLocation();
  const isAllLocations = useIsAllLocations();

  // Fetch unified staff data with automatic location scoping
  const { data: staffMembers, isLoading, refetch } = useUnifiedStaff();
  const { data: orders } = useOrders();
  const { data: pendingInvites } = usePendingInvites();
  const staff = staffMembers || [];
  const ordersList = Array.isArray(orders) ? orders : [];

  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Calculate stats
  const stats = useMemo(() => {
    const activeCount = staff.filter((s) => s.overall_is_active).length;
    const clerkUsers = staff.filter((s) => s.is_clerk_user).length;
    const posOnly = staff.filter((s) => !s.is_clerk_user).length;
    const uniqueLocations = new Set(
      staff.flatMap((s) => s.location_assignments.map((a) => a.location_id))
    ).size;

    // Calculate staff by role
    const byRole = staff.reduce((acc, s) => {
      // Determine best role to display:
      // 1. If scoped to a specific location, use that location's role
      // 2. Otherwise default to primary role or first assignment
      let assignment =
        s.location_assignments.find((a) => a.is_primary) ||
        s.location_assignments[0];

      if (!isAllLocations && selectedLocation) {
        const localAssignment = s.location_assignments.find(
          (a) => a.location_id === selectedLocation.id
        );
        if (localAssignment) assignment = localAssignment;
      }

      const role = assignment?.role_name || "Unassigned";
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate recent activity (orders in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentOrders = ordersList.filter(
      (o) => new Date(o.created_at) >= sevenDaysAgo
    );

    return {
      active: activeCount,
      clerk: clerkUsers,
      posOnly: posOnly,
      locations: uniqueLocations,
      byRole,
      recentOrders: recentOrders.length,
    };
  }, [staff, ordersList]);

  // Chart data for staff by role
  const roleChartData = useMemo(() => {
    return Object.entries(stats.byRole).map(([role, count]) => ({
      role: role.charAt(0).toUpperCase() + role.slice(1).replace("_", " "),
      count,
    }));
  }, [stats.byRole]);

  const chartConfig = {
    count: {
      label: "Staff",
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  return (
    <main className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">
              Staff & Access
            </h1>
            {isAllLocations ? (
              <Badge variant="outline" className="gap-1">
                <Globe className="h-3 w-3" />
                All Locations
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" />
                {selectedLocation?.name}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Manage dashboard users and POS staff with location-specific access
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" asChild>
            <Link href="/dashboard/staff/timesheets">
              <Clock className="mr-2 h-4 w-4" />
              Timesheets
            </Link>
          </Button>
          <InviteUserWizard
            open={isWizardOpen}
            onOpenChange={setIsWizardOpen}
            onSuccess={refetch}
          >
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Add Staff
            </Button>
          </InviteUserWizard>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{staff.length}</div>
            )}
            <p className="text-xs text-muted-foreground">All staff members</p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {stats.active}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {stats.active > 0
                ? `${((stats.active / staff.length) * 100).toFixed(
                    0
                  )}% of total`
                : "Currently active"}
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Dashboard Users
            </CardTitle>
            <Mail className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-blue-600">
                {stats.clerk}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Clerk accounts</p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Recent Activity
            </CardTitle>
            <Activity className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-purple-600">
                {stats.recentOrders}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Orders (last 7 days)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Invitations — only shown when there are pending invites */}
      {pendingInvites && pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-amber-500" />
                  Pending Invitations
                </CardTitle>
                <CardDescription>
                  {pendingInvites.length} invitation
                  {pendingInvites.length !== 1 ? "s" : ""} awaiting acceptance
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                {pendingInvites.length} pending
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <PendingInvitesTable />
          </CardContent>
        </Card>
      )}

      {/* Staff Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Staff Directory</CardTitle>
          <CardDescription>
            Manage all staff members across your locations. Toggle status, reset
            PINs, and more.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StaffDataTable data={staff} isLoading={isLoading} />
        </CardContent>
      </Card>
    </main>
  );
}
