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

const STATUS_STYLES: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-700 border-amber-200",
  sent:       "bg-green-100 text-green-700 border-green-200",
  failed:     "bg-red-100 text-red-700 border-red-200",
  downloaded: "bg-blue-100 text-blue-700 border-blue-200",
};

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
    exportMutation.mutate({
      clerkOrgId,
      sessionId,
      destination,
      exportedBy: null,
    });
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
        <div className="rounded-lg border divide-y">
          {exports.map((exp: TipPayrollExport) => (
            <div
              key={exp.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[10px] ${STATUS_STYLES[exp.status] || ""}`}
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

              {exp.status === "failed" && exp.error_message && (
                <span className="text-xs text-red-600 max-w-[200px] truncate">
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
          ))}
        </div>
      )}
    </div>
  );
}
