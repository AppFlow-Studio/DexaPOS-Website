"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { StationWithHeartbeat, LatestHeartbeat } from "@/app/dashboard/actions/stations";

/**
 * Subscribes to device_heartbeats table changes for a given location.
 * On INSERT: updates the TanStack Query cache to reflect the latest heartbeat.
 */
export function useDeviceRealtime(locationId: string) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!locationId || locationId === "all") return;

    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`device-heartbeats-${locationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "device_heartbeats",
          filter: `location_id=eq.${locationId}`,
        },
        (payload) => {
          const newHeartbeat = payload.new as {
            station_id: string;
            heartbeat_at: string;
            is_online: boolean;
            cpu_usage: number | null;
            battery_level: number | null;
            ram_free_mb: number | null;
            storage_free_mb: number | null;
            network_type: string | null;
            printer_status: string | null;
            cfd_connected: boolean | null;
            app_version: string | null;
          };

          // Optimistically update the TanStack Query cache
          queryClient.setQueryData<StationWithHeartbeat[]>(
            ["devices-hardware", locationId],
            (oldData) => {
              if (!oldData) return oldData;

              return oldData.map((station) => {
                if (station.id !== newHeartbeat.station_id) return station;

                const updatedHeartbeat: LatestHeartbeat = {
                  heartbeat_at: newHeartbeat.heartbeat_at,
                  is_online: newHeartbeat.is_online,
                  cpu_usage: newHeartbeat.cpu_usage,
                  battery_level: newHeartbeat.battery_level,
                  ram_free_mb: newHeartbeat.ram_free_mb,
                  storage_free_mb: newHeartbeat.storage_free_mb,
                  network_type: newHeartbeat.network_type,
                  printer_status: newHeartbeat.printer_status,
                  cfd_connected: newHeartbeat.cfd_connected,
                  app_version: newHeartbeat.app_version,
                };

                return {
                  ...station,
                  is_online: newHeartbeat.is_online,
                  last_heartbeat_at: newHeartbeat.heartbeat_at,
                  latest_heartbeat: updatedHeartbeat,
                };
              });
            }
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [locationId, queryClient]);
}
