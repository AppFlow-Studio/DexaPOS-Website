"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

/**
 * Subscribes to receipt_templates table changes for a given location.
 * On any change, invalidates the TanStack Query cache to trigger a refetch.
 */
export function useReceiptTemplateRealtime(locationId: string) {
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
      .channel(`receipt-templates-${locationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "receipt_templates",
          filter: `location_id=eq.${locationId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["receipt-templates", locationId],
          });
        },
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
