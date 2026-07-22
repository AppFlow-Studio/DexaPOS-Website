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
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code,
  Loader2,
  Plug,
  RefreshCw,
  Star,
  Upload,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import {
  useOrderOutMenuSync,
  useMenuPayloadDiff,
} from "@/app/dashboard/hooks/useOrderOutMenuSync";
import {
  usePushMenuToChannels,
  usePushChannelsLiveStatus,
  useLocationOnlineMenu,
  usePublishOnlineMenu,
} from "@/app/dashboard/online-ordering/hooks/useOrderOutStatus";
import { SyncStatusBadge, formatTimeAgo } from "./OrderOutMenuStatus";
import { OrderOutLiveMenuCheck } from "./OrderOutLiveMenuCheck";
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
  const pushChannelsMutation = usePushMenuToChannels(clerkOrgId);
  const publishMutation = usePublishOnlineMenu(clerkOrgId);
  const { data: onlineMenu } = useLocationOnlineMenu(clerkOrgId, locationId);
  const [activeSyncId, setActiveSyncId] = useState<string | null>(null);
  const channelsLive = usePushChannelsLiveStatus(clerkOrgId, activeSyncId);
  // Confirm dialog: 'publish' = push the current online menu; 'designate' = make
  // THIS menu the online menu, then publish it. Both end at the ONE online menu.
  const [confirmAction, setConfirmAction] = useState<
    null | "publish" | "designate"
  >(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showPayload, setShowPayload] = useState(false);

  const syncStatus = syncResult?.data ?? null;
  const lastSync = syncStatus?.lastSync;
  const ooMenuId = syncStatus?.ooMenuId ?? null;
  const syncHistory = syncStatus?.syncHistory ?? [];
  const platformStatuses = syncStatus?.platformStatuses ?? [];
  const connectedChannels = syncStatus?.connectedChannels ?? [];

  // Which menu handles online orders for this location (the single push target).
  const primaryMenuId = onlineMenu?.primaryMenuId ?? null;
  const primaryMenuName = onlineMenu?.primaryMenuName ?? null;
  const hasOnlineMenu = !!primaryMenuId;
  const isThisOnline =
    (syncStatus?.isPrimaryOnlineMenu ?? false) || primaryMenuId === menuId;

  const diffData = diffResult?.data ?? null;
  const hasChanges = diffData?.hasChanges ?? false;
  const isNewMenu = diffData?.isNewMenu ?? false;
  const itemCount = diffData?.currentItemCount ?? lastSync?.itemsSynced ?? 0;

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

  // Publishing always resolves to the ONE designated online menu. 'designate'
  // makes THIS menu the online menu first (first pick or a deliberate switch).
  const runPublish = () => {
    publishMutation.mutate(
      {
        locationId,
        ...(confirmAction === "designate" ? { designateMenuId: menuId } : {}),
      },
      { onSuccess: () => refetch() },
    );
    setConfirmAction(null);
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

      {/* Section 1.5: verify a 86 actually reached the delivery apps. */}
      <OrderOutLiveMenuCheck clerkOrgId={clerkOrgId} locationId={locationId} />

      {/* Section 1a: THE online menu control — one clear place to publish, always
          targeting the single designated online menu (foolproof). */}
      <OnlineMenuControlCard
        state={
          isThisOnline ? "this" : hasOnlineMenu ? "other" : "none"
        }
        thisMenuName={menuName}
        onlineMenuHref={primaryMenuId ? `/dashboard/menu/${primaryMenuId}` : null}
        primaryMenuName={primaryMenuName}
        itemCount={itemCount}
        hasChanges={hasChanges}
        isNewMenu={isNewMenu}
        isPublishing={publishMutation.isPending}
        onPublish={() => setConfirmAction("publish")}
        onMakeOnline={() => setConfirmAction("designate")}
      />

      {/* Section 1b: Delivery Channels — only the online menu fans out to channels */}
      {isThisOnline && (
        <MenuChannelsCard
          ooMenuId={ooMenuId}
          platformStatuses={platformStatuses}
          connectedChannels={connectedChannels}
          onPush={handlePushChannels}
          isPushing={pushChannelsMutation.isPending}
          live={channelsLive.data?.data ?? null}
        />
      )}

      {/* (Publish + changes-pending live in OnlineMenuControlCard above.) */}

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

      {/* Publish Confirmation — names the exact menu that will go live so a
          merchant always sees what customers will get (dummy-proof). */}
      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "designate"
                ? "Make this your online menu?"
                : "Publish your online menu?"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Publishing your online menu:{" "}
                  <span className="font-semibold text-foreground">
                    {confirmAction === "designate"
                      ? menuName
                      : primaryMenuName ?? menuName}
                  </span>{" "}
                  — <span className="font-semibold text-foreground">{itemCount} items</span>.
                </p>
                <p>
                  This is exactly what customers see on your online store and
                  connected delivery apps (Uber Eats, DoorDash, Grubhub).
                </p>
                {confirmAction === "designate" && hasOnlineMenu && (
                  <p className="text-amber-700">
                    This replaces{" "}
                    <span className="font-medium">{primaryMenuName}</span> as your
                    online menu. Only one menu can handle online orders.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={publishMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={runPublish} disabled={publishMutation.isPending}>
              {publishMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              {confirmAction === "designate" ? "Make online & publish" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The single, unambiguous "online menu" control. Three states so a merchant is
 * never confused about which menu customers see:
 *   this  — this menu IS the online menu → publish it (the only push here)
 *   other — a different menu is the online menu → point to it; publishing lives there
 *   none  — no online menu yet → make this one the online menu
 * Publishing always resolves to the ONE designated online menu server-side, so a
 * non-online menu can't be pushed by accident.
 */
export function OnlineMenuControlCard({
  state,
  thisMenuName,
  onlineMenuHref,
  primaryMenuName,
  itemCount,
  hasChanges,
  isNewMenu,
  isPublishing,
  onPublish,
  onMakeOnline,
}: {
  state: "this" | "other" | "none";
  thisMenuName: string;
  /** Link to the designated online menu (route differs merchant vs HQ admin). */
  onlineMenuHref: string | null;
  primaryMenuName: string | null;
  itemCount: number;
  hasChanges: boolean;
  isNewMenu: boolean;
  isPublishing: boolean;
  onPublish: () => void;
  onMakeOnline: () => void;
}) {
  if (state === "this") {
    return (
      <Card className="border-green-500/40 bg-green-50/60 dark:bg-green-950/20">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Star className="mt-0.5 h-5 w-5 shrink-0 fill-amber-400 text-amber-500" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">This is your online menu</p>
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Online menu
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Your online store and delivery apps serve this menu ({itemCount}{" "}
                items). Edits to any item anywhere — price, name, out of stock —
                show up here; publish to push them live.
                {hasChanges ? (
                  <span className="font-medium text-amber-700">
                    {" "}
                    Changes are waiting to publish.
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={onPublish}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            {isNewMenu
              ? "Publish online menu"
              : hasChanges
                ? "Publish changes"
                : "Re-publish"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state === "other") {
    return (
      <Card className="border-muted-foreground/20">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Star className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Online orders use{" "}
                <span className="text-primary">
                  {primaryMenuName ?? "another menu"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">{thisMenuName}</span> is not your
                online menu. Item edits here still appear online — you publish them
                from your online menu, not this one.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {onlineMenuHref && (
              <Button asChild size="sm" variant="outline">
                <Link href={onlineMenuHref}>
                  Go to online menu
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={onMakeOnline}
              disabled={isPublishing}
            >
              Make this the online menu
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // state === "none"
  return (
    <Card className="border-blue-500/40 bg-blue-50/60 dark:bg-blue-950/20">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Upload className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              Choose your online menu
            </p>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/80">
              OrderOut serves one menu per store. Make{" "}
              <span className="font-medium">{thisMenuName}</span> your online menu
              to publish it to your online store and delivery apps. You can switch
              later.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="shrink-0 bg-blue-600 text-white hover:bg-blue-700"
          onClick={onMakeOnline}
          disabled={isPublishing}
        >
          {isPublishing ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Star className="mr-1 h-3.5 w-3.5" />
          )}
          Make this my online menu
        </Button>
      </CardContent>
    </Card>
  );
}
