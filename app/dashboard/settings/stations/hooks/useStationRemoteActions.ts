"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import {
  sendRemoteAction,
  RemoteActionType,
} from "@/app/dashboard/actions/station-remote-actions";
import { toast } from "sonner";

const ACTION_LABELS: Record<RemoteActionType, string> = {
  force_refresh: "Force Refresh",
  clear_cache: "Clear Cache",
  restart_app: "Restart App",
  force_logout: "Log Out Station",
  deactivate: "Deactivate Station",
  config_update: "Push Config",
  send_logs: "Request Logs",
};

export function useStationRemoteAction() {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<RemoteActionType | null>(
    null
  );

  const execute = async (
    stationId: string,
    action: RemoteActionType,
    payload?: Record<string, unknown>
  ) => {
    setPendingAction(action);

    try {
      // 1. Call server action for audit logging + DB updates
      const result = await sendRemoteAction(stationId, action, payload);

      if (!result.success) {
        toast.error(result.error || `Failed to send ${ACTION_LABELS[action]}`);
        return false;
      }

      // 2. Broadcast command via Supabase Realtime
      const channel = supabase.channel(`station:${stationId}`);

      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            channel
              .send({
                type: "broadcast",
                event: action,
                payload: {
                  action,
                  ...payload,
                  sent_at: new Date().toISOString(),
                },
              })
              .then(() => resolve())
              .catch(reject);
          } else if (status === "CHANNEL_ERROR") {
            reject(new Error("Failed to connect to channel"));
          }
        });
      });

      // Clean up channel after broadcast
      supabase.removeChannel(channel);

      // 3. Show success toast
      toast.success(`${ACTION_LABELS[action]} sent`);

      // 4. Invalidate station queries
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      queryClient.invalidateQueries({
        queryKey: ["stations-with-heartbeats"],
      });

      return true;
    } catch (error) {
      toast.error(
        `Failed to send ${ACTION_LABELS[action]}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  return { execute, pendingAction };
}
