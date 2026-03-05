"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export function SyncStatusBadge({ lastSync }: { lastSync: OrderOutMenuSyncStatus["lastSync"] }) {
  if (!lastSync) {
    return (
      <Badge variant="secondary">
        <Clock className="h-3 w-3 mr-1" />
        Never Synced
      </Badge>
    );
  }
  if (lastSync.status === "success") {
    return (
      <Badge variant="default" className="bg-green-600">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Synced {formatTimeAgo(lastSync.completedAt || lastSync.createdAt)}
      </Badge>
    );
  }
  if (lastSync.status === "failed") {
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3 mr-1" />
        Sync Failed
      </Badge>
    );
  }
  if (lastSync.status === "pending") {
    return (
      <Badge variant="secondary">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Syncing...
      </Badge>
    );
  }
  return <Badge variant="secondary">{lastSync.status}</Badge>;
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
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">OrderOut Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          OrderOut Delivery
        </CardTitle>
        <SyncStatusBadge lastSync={lastSync ?? null} />
      </CardHeader>
      <CardContent className="space-y-3">
        {ooMenuId && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Menu ID:</span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
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
              <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
                {lastSync.errorDetails}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
