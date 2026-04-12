"use client";

// ============================================================================
// AdminPushChannelsSection — thin HQ-admin wrapper around the merchant-mode
// PushChannelsCard + PushChannelsHistoryCard. Uses admin hooks and a
// merchant-by-id scope instead of clerk-org-scoped hooks.
// ============================================================================

import { Fragment, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import { ChevronDown, ChevronUp, History, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import {
  useAdminPushMenuToChannels,
  useAdminPushChannelsHistory,
  useAdminPushChannelsLiveStatus,
} from "@/lib/queries/use-admin-orderout";
import { ChannelStatusPills } from "./ChannelStatusPills";
import { formatRelativeTime } from "@/lib/orderout/helpers";

interface AdminPushChannelsSectionProps {
  merchantId: string;
  locationId: string;
  // Webhook-verified platforms (from connected_channels).
  verifiedChannels: string[];
  // Merchant self-confirmed platforms — displayed read-only in HQ.
  selfConfirmedChannels: string[];
  // Parent must provide the list of synced menus for this location.
  syncedMenus: Array<{
    menuId: string;
    menuName: string;
    ooMenuId: string | null;
  }>;
  isOnboarded: boolean;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "success":
      return (
        <Badge variant="default" className="bg-green-600">
          Success
        </Badge>
      );
    case "partial":
      return (
        <Badge variant="default" className="bg-amber-500">
          Partial
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "syncing":
    case "pending":
      return <Badge variant="secondary">Syncing…</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function AdminPushChannelsSection({
  merchantId,
  locationId,
  verifiedChannels,
  selfConfirmedChannels,
  syncedMenus,
  isOnboarded,
}: AdminPushChannelsSectionProps) {
  const [selectedMenuId, setSelectedMenuId] = useState<string>(
    syncedMenus[0]?.menuId ?? ""
  );
  const [activeSyncId, setActiveSyncId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const pushMutation = useAdminPushMenuToChannels(merchantId);
  const history = useAdminPushChannelsHistory(merchantId, locationId);
  const live = useAdminPushChannelsLiveStatus(merchantId, activeSyncId);

  const selectedMenu = useMemo(
    () => syncedMenus.find((m) => m.menuId === selectedMenuId) ?? null,
    [syncedMenus, selectedMenuId]
  );

  // Union of webhook-verified + merchant self-confirmed — mirrors the server
  // push guard. HQ cannot edit the self-confirmed list (read-only).
  const connectedChannels = useMemo(() => {
    const verified = verifiedChannels.map((c) => c.toUpperCase());
    const confirmed = selfConfirmedChannels.map((c) => c.toUpperCase());
    return Array.from(new Set([...verified, ...confirmed]));
  }, [verifiedChannels, selfConfirmedChannels]);

  const hasChannels = connectedChannels.length > 0;
  const hasMenus = syncedMenus.length > 0;

  const handlePushOne = () => {
    if (!selectedMenuId) return;
    pushMutation.mutate(
      { merchantId, menuId: selectedMenuId, locationId },
      {
        onSuccess: (res) => {
          if (res.success && res.data?.syncId) {
            setActiveSyncId(res.data.syncId);
          }
        },
      }
    );
  };

  const handlePushAll = async () => {
    if (!hasMenus) return;
    const skipped: string[] = [];
    let firstSyncId: string | null = null;
    for (const m of syncedMenus) {
      // eslint-disable-next-line no-await-in-loop
      const result = await pushMutation.mutateAsync({
        merchantId,
        menuId: m.menuId,
        locationId,
      });
      if (!result.success) {
        skipped.push(m.menuName);
      } else if (!firstSyncId && result.data?.syncId) {
        firstSyncId = result.data.syncId;
      }
    }
    if (firstSyncId) setActiveSyncId(firstSyncId);
    if (skipped.length > 0) {
      toast.warning(
        `Skipped ${skipped.length} menu${skipped.length === 1 ? "" : "s"}: ${skipped.join(", ")}`
      );
    }
  };

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rows = history.data?.data ?? [];
  const liveData = live.data?.data;
  const progress = liveData
    ? `${liveData.reportedChannels.length}/${liveData.expectedChannels.length}`
    : null;

  // Empty / gated states
  const pushCard = !isOnboarded ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="h-4 w-4" />
          Push Menus to Connected Channels
        </CardTitle>
        <CardDescription>Connect this location to OrderOut first.</CardDescription>
      </CardHeader>
    </Card>
  ) : !hasMenus ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="h-4 w-4" />
          Push Menus to Connected Channels
        </CardTitle>
        <CardDescription>
          Upload a menu to OrderOut first, then fan it out to delivery channels here.
        </CardDescription>
      </CardHeader>
    </Card>
  ) : !hasChannels ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="h-4 w-4" />
          Push Menus to Connected Channels
        </CardTitle>
        <CardDescription>
          Connect a delivery platform (UberEats, DoorDash, GrubHub) in the OrderOut dashboard first.
        </CardDescription>
      </CardHeader>
    </Card>
  ) : (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4" />
              Push Menus to Connected Channels
            </CardTitle>
            <CardDescription>
              Fan out an already-uploaded menu to your delivery platforms.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            {connectedChannels.map((c) => (
              <Badge key={c} variant="outline" className="text-xs">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
          <Select value={selectedMenuId} onValueChange={setSelectedMenuId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a menu" />
            </SelectTrigger>
            <SelectContent>
              {syncedMenus.map((m) => (
                <SelectItem key={m.menuId} value={m.menuId}>
                  {m.menuName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handlePushOne}
            disabled={
              !selectedMenuId || !selectedMenu?.ooMenuId || pushMutation.isPending
            }
          >
            {pushMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Radio className="h-4 w-4 mr-2" />
            )}
            Push to Channels
          </Button>
          <Button
            variant="outline"
            onClick={handlePushAll}
            disabled={pushMutation.isPending}
          >
            Push All Menus
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Channels receiving: {connectedChannels.join(", ")}
        </p>

        {selfConfirmedChannels.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Merchant self-confirmed:{" "}
            <span className="font-medium">
              {selfConfirmedChannels
                .map((c) => c.toUpperCase())
                .join(", ")}
            </span>
            {" — read-only"}
          </p>
        )}

        {activeSyncId && liveData && (
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Live status: {liveData.syncStatus}
              </span>
              <span className="text-xs text-muted-foreground">{progress}</span>
            </div>
            <ChannelStatusPills
              expectedChannels={liveData.expectedChannels}
              reportedChannels={liveData.reportedChannels}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );

  const historyCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Channel Push History
        </CardTitle>
        <CardDescription>
          Recent pushes from DexaPOS to delivery platforms via OrderOut.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <Empty
            icon={History}
            title="No channel pushes yet"
            description="Use “Push to Channels” above to fan a menu out to delivery platforms."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Menu</TableHead>
                <TableHead>Triggered</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Per-channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isOpen = expanded.has(row.syncId);
                const prog = `${row.pushedToChannels.length}/${row.expectedChannels.length}`;
                return (
                  <Fragment key={row.syncId}>
                    <TableRow>
                      <TableCell className="font-medium">
                        {row.menuName ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(row.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{prog}</TableCell>
                      <TableCell>
                        <ChannelStatusPills
                          expectedChannels={row.expectedChannels}
                          reportedChannels={row.pushedToChannels}
                          perChannelResults={row.perChannelResults}
                        />
                      </TableCell>
                      <TableCell>{getStatusBadge(row.syncStatus)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleRow(row.syncId)}
                          disabled={row.perChannelResults.length === 0}
                        >
                          {isOpen ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30">
                          <div className="space-y-2 p-2">
                            {row.perChannelResults.map((r, idx) => (
                              <div
                                key={`${row.syncId}-${r.deliveryService}-${idx}`}
                                className="rounded border bg-background p-2"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">
                                    {r.deliveryService}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {r.statusCode != null && (
                                      <span className="text-xs text-muted-foreground font-mono">
                                        HTTP {r.statusCode}
                                      </span>
                                    )}
                                    {getStatusBadge(r.status)}
                                  </div>
                                </div>
                                {r.errorMessage && (
                                  <p className="mt-1 text-xs text-red-600">
                                    {r.errorMessage}
                                  </p>
                                )}
                                {r.rawResponse ? (
                                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px]">
                                    {JSON.stringify(r.rawResponse, null, 2)}
                                  </pre>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {pushCard}
      {historyCard}
    </div>
  );
}
