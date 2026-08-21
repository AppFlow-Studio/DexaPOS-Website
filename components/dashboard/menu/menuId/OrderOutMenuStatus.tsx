"use client";

import { Panel, PanelSection } from "@/components/dashboard/shell";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import type { OrderOutMenuSyncStatus } from "@/app/dashboard/actions/orderout";

interface OrderOutMenuStatusProps {
  syncStatus: OrderOutMenuSyncStatus | null;
  isLoading: boolean;
  ooMenuId?: string | null;
}

export function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Soft tint + icon rather than a solid saturated fill (D-11). Classes are
 * literal strings, not sourced from a `.ts` constants module — Tailwind does
 * not scan those, so the rule would never be generated (C7).
 */
const SYNC_BADGE =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";
const SYNC_BADGE_NEUTRAL = "bg-muted/60 text-muted-foreground";

export function SyncStatusBadge({ lastSync }: { lastSync: OrderOutMenuSyncStatus["lastSync"] }) {
  if (!lastSync) {
    return (
      <span className={`${SYNC_BADGE} ${SYNC_BADGE_NEUTRAL}`}>
        <Clock className="h-3 w-3" />
        Never Synced
      </span>
    );
  }
  if (lastSync.status === "success") {
    return (
      <span className={`${SYNC_BADGE} bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400`}>
        <CheckCircle2 className="h-3 w-3" />
        Synced {formatTimeAgo(lastSync.completedAt || lastSync.createdAt)}
      </span>
    );
  }
  if (lastSync.status === "failed") {
    return (
      <span className={`${SYNC_BADGE} bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400`}>
        <XCircle className="h-3 w-3" />
        Sync Failed
      </span>
    );
  }
  if (lastSync.status === "pending") {
    return (
      <span className={`${SYNC_BADGE} ${SYNC_BADGE_NEUTRAL}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Syncing...
      </span>
    );
  }
  return <span className={`${SYNC_BADGE} ${SYNC_BADGE_NEUTRAL}`}>{lastSync.status}</span>;
}

export function OrderOutMenuStatus({
  syncStatus,
  isLoading,
  ooMenuId,
}: OrderOutMenuStatusProps) {
  const [showError, setShowError] = useState(false);
  const lastSync = syncStatus?.lastSync;

  if (isLoading) {
    return (
      <Panel>
        <PanelSection label="OrderOut Status">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </PanelSection>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelSection
        label="OrderOut Delivery"
        action={<SyncStatusBadge lastSync={lastSync ?? null} />}
        className="space-y-3"
      >
        {ooMenuId && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Menu ID</span>
            <code className="rounded-full bg-muted/60 px-2.5 py-0.5 font-mono text-xs">
              {ooMenuId}
            </code>
          </div>
        )}

        {lastSync && lastSync.status === "success" && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {lastSync.itemsSynced} items synced
            </span>
            {lastSync.itemsFailed > 0 && (
              <span className="text-destructive">
                {lastSync.itemsFailed} failed
              </span>
            )}
          </div>
        )}

        {lastSync?.status === "failed" && lastSync.errorDetails && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setShowError(!showError)}
              className="flex items-center gap-1 text-sm text-destructive hover:underline"
            >
              {showError ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              Error details
            </button>
            {showError && (
              <p className="rounded-2xl bg-destructive/10 p-3 text-xs text-destructive">
                {lastSync.errorDetails}
              </p>
            )}
          </div>
        )}
      </PanelSection>
    </Panel>
  );
}
