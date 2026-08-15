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
        <div className="flex items-start gap-3 rounded-2xl border-0 bg-amber-500/10 p-6 dark:bg-amber-400/10">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <h2 className="font-semibold text-amber-800 dark:text-amber-300">Select a location</h2>
            <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-300/90">
              Tip distribution is location-specific. Choose a specific location
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
                    <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full border-0 bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums">
                      {needsApproval.length}
                    </span>
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

              {/* Previous session banner. `flex-wrap`, not `justify-between`
                  on a rigid row: the action drops beneath the message at 320px
                  instead of overflowing. */}
              {lastCutoff && (
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border-0 bg-emerald-500/10 px-4 py-3 dark:bg-emerald-400/10">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <p className="min-w-0 text-sm text-emerald-800 dark:text-emerald-300">
                      <span className="font-medium">
                        Session {lastCutoff.sequenceNumber} closed
                      </span>
                      <span className="ml-1 tabular-nums">
                        — {formatMoney(lastCutoff.totalDistributed)} distributed
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium text-emerald-800 hover:bg-emerald-500/15 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200"
                    onClick={() => router.push(`/dashboard/tips/${lastCutoff.sessionId}`)}
                  >
                    View <ArrowRight className="ml-1 h-3.5 w-3.5" />
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
