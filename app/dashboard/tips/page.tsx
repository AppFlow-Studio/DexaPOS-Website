"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { MapPin, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useLocationStore, useSelectedLocation } from "@/stores/location-store";
import {
  useTodayTipSummary,
  useTodayShifts,
  useCalculateTipDistribution,
  useNeedsApprovalSessions,
  useVoidTipDistribution,
} from "./hooks/useTipDistribution";
import { TodayHeader } from "./components/TodayHeader";
import { ActiveShiftsPanel } from "./components/ActiveShiftsPanel";
import { ConfigSummaryPanel } from "./components/ConfigSummaryPanel";
import { CloseOutDialog } from "./components/CloseOutDialog";
import { NeedsApprovalTable } from "./components/NeedsApprovalTable";
import { HistoryTable } from "./components/HistoryTable";
import { VoidDialog } from "./components/VoidDialog";
import type { TipDistributionSession } from "@/app/dashboard/actions/tips";

export default function TipsPage() {
  const router = useRouter();
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const selectedLocation = useSelectedLocation();

  const todayDate = format(new Date(), "yyyy-MM-dd");
  const locationId = selectedLocationId !== "all" ? selectedLocationId : undefined;

  const [closeOutOpen, setCloseOutOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidingSession, setVoidingSession] = useState<TipDistributionSession | null>(null);

  // Today tab data
  const { data: summary, isLoading: summaryLoading } = useTodayTipSummary(
    clerkOrgId, locationId, todayDate
  );
  const { data: shifts = [], isLoading: shiftsLoading } = useTodayShifts(
    clerkOrgId, locationId, todayDate
  );

  // Needs Approval tab data
  const { data: needsApproval = [], isLoading: approvalLoading } = useNeedsApprovalSessions(
    clerkOrgId, locationId
  );

  const calculateMutation = useCalculateTipDistribution();
  const voidMutation = useVoidTipDistribution();

  // Derived
  const staffStillClockedIn = useMemo(
    () => shifts.filter((s) => !s.clockOutTime).length,
    [shifts]
  );
  const undeclaredStaff = useMemo(
    () => shifts.filter((s) => s.clockOutTime && !s.tipsDeclaredAt),
    [shifts]
  );

  // Handlers
  const handleCloseOut = () => {
    calculateMutation.mutate(
      {
        clerkOrgId: clerkOrgId!,
        locationId: selectedLocationId!,
        sessionDate: todayDate,
        shiftPeriod: "full_day",
        staffProfileId: null,
      },
      {
        onSuccess: (data) => {
          setCloseOutOpen(false);
          if (data?.session_id) {
            router.push(`/dashboard/tips/${data.session_id}`);
          }
        },
      }
    );
  };

  const handleVoidFromApproval = (session: TipDistributionSession) => {
    setVoidingSession(session);
    setVoidDialogOpen(true);
  };

  const handleVoidConfirm = (reason: string) => {
    if (!voidingSession) return;
    voidMutation.mutate(
      {
        clerkOrgId: clerkOrgId!,
        sessionId: voidingSession.id,
        reason,
        voidedBy: null,
      },
      {
        onSuccess: () => {
          setVoidDialogOpen(false);
          setVoidingSession(null);
        },
      }
    );
  };

  // Location guard
  if (selectedLocationId === "all") {
    return (
      <div className="space-y-6">
        <div>
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
            <span>Reports</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground font-medium">Tip Distribution</span>
          </nav>
          <h1 className="text-2xl font-bold">Tip Distribution</h1>
        </div>
        <Card className="p-6 border-yellow-200 bg-yellow-50">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">Select a Location</h3>
              <p className="text-sm text-yellow-800 mt-1">
                Tip distribution is location-specific. Please select a specific location
                from the top navigation to manage tips for that location.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const locationName = selectedLocation?.name || "Location";

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div>
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
          <span>Reports</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Tip Distribution</span>
        </nav>
        <h1 className="text-2xl font-bold">Tip Distribution</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage tip distribution for {locationName}
        </p>
      </div>

      {/* TABS */}
      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="approval" className="gap-1.5">
            Needs Approval
            {needsApproval.length > 0 && (
              <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] rounded-full">
                {needsApproval.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* TODAY TAB */}
        <TabsContent value="today" className="space-y-6 mt-4">
          <TodayHeader
            date={todayDate}
            locationName={locationName}
            summary={summary ?? null}
            isLoading={summaryLoading}
            staffStillClockedIn={staffStillClockedIn}
            undeclaredStaffCount={undeclaredStaff.length}
            onCloseOut={() => setCloseOutOpen(true)}
            isClosingOut={calculateMutation.isPending}
          />

          <ActiveShiftsPanel shifts={shifts} isLoading={shiftsLoading} />

          {/* Projected Distribution placeholder */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Projected Distribution
            </h3>
            <Card className="p-6 text-center border-dashed">
              <p className="text-sm text-muted-foreground">
                Live projection will be available after the preview calculation RPC is implemented.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Use &quot;Close Out & Calculate&quot; to see the final distribution.
              </p>
            </Card>
          </section>

          <ConfigSummaryPanel clerkOrgId={clerkOrgId} locationId={locationId} />
        </TabsContent>

        {/* NEEDS APPROVAL TAB */}
        <TabsContent value="approval" className="mt-4">
          <NeedsApprovalTable
            sessions={needsApproval}
            isLoading={approvalLoading}
            onVoid={handleVoidFromApproval}
          />
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="mt-4">
          <HistoryTable clerkOrgId={clerkOrgId} locationId={locationId} />
        </TabsContent>
      </Tabs>

      {/* DIALOGS */}
      <CloseOutDialog
        open={closeOutOpen}
        onOpenChange={setCloseOutOpen}
        undeclaredStaff={undeclaredStaff}
        onConfirm={handleCloseOut}
        isLoading={calculateMutation.isPending}
      />

      <VoidDialog
        open={voidDialogOpen}
        onOpenChange={(open) => {
          setVoidDialogOpen(open);
          if (!open) setVoidingSession(null);
        }}
        onConfirm={handleVoidConfirm}
        isLoading={voidMutation.isPending}
      />
    </div>
  );
}
