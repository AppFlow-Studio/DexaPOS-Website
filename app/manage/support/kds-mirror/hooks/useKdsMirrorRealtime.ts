"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePrivateBroadcast,
  type PrivateChannelStatus,
} from "@/hooks/usePrivateBroadcast";

export type MirrorRealtimeStatus =
  | "idle"
  | "connecting"
  | "live"
  | "degraded";

const ORDER_EVENTS = ["INSERT", "UPDATE", "DELETE"] as const;

/**
 * Liveness for the KDS mirror.
 *
 * There is no table-level change feed to use: kds_item_status is deliberately
 * NOT in the realtime publication, so a postgres_changes subscription on it
 * would silently never fire. The tablet and the merchant dashboard both ride
 * the `location:<id>:orders` broadcast instead, and so does this. Its events
 * are the generic INSERT / UPDATE / DELETE set (types/real-time.ts in the POS
 * repo) -- we do not care which one, only that something moved, so every event
 * collapses to the same invalidation.
 *
 * That broadcast is PRIVATE, so the join is authenticated with the HQ user's
 * Clerk JWT (the realtime.messages policy admits Dexa HQ for any location).
 *
 * Returned status is surfaced in the UI, and useKdsMirror polls at 5s instead
 * of 30s while it isn't "live". "degraded" means the board is still correct
 * but is arriving on the poll rather than on push -- worth showing, because a
 * support engineer watching a stale-looking board needs to know whether they
 * are looking at a quiet kitchen or a broken subscription.
 */
export function useKdsMirrorRealtime(locationId: string | null) {
  const queryClient = useQueryClient();
  // Keyed by location, so switching location reads "connecting" until that
  // location's channel reports, with no reset effect.
  const [channelState, setChannelState] = useState<{
    locationId: string;
    status: MirrorRealtimeStatus;
  } | null>(null);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  const invalidate = useCallback(() => {
    if (!locationId) return;
    setLastEventAt(Date.now());
    void queryClient.invalidateQueries({
      queryKey: ["hq-kds-mirror", "board", locationId],
    });
  }, [locationId, queryClient]);

  const onStatus = useCallback(
    (subscriptionStatus: PrivateChannelStatus) => {
      if (!locationId) return;
      setChannelState({
        locationId,
        status: subscriptionStatus === "SUBSCRIBED" ? "live" : "degraded",
      });
    },
    [locationId],
  );

  usePrivateBroadcast(
    locationId ? `location:${locationId}:orders` : null,
    ORDER_EVENTS,
    invalidate,
    onStatus,
  );

  const status: MirrorRealtimeStatus = !locationId
    ? "idle"
    : channelState?.locationId === locationId
      ? channelState.status
      : "connecting";

  return { status, lastEventAt };
}
