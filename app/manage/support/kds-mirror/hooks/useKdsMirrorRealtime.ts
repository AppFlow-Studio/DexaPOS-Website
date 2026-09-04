"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type MirrorRealtimeStatus =
  | "idle"
  | "connecting"
  | "live"
  | "degraded";

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
 * Returned status is surfaced in the UI. "degraded" means the board is still
 * correct but is arriving on the 5s poll rather than on push -- worth showing,
 * because a support engineer watching a stale-looking board needs to know
 * whether they are looking at a quiet kitchen or a broken subscription.
 */
export function useKdsMirrorRealtime(locationId: string | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [status, setStatus] = useState<MirrorRealtimeStatus>("idle");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  useEffect(() => {
    if (!locationId) {
      setStatus("idle");
      return;
    }

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setStatus("connecting");

    const invalidate = () => {
      setLastEventAt(Date.now());
      void queryClient.invalidateQueries({
        queryKey: ["hq-kds-mirror", "board", locationId],
      });
    };

    const channel = supabase
      .channel(`location:${locationId}:orders`)
      .on("broadcast", { event: "INSERT" }, invalidate)
      .on("broadcast", { event: "UPDATE" }, invalidate)
      .on("broadcast", { event: "DELETE" }, invalidate)
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("live");
        } else if (
          subscriptionStatus === "CHANNEL_ERROR" ||
          subscriptionStatus === "TIMED_OUT" ||
          subscriptionStatus === "CLOSED"
        ) {
          setStatus("degraded");
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setStatus("idle");
    };
  }, [locationId, queryClient]);

  return { status, lastEventAt };
}
