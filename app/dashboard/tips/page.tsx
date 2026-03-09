"use client";

import { useState } from "react";
import { format } from "date-fns";
import { MapPin, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useLocationStore } from "@/stores/location-store";
import {
  useTipDistributionSession,
  useTipDistributionHistory,
  useCalculateTipDistribution,
  useApproveTipDistribution,
  useManualAdjustment,
} from "./hooks/useTipDistribution";
import { TipDateShiftSelector } from "./components/TipDateShiftSelector";
import { TipSummaryCard } from "./components/TipSummaryCard";
import { TipDistributionTable } from "./components/TipDistributionTable";
import { ManualAdjustmentDialog } from "./components/ManualAdjustmentDialog";
import { TipHistorySection } from "./components/TipHistorySection";
import type { TipDetailWithStaff } from "@/app/dashboard/actions/tips";

export default function TipsPage() {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();

  // State
  const [sessionDate, setSessionDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shiftPeriod, setShiftPeriod] = useState<"full_day" | "lunch" | "dinner" | "custom">(
    "full_day"
  );
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [adjustingDetail, setAdjustingDetail] = useState<TipDetailWithStaff | null>(null);
  const [showRecalculateWarning, setShowRecalculateWarning] = useState(false);

  // Queries
  const { data: session, isLoading: sessionLoading } = useTipDistributionSession(
    clerkOrgId,
    selectedLocationId !== "all" ? selectedLocationId : undefined,
    sessionDate,
    shiftPeriod
  );

  const { data: history = [], isLoading: historyLoading } = useTipDistributionHistory(
    clerkOrgId,
    selectedLocationId !== "all" ? selectedLocationId : undefined
  );

  // Mutations
  const calculateMutation = useCalculateTipDistribution();
  const approveMutation = useApproveTipDistribution();
  const adjustMutation = useManualAdjustment();

  // Handlers
  const handleCalculate = async () => {
    if (session?.status === "approved") {
      setShowRecalculateWarning(true);
      return;
    }

    calculateMutation.mutate({
      clerkOrgId: clerkOrgId!,
      locationId: selectedLocationId!,
      sessionDate,
      shiftPeriod,
      staffProfileId: null,
    });
  };

  const handleRecalculate = async () => {
    setShowRecalculateWarning(false);
    calculateMutation.mutate({
      clerkOrgId: clerkOrgId!,
      locationId: selectedLocationId!,
      sessionDate,
      shiftPeriod,
      staffProfileId: null,
    });
  };

  const handleApprove = () => {
    approveMutation.mutate({
      clerkOrgId: clerkOrgId!,
      sessionId: session!.id,
      staffProfileId: null,
    });
  };

  const handleAdjust = (detail: TipDetailWithStaff) => {
    setAdjustingDetail(detail);
    setIsAdjustDialogOpen(true);
  };

  const handleSubmitAdjustment = (detailId: string, amount: number, reason: string) => {
    adjustMutation.mutate({
      clerkOrgId: clerkOrgId!,
      detailId,
      amount: amount * 100, // Convert to cents
      reason,
    });
  };

  const handleExport = () => {
    if (!session) return;

    const headers = [
      "Employee",
      "Role",
      "Hours",
      "Own Tips",
      "Pool In",
      "Pool Out",
      "Tip-Out In",
      "Tip-Out Out",
      "Adjustment",
      "Net Tips",
    ];

    const rows = session.tip_distribution_details.map((detail) => [
      detail.staff_profiles.display_name || `${detail.staff_profiles.first_name} ${detail.staff_profiles.last_name}`,
      detail.role_code,
      (detail.hours_worked || 0).toFixed(1),
      `$${(detail.individual_tips_earned / 100).toFixed(2)}`,
      `$${(detail.tip_pool_received / 100).toFixed(2)}`,
      `$${(detail.tip_pool_contributed / 100).toFixed(2)}`,
      `$${(detail.tip_out_received / 100).toFixed(2)}`,
      `$${(detail.tip_out_given / 100).toFixed(2)}`,
      `$${(detail.manual_adjustment / 100).toFixed(2)}`,
      `$${(detail.net_tips / 100).toFixed(2)}`,
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tip-distribution-${sessionDate}-${shiftPeriod}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleSelectHistory = (historyDate: string, historyShift: string) => {
    setSessionDate(historyDate);
    setShiftPeriod(historyShift as any);
  };

  // Guard: location must be selected
  if (selectedLocationId === "all") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Tip Distribution</h1>
          <p className="text-muted-foreground mt-2">
            Calculate and manage tip distribution for your staff
          </p>
        </div>

        <Card className="p-6 border-yellow-200 bg-yellow-50">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">Select a Location</h3>
              <p className="text-sm text-yellow-800 mt-1">
                Tip distribution is location-specific. Please select a specific location from the
                top navigation to manage tips for that location.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tip Distribution</h1>
        <p className="text-muted-foreground mt-2">
          Calculate and manage tip distribution for your staff
        </p>
      </div>

      {/* DATE & SHIFT SELECTOR */}
      <TipDateShiftSelector
        date={sessionDate}
        shiftPeriod={shiftPeriod}
        onDateChange={setSessionDate}
        onShiftChange={(shift) => setShiftPeriod(shift as any)}
      />

      {/* SUMMARY & ACTION BUTTONS */}
      <div className="flex flex-col gap-4">
        <TipSummaryCard session={session || null} isLoading={sessionLoading} />

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleCalculate}
            disabled={calculateMutation.isPending || !selectedLocationId || selectedLocationId === "all"}
            size="lg"
          >
            {calculateMutation.isPending ? "Calculating..." : "Calculate Tips"}
          </Button>

          {session?.status === "calculated" && (
            <Button
              onClick={handleApprove}
              variant="default"
              disabled={approveMutation.isPending}
              size="lg"
            >
              {approveMutation.isPending ? "Approving..." : "Approve Distribution"}
            </Button>
          )}

          {session?.status === "approved" && (
            <Button
              onClick={handleExport}
              variant="outline"
              size="lg"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* DISTRIBUTION TABLE */}
      {session && (
        <>
          <TipDistributionTable
            details={session.tip_distribution_details || []}
            sessionStatus={session.status}
            onAdjust={handleAdjust}
            isLoading={sessionLoading}
          />
        </>
      )}

      {/* HISTORY SECTION */}
      <TipHistorySection
        sessions={history}
        onSelectSession={handleSelectHistory}
        isLoading={historyLoading}
      />

      {/* MANUAL ADJUSTMENT DIALOG */}
      <ManualAdjustmentDialog
        open={isAdjustDialogOpen}
        onOpenChange={setIsAdjustDialogOpen}
        detail={adjustingDetail}
        onSubmit={handleSubmitAdjustment}
        isLoading={adjustMutation.isPending}
      />

      {/* RECALCULATE WARNING */}
      <AlertDialog open={showRecalculateWarning} onOpenChange={setShowRecalculateWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalculate Approved Distribution?</AlertDialogTitle>
            <AlertDialogDescription>
              This distribution has already been approved. Recalculating will void the approval
              status. Are you sure you want to recalculate?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecalculate}>
              Yes, Recalculate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
