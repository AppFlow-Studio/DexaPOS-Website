"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Radio } from "lucide-react";
import type { PlatformChannelStatus } from "@/lib/orderout/helpers";
import { ChannelStatusPills } from "./ChannelStatusPills";

// ============================================================================
// MenuChannelsCard — per-menu delivery-channel status + push action.
// Presentational only: the merchant and admin menu tabs wire their own
// (clerk- vs merchant-scoped) push/live-status hooks into it.
// ============================================================================

export interface MenuChannelsLiveStatus {
  syncStatus: string;
  expectedChannels: string[];
  reportedChannels: string[];
}

interface MenuChannelsCardProps {
  /** Canonical OrderOut menu id. Null until the menu has been uploaded. */
  ooMenuId: string | null;
  /** Per-platform push status for this menu (from platform_statuses). */
  platformStatuses: PlatformChannelStatus[];
  /** Platforms the restaurant would fan out to (reporting "success"). */
  connectedChannels: string[];
  onPush: () => void;
  isPushing: boolean;
  live?: MenuChannelsLiveStatus | null;
}

export function MenuChannelsCard({
  ooMenuId,
  platformStatuses,
  connectedChannels,
  onPush,
  isPushing,
  live,
}: MenuChannelsCardProps) {
  const hasChannels = connectedChannels.length > 0;
  const progress = live
    ? `${live.reportedChannels.length}/${live.expectedChannels.length}`
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4" />
              Delivery Channels
            </CardTitle>
            <CardDescription>
              Per-platform status for this menu, and push it out to your
              connected delivery platforms.
            </CardDescription>
          </div>
          {ooMenuId && (
            <div className="sm:shrink-0">
              <ChannelStatusPills statuses={platformStatuses} />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ooMenuId ? (
          <p className="text-sm text-muted-foreground">
            Upload this menu to OrderOut first, then push it out to delivery
            channels here.
          </p>
        ) : !hasChannels ? (
          <p className="text-sm text-muted-foreground">
            Connect a delivery platform (UberEats, DoorDash, GrubHub) in the
            OrderOut dashboard first — then you can push this menu to it.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Channels receiving: {connectedChannels.join(", ")}
              </p>
              <Button onClick={onPush} disabled={isPushing} size="sm">
                {isPushing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Radio className="h-4 w-4 mr-2" />
                )}
                Push to Channels
              </Button>
            </div>

            {live && (
              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Live status: {live.syncStatus}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {progress}
                  </span>
                </div>
                <ChannelStatusPills
                  expectedChannels={live.expectedChannels}
                  reportedChannels={live.reportedChannels}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
