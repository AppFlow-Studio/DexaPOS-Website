"use client";

import React, { useState } from "react";
import { Panel, PanelSection } from "@/components/dashboard/shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code,
  Loader2,
  XCircle,
} from "lucide-react";
import type { OrderOutMenuSyncStatus } from "@/app/dashboard/actions/orderout";

// ============================================================================
// Shared OrderOut sync-history + payload-preview.
// Extracted from MenuOrderOutTab so the per-menu editor tab and the
// location-level OrderOut tab render an identical Sync History table and
// Last-Synced Payload panel from one implementation.
// ============================================================================

type SyncHistoryEntry = OrderOutMenuSyncStatus["syncHistory"][number];

export function formatDuration(start: string, end: string | null): string {
  if (!end) return "-";
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  if (diffMs < 1000) return "<1s";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/** Sync History audit table with expandable error detail rows. */
export function MenuSyncHistoryTable({
  syncHistory,
}: {
  syncHistory: SyncHistoryEntry[];
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Panel>
      <PanelSection label="Sync History">
        {syncHistory.length === 0 ? (
          <Empty
            icon={Clock}
            title="No sync history"
            description="This menu hasn't been synced to OrderOut yet."
          />
        ) : (
          <Table variant="data" className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Items Synced</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {syncHistory.map((sync) => (
                <React.Fragment key={sync.id}>
                  <TableRow
                    className={sync.errorDetails ? "cursor-pointer" : ""}
                    onClick={() => sync.errorDetails && toggleRow(sync.id)}
                  >
                    <TableCell className="text-sm">
                      {new Date(sync.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {/* Soft tint + icon, not a solid saturated fill (D-11).
                          Classes literal, not from a .ts module — see C7. */}
                      {sync.status === "success" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Success
                        </span>
                      )}
                      {sync.status === "failed" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
                          <XCircle className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                      {sync.status === "pending" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Pending
                        </span>
                      )}
                      {!["success", "failed", "pending"].includes(
                        sync.status
                      ) && (
                        <span className="inline-flex items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {sync.status}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {sync.itemsSynced}
                    </TableCell>
                    <TableCell className="text-right">
                      {sync.itemsFailed > 0 ? (
                        <span className="text-destructive">
                          {sync.itemsFailed}
                        </span>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDuration(sync.createdAt, sync.completedAt)}
                    </TableCell>
                    <TableCell>
                      {sync.errorDetails &&
                        (expandedRows.has(sync.id) ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ))}
                    </TableCell>
                  </TableRow>
                  {sync.errorDetails && expandedRows.has(sync.id) && (
                    <TableRow key={`${sync.id}-error`}>
                      <TableCell colSpan={6}>
                        <p className="rounded-2xl bg-destructive/10 p-3 text-xs text-destructive">
                          {sync.errorDetails}
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelSection>
    </Panel>
  );
}

/**
 * Collapsible preview of the last successfully-synced payload. Renders nothing
 * until at least one success snapshot exists, so callers can drop it in
 * unconditionally.
 */
export function MenuSyncPayloadPreview({
  syncHistory,
  menuName,
}: {
  syncHistory: SyncHistoryEntry[];
  menuName: string;
}) {
  const [showPayload, setShowPayload] = useState(false);
  const lastPayloadSnapshot = syncHistory.find((s) => s.status === "success");

  if (!lastPayloadSnapshot) return null;

  return (
    <Panel className="rounded-[2rem]">
      <PanelSection
        label={
          <button
            type="button"
            aria-expanded={showPayload}
            onClick={() => setShowPayload(!showPayload)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Code className="h-[1.125rem] w-[1.125rem] shrink-0" />
              <span className="truncate">Last Synced Payload</span>
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {showPayload ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          </button>
        }
      >
        {showPayload && (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              The JSON payload that was last sent to OrderOut for this menu.
            </p>
            <pre className="max-h-96 overflow-auto rounded-2xl bg-muted/60 p-4 font-mono text-xs">
              Sync ID: {lastPayloadSnapshot.id}
              {"\n"}Menu Name: {lastPayloadSnapshot.menuName || menuName}
              {"\n"}Items Synced: {lastPayloadSnapshot.itemsSynced}
              {"\n"}Synced At:{" "}
              {lastPayloadSnapshot.completedAt
                ? new Date(lastPayloadSnapshot.completedAt).toLocaleString()
                : "N/A"}
              {"\n"}OrderOut Menu ID:{" "}
              {lastPayloadSnapshot.ooMenuId || "Not available"}
            </pre>
          </>
        )}
      </PanelSection>
    </Panel>
  );
}
