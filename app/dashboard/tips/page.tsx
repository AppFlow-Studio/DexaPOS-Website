"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { MapPin, CheckCircle2, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PageShell, PageHeader, Panel } from "@/components/dashboard/shell";
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

  const isAllLocations = selectedLocationId === "all";
  const locationName = selectedLocation?.name || "Location";

  return (
    <PageShell>
      <PageHeader
        title="Tip Distribution"
        subtitle={isAllLocations ? undefined : `Manage tip distribution for ${locationName}`}
      />

      {isAllLocations ? (
        <div className="flex items-start gap-3 rounded-2xl border-0 bg-amber-50 p-6 dark:bg-amber-900/20">
          <MapPin className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-amber-800 dark:text-amber-400">Select a Location</h3>
            <p className="text-sm text-amber-800 dark:text-amber-400 mt-1">
              Tip distribution is location-specific. Please select a specific location
              from the top navigation to manage tips for that location.
            </p>
          </div>
        </div>
      ) : (
        <>
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
            <div className="w-full min-w-0 overflow-x-auto pb-1">
              <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                <TabsTrigger
                  value="today"
                  className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                >
                  Today
                </TabsTrigger>
                <TabsTrigger
                  value="approval"
                  className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground gap-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                >
                  Needs Approval
                  {needsApproval.length > 0 && (
                    <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] rounded-full">
                      {needsApproval.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                >
                  History
                </TabsTrigger>
              </TabsList>
            </div>

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
                <div className="flex items-center justify-between rounded-2xl border-0 bg-emerald-50 p-3 dark:bg-emerald-900/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div className="text-sm">
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        Session {lastCutoff.sequenceNumber} closed
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-400 ml-1">
                        — {formatMoney(lastCutoff.totalDistributed)} distributed
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 h-7 text-xs"
                    onClick={() => router.push(`/dashboard/tips/${lastCutoff.sessionId}`)}
                  >
                    View <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
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
              <Panel padded>
                <NeedsApprovalTable
                  sessions={needsApproval}
                  isLoading={approvalLoading}
                  onVoid={handleVoidFromApproval}
                />
              </Panel>
            </TabsContent>

            {/* HISTORY TAB */}
            <TabsContent value="history" className="mt-4">
              <Panel padded>
                <HistoryTable clerkOrgId={clerkOrgId} locationId={locationId} />
              </Panel>
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
        </>
      )}
    </PageShell>
  );
}
