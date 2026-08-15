"use client";

import { Download, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSessionExports,
  useExportTipDistributionV2,
} from "../hooks/useTipDistribution";
import { formatDistanceToNow } from "date-fns";
import type { TipPayrollExport } from "@/app/dashboard/actions/tips";

interface ExportHistoryPanelProps {
  clerkOrgId: string;
  sessionId: string;
  sessionStatus: string;
}

const DESTINATION_LABELS: Record<string, string> = {
  csv: "CSV",
  gusto: "Gusto",
  adp: "ADP",
};

function downloadCSVFromPayload(payload: any) {
  const session = payload?.session || {};
  const rows = payload?.rows || [];
  if (rows.length === 0) return;

  const headers = [
    "Employee", "Role", "Hours", "Charged Tips", "Cash Tips",
    "Pool Contributed", "Pool Received", "Tip-Out Given", "Tip-Out Received",
    "Adjustment", "Net Tips",
  ];

  const csvRows = rows.map((r: any) => [
    r.staff_name || "",
    r.role_code || "",
    (r.hours_worked ?? 0).toFixed(1),
    `$${(r.charged_tips ?? 0).toFixed(2)}`,
    `$${(r.cash_tips ?? 0).toFixed(2)}`,
    `$${(r.tip_pool_contributed ?? 0).toFixed(2)}`,
    `$${(r.tip_pool_received ?? 0).toFixed(2)}`,
    `$${(r.tip_out_given ?? 0).toFixed(2)}`,
    `$${(r.tip_out_received ?? 0).toFixed(2)}`,
    `$${(r.manual_adjustment ?? 0).toFixed(2)}`,
    `$${(r.net_tips ?? 0).toFixed(2)}`,
  ]);

  const csv = [
    headers.join(","),
    ...csvRows.map((row: string[]) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tip-distribution-${session.session_date || "export"}-${session.shift_period || "full_day"}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export function ExportHistoryPanel({
  clerkOrgId,
  sessionId,
  sessionStatus,
}: ExportHistoryPanelProps) {
  const { data: exports = [], isLoading } = useSessionExports(
    clerkOrgId,
    sessionId
  );
  const exportMutation = useExportTipDistributionV2();

  const canExport = sessionStatus === "approved";

  const handleExport = (destination: "csv" | "gusto" | "adp") => {
    exportMutation.mutate(
      { clerkOrgId, sessionId, destination, exportedBy: null },
      {
        onSuccess: (data) => {
          // For CSV: trigger browser download from the returned payload
          if (destination === "csv" && data?.payload) {
            downloadCSVFromPayload(data.payload);
          }
        },
      }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Exports
        </h3>

        {canExport && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport("csv")}
              disabled={exportMutation.isPending}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport("gusto")}
              disabled={exportMutation.isPending}
            >
              Gusto
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport("adp")}
              disabled={exportMutation.isPending}
            >
              ADP
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : exports.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          {canExport
            ? "No exports yet. Use the buttons above to export."
            : "No exports recorded for this session."}
        </p>
      ) : (
        /* §5.5 — rows sit on their own card fill inside a tinted well; no
           frame and no divider lines between them. */
        <div className="space-y-1.5 rounded-2xl bg-muted/20 p-2">
          {exports.map((exp: TipPayrollExport) => (
            <div
              key={exp.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-2xl bg-card/70 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                {/* D-12: one neutral pill for every export state. */}
                <Badge
                  variant="secondary"
                  className="w-fit rounded-full border-0 px-2.5 text-[10px] font-medium"
                >
                  {exp.status}
                </Badge>
                <span className="font-medium">
                  {DESTINATION_LABELS[exp.destination] || exp.destination}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(exp.exported_at), { addSuffix: true })}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {/* Re-download CSV from stored payload */}
                {exp.destination === "csv" && exp.payload && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => downloadCSVFromPayload(exp.payload)}
                    className="h-7 text-xs"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download
                  </Button>
                )}

                {exp.status === "failed" && exp.error_message && (
                  <span className="text-xs text-destructive max-w-[200px] truncate mr-1">
                    {exp.error_message}
                  </span>
                )}

                {exp.status === "failed" && canExport && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      handleExport(exp.destination as "csv" | "gusto" | "adp")
                    }
                    disabled={exportMutation.isPending}
                    className="h-7 text-xs"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Retry
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
