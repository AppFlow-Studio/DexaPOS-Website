"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code,
  Loader2,
  Plug,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import {
  useOrderOutMenuSync,
  useMenuPayloadDiff,
} from "@/app/dashboard/hooks/useOrderOutMenuSync";
import {
  usePushMenuToOrderOut,
  usePushMenuToChannels,
  usePushChannelsLiveStatus,
} from "@/app/dashboard/online-ordering/hooks/useOrderOutStatus";
import { SyncStatusBadge, formatTimeAgo } from "./OrderOutMenuStatus";
import { MenuChannelsCard } from "@/components/dashboard/orderout/MenuChannelsCard";
import Link from "next/link";

interface MenuOrderOutTabProps {
  menuId: string;
  locationId: string;
  clerkOrgId: string;
  menuName: string;
  isConfigured: boolean;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "-";
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  if (diffMs < 1000) return "<1s";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function MenuOrderOutTab({
  menuId,
  locationId,
  clerkOrgId,
  menuName,
  isConfigured,
}: MenuOrderOutTabProps) {
  const {
    data: syncResult,
    isLoading,
    refetch,
  } = useOrderOutMenuSync(clerkOrgId, locationId, menuId);
  const { data: diffResult, isLoading: isDiffLoading } = useMenuPayloadDiff(
    clerkOrgId,
    locationId,
    menuId
  );
  const pushMenuMutation = usePushMenuToOrderOut(clerkOrgId);
  const pushChannelsMutation = usePushMenuToChannels(clerkOrgId);
  const [activeSyncId, setActiveSyncId] = useState<string | null>(null);
  const channelsLive = usePushChannelsLiveStatus(clerkOrgId, activeSyncId);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showPayload, setShowPayload] = useState(false);

  const syncStatus = syncResult?.data ?? null;
  const lastSync = syncStatus?.lastSync;
  const ooMenuId = syncStatus?.ooMenuId ?? null;
  const syncHistory = syncStatus?.syncHistory ?? [];
  const platformStatuses = syncStatus?.platformStatuses ?? [];
  const connectedChannels = syncStatus?.connectedChannels ?? [];

  const handlePushChannels = () => {
    pushChannelsMutation.mutate(
      { clerkOrgId, menuId, locationId },
      {
        onSuccess: (res) => {
          if (res.success && res.data?.syncId) setActiveSyncId(res.data.syncId);
        },
      }
    );
  };

  const diffData = diffResult?.data ?? null;
  const hasChanges = diffData?.hasChanges ?? false;
  const isNewMenu = diffData?.isNewMenu ?? false;

  const handleSync = () => {
    pushMenuMutation.mutate(
      { clerkOrgId, menuId, locationId },
      { onSuccess: () => refetch() }
    );
    setIsConfirmOpen(false);
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Get last payload snapshot for preview
  const lastPayloadSnapshot = syncHistory.find(
    (s) => s.status === "success"
  );

  if (!isConfigured) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Plug className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold">OrderOut not connected for this location</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                To push menus to delivery platforms like UberEats and DoorDash, you first need to
                connect OrderOut for this location.
              </p>
            </div>

            <div className="w-full max-w-sm rounded-lg border bg-muted/40 p-4 text-left">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Setup steps
              </p>
              <ol className="space-y-2 text-sm text-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    1
                  </span>
                  Go to <span className="font-medium">Online Ordering</span> in the sidebar
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    2
                  </span>
                  Open the <span className="font-medium">OrderOut</span> tab
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    3
                  </span>
                  Fill in your restaurant details and click{" "}
                  <span className="font-medium">Connect to OrderOut</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    4
                  </span>
                  Come back here to push this menu
                </li>
              </ol>
            </div>

            <Button asChild>
              <Link href="/dashboard/online-ordering">
                Go to Online Ordering
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section 1: Sync Status Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Sync Status</CardTitle>
          <SyncStatusBadge lastSync={lastSync ?? null} />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">OrderOut Menu ID</p>
              <p className="text-sm font-medium">
                {ooMenuId ? (
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    {ooMenuId}
                  </code>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Synced</p>
              <p className="text-sm font-medium">
                {lastSync?.completedAt
                  ? formatTimeAgo(lastSync.completedAt)
                  : "Never"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Items Synced</p>
              <p className="text-sm font-medium">
                {lastSync?.itemsSynced ?? 0}
                {(lastSync?.itemsFailed ?? 0) > 0 && (
                  <span className="text-destructive ml-1">
                    ({lastSync?.itemsFailed} failed)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Syncs</p>
              <p className="text-sm font-medium">
                {syncStatus?.totalSyncs ?? 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 1b: Delivery Channels — per-menu status + push */}
      <MenuChannelsCard
        ooMenuId={ooMenuId}
        platformStatuses={platformStatuses}
        connectedChannels={connectedChannels}
        onPush={handlePushChannels}
        isPushing={pushChannelsMutation.isPending}
        live={channelsLive.data?.data ?? null}
      />

      {/* Section 2: Diff-based Sync Card */}
      {isDiffLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : hasChanges ? (
        isNewMenu ? (
          // New menu - blue styling
          <Card className="border-blue-500/50 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="flex items-center gap-3 py-3">
              <Upload className="h-5 w-5 text-blue-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Menu hasn&apos;t been uploaded to OrderOut yet
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {diffData?.currentItemCount ?? 0} items ready to upload.
                </p>
              </div>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setIsConfirmOpen(true)}
                disabled={pushMenuMutation.isPending}
              >
                {pushMenuMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1" />
                )}
                Upload to OrderOut
              </Button>
            </CardContent>
          </Card>
        ) : (
          // Changed menu - amber styling
          <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="flex items-center gap-3 py-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Menu has changed since last sync
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Local changes haven&apos;t been pushed to OrderOut yet.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950"
                onClick={() => setIsConfirmOpen(true)}
                disabled={pushMenuMutation.isPending}
              >
                {pushMenuMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                )}
                Sync to OrderOut
              </Button>
            </CardContent>
          </Card>
        )
      ) : lastSync?.status === "success" ? (
        // In sync - green confirmation
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CardContent className="flex items-center gap-3 py-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Menu is in sync with OrderOut
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">
                {lastSync.itemsSynced} items synced
                {lastSync.completedAt &&
                  ` \u2022 Last synced ${formatTimeAgo(lastSync.completedAt)}`}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Section 3: Sync History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Sync History</CardTitle>
        </CardHeader>
        <CardContent>
          {syncHistory.length === 0 ? (
            <Empty
              icon={Clock}
              title="No sync history"
              description="This menu hasn't been synced to OrderOut yet."
            />
          ) : (
            <Table>
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
                      className={
                        sync.errorDetails
                          ? "cursor-pointer hover:bg-muted/50"
                          : ""
                      }
                      onClick={() => sync.errorDetails && toggleRow(sync.id)}
                    >
                      <TableCell className="text-sm">
                        {new Date(sync.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {sync.status === "success" && (
                          <Badge
                            variant="default"
                            className="bg-green-600 text-xs"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Success
                          </Badge>
                        )}
                        {sync.status === "failed" && (
                          <Badge variant="destructive" className="text-xs">
                            <XCircle className="h-3 w-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                        {sync.status === "pending" && (
                          <Badge variant="secondary" className="text-xs">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Pending
                          </Badge>
                        )}
                        {!["success", "failed", "pending"].includes(
                          sync.status
                        ) && (
                          <Badge variant="secondary" className="text-xs">
                            {sync.status}
                          </Badge>
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
                          <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
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
        </CardContent>
      </Card>

      {/* Section 4: Payload Preview (collapsible) */}
      {lastPayloadSnapshot && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setShowPayload(!showPayload)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Code className="h-4 w-4" />
                Last Synced Payload
              </CardTitle>
              {showPayload ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {showPayload && (
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                The JSON payload that was last sent to OrderOut for this menu.
              </p>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-96 font-mono">
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
            </CardContent>
          )}
        </Card>
      )}

      {/* Sync Confirmation Dialog */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isNewMenu
                ? "Upload Menu to OrderOut"
                : "Sync Menu to OrderOut"}
            </DialogTitle>
            <DialogDescription>
              This will {isNewMenu ? "upload" : "update"} &quot;{menuName}&quot;
              to OrderOut and update delivery platforms. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={pushMenuMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSync}
              disabled={pushMenuMutation.isPending}
            >
              {pushMenuMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              {isNewMenu ? "Upload" : "Sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
