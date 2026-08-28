"use client";

import * as React from "react";
import {
  AlertTriangle,
  Eye,
  Wifi,
  RefreshCw,
  WifiOff,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  KdsDisplaySummary,
  KdsRoutingHealth,
  SupportLocationOption,
} from "@/app/manage/actions/kds-mirror";
import type { MirrorRealtimeStatus } from "../hooks/useKdsMirrorRealtime";
import { MerchantPicker } from "./MerchantPicker";

/**
 * Connection status, NOT viewing status.
 *
 * Deliberately never says "Live": the replay scrubber owns that word, and it
 * means "you are looking at the board as it is now" rather than "the socket is
 * up". Two badges both reading Live is how you get someone confidently
 * reporting on a board they are actually scrubbed twenty minutes back into.
 */
function RealtimeBadge({
  status,
  isFetching,
}: {
  status: MirrorRealtimeStatus;
  isFetching: boolean;
}) {
  if (status === "live") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
        title="Realtime subscription is up; the board updates on push."
      >
        <Wifi className={cn("h-3 w-3", isFetching && "animate-pulse")} />
        Connected
      </Badge>
    );
  }

  if (status === "degraded") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
        title="The realtime subscription dropped. The board is still correct but is refreshing on a 5s poll."
      >
        <WifiOff className="h-3 w-3" />
        Polling only
      </Badge>
    );
  }

  if (status === "connecting") {
    return (
      <Badge variant="outline" className="gap-1">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Connecting
      </Badge>
    );
  }

  return null;
}

/**
 * The disclaimer is not decoration. This whole page reconstructs server state;
 * if the tablet's socket dropped or its cache is stale, the board below is
 * perfect and the kitchen screen is blank. Support staff will draw the wrong
 * conclusion from a healthy-looking mirror unless this is on the page.
 */
export function MirrorBlindSpotNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <Eye className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-semibold">
          This is server state, not the physical screen.
        </span>{" "}
        It shows what the server says this station should be displaying, fetched
        through the same RPC the tablet calls. It cannot detect a dropped
        subscription, a crashed app, or a stale cache on the device -- in all
        three cases this board still looks correct while the kitchen sees
        nothing. Use it to decide{" "}
        <span className="font-medium">server-side or device-side</span>, not to
        confirm what was rendered.
      </p>
    </div>
  );
}

function HealthHint({ health }: { health: KdsRoutingHealth | null }) {
  if (!health) return null;

  const problems: string[] = [];
  if (health.items_dropped > 0) {
    problems.push(
      `${health.items_dropped} item(s) dropped with no active KDS display`
    );
  }
  if (health.status_divergence_count > 0) {
    problems.push(
      `${health.status_divergence_count} item/display state divergence(s)`
    );
  }
  if (health.items_routed_by_fallback > 0) {
    problems.push(
      `${health.items_routed_by_fallback} item(s) routed only by fallback`
    );
  }

  if (problems.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Last 7 days: {health.items_fired} items fired, no drops, no divergence.
        Routing is healthy at this location -- a "missing order" complaint here
        is most likely device-side.
      </p>
    );
  }

  return (
    <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        Last 7 days ({health.items_fired} items fired): {problems.join("; ")}.
      </p>
    </div>
  );
}

export function KdsMirrorControls({
  locations,
  displays,
  merchantId,
  locationId,
  displayId,
  onMerchantChange,
  onLocationChange,
  onDisplayChange,
  realtimeStatus,
  isFetching,
  onRefresh,
  health,
}: {
  locations: SupportLocationOption[];
  displays: KdsDisplaySummary[];
  merchantId: string | null;
  locationId: string | null;
  displayId: string | null;
  onMerchantChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onDisplayChange: (value: string) => void;
  realtimeStatus: MirrorRealtimeStatus;
  isFetching: boolean;
  onRefresh: () => void;
  health: KdsRoutingHealth | null;
}) {
  const selectedDisplay = displays.find((d) => d.id === displayId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MerchantPicker
          merchantId={merchantId}
          onMerchantChange={onMerchantChange}
        />

        <Select
          value={locationId ?? ""}
          onValueChange={onLocationChange}
          disabled={!merchantId || locations.length === 0}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.name}
                {location.is_active ? "" : " (inactive)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={displayId ?? "all"}
          onValueChange={onDisplayChange}
          disabled={!locationId}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select KDS display" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All displays (location-wide)</SelectItem>
            {displays.map((display) => (
              <SelectItem key={display.id} value={display.id}>
                {display.display_name}
                {display.is_active ? "" : " (inactive)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <RealtimeBadge status={realtimeStatus} isFetching={isFetching} />
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={!locationId}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {displayId === null && locationId && (
        <p className="text-xs text-muted-foreground">
          Showing every display at this location combined. No physical screen
          looks like this -- pick a specific display to mirror a real station.
        </p>
      )}

      {selectedDisplay?.show_all_items && (
        <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            <span className="font-medium">
              {selectedDisplay.display_name} has show_all_items enabled.
            </span>{" "}
            Every fired item lands on this screen regardless of routing rules,
            so the board will look flooded and station-specific rules will
            appear to be ignored. That is configuration, not a routing bug.
          </p>
        </div>
      )}

      <HealthHint health={health} />
    </div>
  );
}
