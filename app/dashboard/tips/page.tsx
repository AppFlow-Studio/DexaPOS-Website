"use client";

import { useState } from "react";
import { format } from "date-fns";
import { MapPin, Download, ChevronRight, Plus } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useLocationStore } from "@/stores/location-store";
import {
  useTipDistributionSession,
  useTipDistributionHistory,
  useCalculateTipDistribution,
  useApproveTipDistribution,
  useManualAdjustment,
  useExportTipDistribution,
} from "./hooks/useTipDistribution";
import { TipDateShiftSelector } from "./components/TipDateShiftSelector";
import { TipSummaryCard } from "./components/TipSummaryCard";
import { TipDistributionTable } from "./components/TipDistributionTable";
import { ManualAdjustmentDialog } from "./components/ManualAdjustmentDialog";
import { TipHistorySection } from "./components/TipHistorySection";
import type { TipDetailWithStaff } from "@/app/dashboard/actions/tips";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700 border-gray-200" },
  calculated: { label: "Calculated", className: "bg-blue-100 text-blue-700 border-blue-200" },
  pending_approval: { label: "Pending Approval", className: "bg-amber-100 text-amber-700 border-amber-200" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700 border-green-200" },
  exported: { label: "Exported", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  voided: { label: "Voided", className: "bg-red-100 text-red-700 border-red-200" },
};

export default function TipsPage() {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();

  const [sessionDate, setSessionDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shiftPeriod, setShiftPeriod] = useState<"full_day" | "lunch" | "dinner" | "custom">(
    "full_day"
  );
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [adjustingDetail, setAdjustingDetail] = useState<TipDetailWithStaff | null>(null);
  const [showRecalculateWarning, setShowRecalculateWarning] = useState(false);
  // Controls whether the session detail panel is open
  const [detailOpen, setDetailOpen] = useState(false);

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

  const calculateMutation = useCalculateTipDistribution();
  const approveMutation = useApproveTipDistribution();
  const adjustMutation = useManualAdjustment();
  const exportMutation = useExportTipDistribution();

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
      amount: amount * 100,
      reason,
    });
  };

  const handleExportCSV = () => {
    if (!session) return;
    const headers = [
      "Employee", "Role", "Hours", "Own Tips", "Pool In", "Pool Out",
      "Tip-Out In", "Tip-Out Out", "Adjustment", "Net Tips",
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
    // Mark session as exported in the DB
    exportMutation.mutate({ clerkOrgId: clerkOrgId!, sessionId: session.id, exportFormat: "csv" });
  };

  const handleExportPDF = () => {
    if (!session) return;
    const details = session.tip_distribution_details;
    const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    const rows = details
      .map(
        (d) => `
        <tr>
          <td>${d.staff_profiles.display_name || `${d.staff_profiles.first_name} ${d.staff_profiles.last_name}`}</td>
          <td>${d.role_code}</td>
          <td>${(d.hours_worked || 0).toFixed(1)}</td>
          <td>${fmt(d.individual_tips_earned)}</td>
          <td>${fmt(d.tip_pool_received)}</td>
          <td>${fmt(d.tip_pool_contributed)}</td>
          <td>${fmt(d.tip_out_received)}</td>
          <td>${fmt(d.tip_out_given)}</td>
          <td>${fmt(d.manual_adjustment)}</td>
          <td><strong>${fmt(d.net_tips)}</strong></td>
        </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html><html><head><title>Tip Distribution — ${sessionDate}</title>
<style>
  body { font-family: sans-serif; padding: 24px; font-size: 12px; }
  h2 { margin-bottom: 4px; }
  p { margin: 0 0 16px; color: #666; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; text-align: left; padding: 6px 8px; border-bottom: 2px solid #e5e7eb; font-size: 11px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  @media print { button { display: none; } }
</style></head><body>
<h2>Tip Distribution Report</h2>
<p>${sessionDate} — ${shiftPeriod.replace("_", " ")}</p>
<table>
  <thead><tr>
    <th>Employee</th><th>Role</th><th>Hours</th><th>Own Tips</th>
    <th>Pool In</th><th>Pool Out</th><th>T-Out In</th><th>T-Out Out</th>
    <th>Adj</th><th>Net Tips</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<br/><button onclick="window.print()">Print / Save as PDF</button>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
    // Mark session as exported in the DB
    exportMutation.mutate({ clerkOrgId: clerkOrgId!, sessionId: session.id, exportFormat: "pdf" });
  };

  const handleSelectHistory = (historyDate: string, historyShift: string) => {
    setSessionDate(historyDate);
    setShiftPeriod(historyShift as any);
    setDetailOpen(true);
  };

  const handleNewSession = () => {
    setSessionDate(format(new Date(), "yyyy-MM-dd"));
    setShiftPeriod("full_day");
    setDetailOpen(true);
  };

  // Guard: location must be selected
  if (selectedLocationId === "all") {
    return (
      <div className="space-y-6">
        {/* Breadcrumb */}
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
                Tip distribution is location-specific. Please select a specific location from the
                top navigation to manage tips for that location.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const statusCfg = session ? (STATUS_CONFIG[session.status] ?? STATUS_CONFIG.draft) : null;

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex items-start justify-between">
        <div>
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
            <span>Reports</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground font-medium">Tip Distribution</span>
          </nav>
          <h1 className="text-2xl font-bold">Tip Distribution</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Calculate and manage tip distribution for your staff
          </p>
        </div>

        <Button
          onClick={handleNewSession}
          className="bg-teal-500 hover:bg-teal-600 text-white shrink-0"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Session
        </Button>
      </div>

      {/* HISTORY TABLE — primary content */}
      <TipHistorySection
        sessions={history}
        onSelectSession={handleSelectHistory}
        isLoading={historyLoading}
        activeSessionId={detailOpen ? session?.id : undefined}
      />

      {/* SESSION DETAIL PANEL — shown when a session is selected or new session started */}
      {detailOpen && (
        <div className="border rounded-lg overflow-hidden">
          {/* Detail header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-sm">Session Detail</h3>
              {statusCfg && (
                <Badge
                  variant="outline"
                  className={`text-xs font-medium ${statusCfg.className}`}
                >
                  {statusCfg.label}
                </Badge>
              )}
            </div>

            {/* Contextual action — exactly ONE primary button based on status */}
            <div className="flex items-center gap-2">
              {(!session || session.status === "draft") && (
                <Button
                  onClick={handleCalculate}
                  disabled={
                    calculateMutation.isPending ||
                    !selectedLocationId ||
                    selectedLocationId === "all"
                  }
                  className="bg-teal-500 hover:bg-teal-600 text-white"
                  size="sm"
                >
                  {calculateMutation.isPending ? "Calculating…" : "Calculate Tips"}
                </Button>
              )}

              {(session?.status === "calculated" || session?.status === "pending_approval") && (
                <Button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="bg-teal-500 hover:bg-teal-600 text-white"
                  size="sm"
                >
                  {approveMutation.isPending ? "Approving…" : "Approve Distribution"}
                </Button>
              )}

              {(session?.status === "approved" || session?.status === "exported") && (
                <>
                  <Button
                    onClick={handleCalculate}
                    variant="outline"
                    size="sm"
                    disabled={calculateMutation.isPending}
                  >
                    Recalculate
                  </Button>
                  <Button
                    onClick={handleExportCSV}
                    variant="outline"
                    size="sm"
                    disabled={exportMutation.isPending}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button
                    onClick={handleExportPDF}
                    variant="outline"
                    size="sm"
                    disabled={exportMutation.isPending}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Filter bar inside detail */}
          <div className="px-4">
            <TipDateShiftSelector
              date={sessionDate}
              shiftPeriod={shiftPeriod}
              onDateChange={setSessionDate}
              onShiftChange={(shift) => setShiftPeriod(shift as any)}
            />
          </div>

          {/* KPI cards — only when session exists */}
          {(session || sessionLoading) && (
            <div className="px-4 py-4">
              <TipSummaryCard session={session || null} isLoading={sessionLoading} />
            </div>
          )}

          {/* No session yet — prompt to calculate */}
          {!session && !sessionLoading && (
            <div className="px-4 py-8 text-center text-muted-foreground">
              <p className="text-sm">No session found for this date and shift.</p>
              <p className="text-xs mt-1">Click <strong>Calculate Tips</strong> to create one.</p>
            </div>
          )}

          {/* Distribution table */}
          {session && (
            <div className="px-4 pb-4">
              <TipDistributionTable
                details={session.tip_distribution_details || []}
                sessionStatus={session.status}
                onAdjust={handleAdjust}
                isLoading={sessionLoading}
              />
            </div>
          )}
        </div>
      )}

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
