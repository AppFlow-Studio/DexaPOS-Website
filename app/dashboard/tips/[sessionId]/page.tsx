"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Panel } from "@/components/dashboard/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import {
  useTipDistributionSessionById,
  useApproveTipDistribution,
  useVoidTipDistribution,
  useManualAdjustment,
  useSessionReconciliation,
  useAcknowledgeReconciliation,
  useCalculateTipDistribution,
} from "../hooks/useTipDistribution";
import { formatMoney } from "../lib/constants";
import { TipSummaryCard } from "../components/TipSummaryCard";
import { TipDistributionTable } from "../components/TipDistributionTable";
import { ManualAdjustmentDialog } from "../components/ManualAdjustmentDialog";
import { ConfigSnapshotPanel } from "../components/ConfigSnapshotPanel";
import { ExportHistoryPanel } from "../components/ExportHistoryPanel";
import { VoidDialog } from "../components/VoidDialog";
import { SHIFT_LABELS, formatDate } from "../lib/constants";
import { TipStatusBadge } from "../components/TipStatusBadge";
import type { TipDetailWithStaff } from "@/app/dashboard/actions/tips";

export default function SessionReviewPage() {
  const params = useParams();
  const router = useRouter();
  const clerkOrgId = useClerkOrgId();
  const sessionId = params.sessionId as string;

  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustingDetail, setAdjustingDetail] = useState<TipDetailWithStaff | null>(null);

  const { data: session, isLoading } = useTipDistributionSessionById(
    clerkOrgId,
    sessionId
  );

  const approveMutation = useApproveTipDistribution();
  const voidMutation = useVoidTipDistribution();
  const adjustMutation = useManualAdjustment();
  const calculateMutation = useCalculateTipDistribution();

  // Late tip reconciliation check (only for approved sessions)
  const { data: reconciliation } = useSessionReconciliation(clerkOrgId, sessionId);
  const acknowledgeMutation = useAcknowledgeReconciliation();

  const handleRecalculateForLateTips = () => {
    if (!session) return;
    // Void current session, then recalculate
    voidMutation.mutate(
      {
        clerkOrgId: clerkOrgId!,
        sessionId,
        reason: "Recalculating to include late-arriving tips",
        voidedBy: null,
      },
      {
        onSuccess: () => {
          calculateMutation.mutate(
            {
              clerkOrgId: clerkOrgId!,
              locationId: session.location_id,
              sessionDate: session.session_date,
              shiftPeriod: session.shift_period,
              staffProfileId: null,
            },
            {
              onSuccess: (data) => {
                if (data?.session_id) {
                  router.push(`/dashboard/tips/${data.session_id}`);
                }
              },
            }
          );
        },
      }
    );
  };

  const handleApprove = () => {
    approveMutation.mutate({
      clerkOrgId: clerkOrgId!,
      sessionId,
      staffProfileId: null,
    });
  };

  const handleVoid = (reason: string) => {
    voidMutation.mutate(
      {
        clerkOrgId: clerkOrgId!,
        sessionId,
        reason,
        voidedBy: null,
      },
      {
        onSuccess: () => setVoidDialogOpen(false),
      }
    );
  };

  const handleAdjust = (detail: TipDetailWithStaff) => {
    setAdjustingDetail(detail);
    setAdjustDialogOpen(true);
  };

  const handleSubmitAdjustment = (detailId: string, amount: number, reason: string) => {
    adjustMutation.mutate({
      clerkOrgId: clerkOrgId!,
      detailId,
      amount,
      reason,
    });
  };

  const isEditable = session?.status === "calculated" || session?.status === "pending_approval";
  const canApprove = isEditable;
  const canVoid = session?.status !== "voided";
  const canExport = session?.status === "approved";
  const isVoided = session?.status === "voided";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push("/dashboard/tips")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Tip Distribution
        </Button>
        <Panel>
          <div className="p-8 text-center">
            <p className="text-muted-foreground">Session not found</p>
          </div>
        </Panel>
      </div>
    );
  }

  const sessionDateFormatted = format(
    new Date(session.session_date + "T00:00:00"),
    "EEEE, MMMM d, yyyy"
  );

  return (
    <div className="space-y-6">
      {/* BREADCRUMB + BACK */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/tips")}
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Tip Distribution
        </Button>

        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
          <span>Reports</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span>Tip Distribution</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Session Review</span>
        </nav>
      </div>

      {/* HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{sessionDateFormatted}</h1>
            {session.sequence_number > 1 && (
              <Badge variant="outline" className="text-xs font-mono">
                #{session.sequence_number}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">
              {SHIFT_LABELS[session.shift_period] || session.shift_period}
            </Badge>
            <TipStatusBadge status={session.status} />
            {session.data_start_after && session.data_cutoff_at && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(session.data_start_after), "h:mm a")} —{" "}
                {format(new Date(session.data_cutoff_at), "h:mm a")}
              </span>
            )}
            {session.calculated_at && (
              <span className="text-xs text-muted-foreground">
                Calculated{" "}
                {format(new Date(session.calculated_at), "MMM d 'at' h:mm a")}
              </span>
            )}
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-2 shrink-0">
          {canApprove && (
            <Button
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              
            >
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </Button>
          )}

          {canVoid && !isVoided && (
            <Button
              variant="outline"
              onClick={() => setVoidDialogOpen(true)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/40"
            >
              Void
            </Button>
          )}
        </div>
      </div>

      {/* VOIDED BANNER */}
      {isVoided && (
        <Alert className="border-red-300 bg-red-50 dark:bg-red-950/20">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            <p className="font-medium">This distribution has been voided</p>
            {session.void_reason && (
              <p className="text-sm mt-0.5">Reason: {session.void_reason}</p>
            )}
            {session.voided_at && (
              <p className="text-xs mt-0.5 text-red-600 dark:text-red-400">
                Voided {format(new Date(session.voided_at), "MMM d, yyyy 'at' h:mm a")}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* LATE TIP RECONCILIATION ALERT */}
      {reconciliation?.needsReconciliation && !isVoided && (
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">
                  {formatMoney(Math.abs(reconciliation.delta))} in tips arrived after this session was closed
                </p>
                {reconciliation.latePayments.length > 0 && (
                  <ul className="text-sm mt-1 space-y-0.5">
                    {reconciliation.latePayments.slice(0, 5).map((p, i) => (
                      <li key={i}>
                        Order: +{formatMoney(p.tipAmount)} tip captured{" "}
                        {format(new Date(p.capturedAt), "h:mm a")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => acknowledgeMutation.mutate({ clerkOrgId: clerkOrgId!, sessionId })}
                  disabled={acknowledgeMutation.isPending}
                >
                  Acknowledge
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleRecalculateForLateTips}
                  disabled={voidMutation.isPending || calculateMutation.isPending}
                >
                  {voidMutation.isPending || calculateMutation.isPending
                    ? "Recalculating..."
                    : "Recalculate to include"}
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* SUMMARY CARDS */}
      <TipSummaryCard session={session} />

      {/* DISTRIBUTION TABLE */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Employee Breakdown
        </h3>
        <TipDistributionTable
          details={session.tip_distribution_details || []}
          sessionStatus={session.status}
          onAdjust={isEditable ? handleAdjust : undefined}
          readOnly={!isEditable}
        />
      </div>

      {/* EXPORT HISTORY */}
      {(canExport || session.status === "approved") && clerkOrgId && (
        <ExportHistoryPanel
          clerkOrgId={clerkOrgId}
          sessionId={sessionId}
          sessionStatus={session.status}
        />
      )}

      {/* CONFIG SNAPSHOT */}
      {session.config_snapshot && (
        <ConfigSnapshotPanel snapshot={session.config_snapshot} />
      )}

      {/* DIALOGS */}
      <VoidDialog
        open={voidDialogOpen}
        onOpenChange={setVoidDialogOpen}
        onConfirm={handleVoid}
        isLoading={voidMutation.isPending}
      />

      <ManualAdjustmentDialog
        open={adjustDialogOpen}
        onOpenChange={setAdjustDialogOpen}
        detail={adjustingDetail}
        onSubmit={handleSubmitAdjustment}
        isLoading={adjustMutation.isPending}
      />
    </div>
  );
}
