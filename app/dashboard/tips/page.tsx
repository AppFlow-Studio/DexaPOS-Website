"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { MapPin, ChevronRight, CheckCircle2, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useGatedLocationId, useGatedLocation } from "@/stores/location-store";
import { formatMoney } from "./lib/constants";
import {
  useLatestSessionCutoff,
  useTodayTipSummary,
  useTodayShifts,
  useCalculateTipDistribution,
  useNeedsApprovalSessions,
  useVoidTipDistribution,
  useOrphanedShifts,
  useUnclosedDays,
  useForceClockOut,
} from "./hooks/useTipDistribution";
import { TodayHeader } from "./components/TodayHeader";
import { ActiveShiftsPanel } from "./components/ActiveShiftsPanel";
import { ConfigSummaryPanel } from "./components/ConfigSummaryPanel";
import { CloseOutDialog } from "./components/CloseOutDialog";
import { NeedsApprovalTable } from "./components/NeedsApprovalTable";
import { HistoryTable } from "./components/HistoryTable";
import { VoidDialog } from "./components/VoidDialog";
import { AttentionBanner } from "./components/AttentionBanner";
import { ProjectedDistributionPanel } from "./components/ProjectedDistributionPanel";
import type { TipDistributionSession } from "@/app/dashboard/actions/tips";

export default function TipsPage() {
  const router = useRouter();
  const clerkOrgId = useClerkOrgId();
  // Resolve to the gated location so single-location accounts (locked to 'all')
  // skip the "Select a Location" prompt. The shadowed `selectedLocationId` keeps
  // every `=== "all"` guard below correct.
  const selectedLocationId = useGatedLocationId() ?? "all";
  const selectedLocation = useGatedLocation();

  const todayDate = format(new Date(), "yyyy-MM-dd");
  const locationId = selectedLocationId !== "all" ? selectedLocationId : undefined;

  const [closeOutOpen, setCloseOutOpen] = useState(false);
  const [closeOutTargetDate, setCloseOutTargetDate] = useState<string | undefined>(undefined);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidingSession, setVoidingSession] = useState<TipDistributionSession | null>(null);

  // Check for previous approved session today (for multi-session scoping)
  const { data: lastCutoff } = useLatestSessionCutoff(clerkOrgId, locationId, todayDate);
  const afterCutoff = lastCutoff?.cutoffAt ?? null;

  // Today tab data — scoped after previous session cutoff
  const { data: summary, isLoading: summaryLoading } = useTodayTipSummary(
    clerkOrgId, locationId, todayDate, afterCutoff
  );
  const { data: shifts = [], isLoading: shiftsLoading } = useTodayShifts(
    clerkOrgId, locationId, todayDate, afterCutoff
  );

  // Needs Approval tab data
  const { data: needsApproval = [], isLoading: approvalLoading } = useNeedsApprovalSessions(
    clerkOrgId, locationId
  );

  // Orphan detection
  const { data: orphanedShifts = [] } = useOrphanedShifts(clerkOrgId, locationId);
  const { data: unclosedDays = [] } = useUnclosedDays(clerkOrgId, locationId);
  const forceClockOutMutation = useForceClockOut();

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
    const targetDate = closeOutTargetDate || todayDate;
    calculateMutation.mutate(
      {
        clerkOrgId: clerkOrgId!,
        locationId: selectedLocationId!,
        sessionDate: targetDate,
        shiftPeriod: "full_day",
        staffProfileId: null,
      },
      {
        onSuccess: (data) => {
          setCloseOutOpen(false);
          setCloseOutTargetDate(undefined);
          if (data?.session_id) {
            router.push(`/dashboard/tips/${data.session_id}`);
          }
        },
      }
    );
  };

  const handleCloseOutDay = (date: string) => {
    setCloseOutTargetDate(date);
    setCloseOutOpen(true);
  };

  const handleForceClockOut = (shiftId: string, clockOutTime: string, cashTips: number) => {
    forceClockOutMutation.mutate({
      clerkOrgId: clerkOrgId!,
      shiftId,
      clockOutTime,
      cashTipsDeclared: cashTips,
    });
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

      {/* ATTENTION BANNER — orphaned shifts + unclosed days */}
      <AttentionBanner
        orphanedShifts={orphanedShifts}
        unclosedDays={unclosedDays}
        onForceClockOut={handleForceClockOut}
        onCloseOutDay={handleCloseOutDay}
        isForceClockOutLoading={forceClockOutMutation.isPending}
      />

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

          {/* Previous session banner */}
          {lastCutoff && (
            <Card className="p-3 border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <div className="text-sm">
                    <span className="font-medium text-green-800 dark:text-green-200">
                      Session {lastCutoff.sequenceNumber} closed
                    </span>
                    <span className="text-green-700 dark:text-green-300 ml-1">
                      — {formatMoney(lastCutoff.totalDistributed)} distributed
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-green-700 hover:text-green-800 h-7 text-xs"
                  onClick={() => router.push(`/dashboard/tips/${lastCutoff.sessionId}`)}
                >
                  View <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </Card>
          )}

          <ActiveShiftsPanel shifts={shifts} isLoading={shiftsLoading} />

          {/* Projected Distribution */}
          <ProjectedDistributionPanel
            clerkOrgId={clerkOrgId}
            locationId={locationId}
            sessionDate={todayDate}
          />

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
        onOpenChange={(open) => {
          setCloseOutOpen(open);
          if (!open) setCloseOutTargetDate(undefined);
        }}
        undeclaredStaff={undeclaredStaff}
        onConfirm={handleCloseOut}
        isLoading={calculateMutation.isPending}
        targetDate={closeOutTargetDate}
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
