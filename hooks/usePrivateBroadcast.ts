"use client";

import { useAuth } from "@clerk/nextjs";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { useEffect, useEffectEvent, useMemo } from "react";

export type PrivateChannelStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR";

/**
 * One Clerk-authenticated Supabase client per component lifetime, for PRIVATE
 * Realtime channels: the realtime.messages RLS policy checks this JWT.
 * Clerk's getToken is stable, so the client (and its socket) is built once,
 * and realtime-js re-reads the accessToken callback on every heartbeat, so a
 * long-lived channel keeps a fresh token.
 *
 * Not hooks/useSupabaseClient: that one builds a new client on every render.
 */
export function useRealtimeSupabaseClient(): SupabaseClient {
  const { getToken } = useAuth();

  return useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { accessToken: async () => (await getToken()) ?? null },
      ),
    [getToken],
  );
}

/**
 * Join a private broadcast topic (e.g. `location:{id}:orders`) and call
 * `onEvent` for each listed event. Waits until the user is signed in,
 * authorizes the socket with realtime.setAuth() before joining, and leaves on
 * cleanup. A null topic joins nothing. Callers keep a poll as the fallback;
 * `onStatus` reports whether push is live.
 */
export function usePrivateBroadcast(
  topic: string | null,
  events: readonly string[],
  onEvent: (event: string, payload: unknown) => void,
  onStatus?: (status: PrivateChannelStatus) => void,
): void {
  const { isSignedIn } = useAuth();
  const supabase = useRealtimeSupabaseClient();

  const handleEvent = useEffectEvent((event: string, payload: unknown) =>
    onEvent(event, payload),
  );
  const handleStatus = useEffectEvent((status: PrivateChannelStatus) =>
    onStatus?.(status),
  );

  const eventsKey = events.join(",");

  useEffect(() => {
    if (!topic || !isSignedIn || !eventsKey) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    void (async () => {
      try {
        await supabase.realtime.setAuth();
      } catch (err) {
        console.warn(`[realtime] setAuth failed before joining ${topic}`, err);
      }
      if (cancelled) return;

      let ch = supabase.channel(topic, { config: { private: true } });
      for (const event of eventsKey.split(",")) {
        ch = ch.on("broadcast", { event }, (msg) =>
          handleEvent(msg.event, msg.payload),
        );
      }
      channel = ch.subscribe((status) => {
        if (!cancelled) handleStatus(status as PrivateChannelStatus);
      });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topic, eventsKey, isSignedIn, supabase]);
}
