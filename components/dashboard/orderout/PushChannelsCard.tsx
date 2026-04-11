"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import {
  usePushMenuToChannels,
  usePushChannelsLiveStatus,
} from "@/app/dashboard/online-ordering/hooks/useOrderOutStatus";
import type { OrderOutSyncedMenu } from "@/app/dashboard/actions/orderout";
import { ChannelStatusPills } from "./ChannelStatusPills";

// ============================================================================
// PushChannelsCard — dedicated section for fanning a menu out to channels.
// ============================================================================

interface PushChannelsCardProps {
  clerkOrgId: string;
  locationId: string;
  syncedMenus: OrderOutSyncedMenu[];
  connectedChannels: string[];
  isOnboarded: boolean;
}

export function PushChannelsCard({
  clerkOrgId,
  locationId,
  syncedMenus,
  connectedChannels,
  isOnboarded,
}: PushChannelsCardProps) {
  const [selectedMenuId, setSelectedMenuId] = useState<string>(
    syncedMenus[0]?.menuId ?? ""
  );
  const [activeSyncId, setActiveSyncId] = useState<string | null>(null);

  const pushMutation = usePushMenuToChannels(clerkOrgId);
  const liveStatus = usePushChannelsLiveStatus(clerkOrgId, activeSyncId);

  const selectedMenu = useMemo(
    () => syncedMenus.find((m) => m.menuId === selectedMenuId) ?? null,
    [syncedMenus, selectedMenuId]
  );

  const hasChannels = connectedChannels.length > 0;
  const hasMenus = syncedMenus.length > 0;

  const handlePushOne = () => {
    if (!selectedMenuId) return;
    pushMutation.mutate(
      { clerkOrgId, menuId: selectedMenuId, locationId },
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
    for (const menu of syncedMenus) {
      // Sequentially — the server will reject rapid duplicates with cooldown.
      // eslint-disable-next-line no-await-in-loop
      const result = await pushMutation.mutateAsync({
        clerkOrgId,
        menuId: menu.menuId,
        locationId,
      });
      if (!result.success) {
        skipped.push(menu.menuName);
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

  // Empty states
  if (!isOnboarded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Push Menus to Connected Channels
          </CardTitle>
          <CardDescription>
            Connect this location to OrderOut first.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!hasMenus) {
    return (
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
    );
  }

  if (!hasChannels) {
    return (
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
    );
  }

  const live = liveStatus.data?.data;
  const progress = live
    ? `${live.reportedChannels.length}/${live.expectedChannels.length}`
    : null;

  return (
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
            disabled={!selectedMenuId || !selectedMenu?.ooMenuId || pushMutation.isPending}
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

        {activeSyncId && live && (
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Live status: {live.syncStatus}
              </span>
              <span className="text-xs text-muted-foreground">{progress}</span>
            </div>
            <ChannelStatusPills
              expectedChannels={live.expectedChannels}
              reportedChannels={live.reportedChannels}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
