"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

export type RemoteActionType =
  | "force_refresh"
  | "clear_cache"
  | "restart_app"
  | "force_logout"
  | "deactivate"
  | "config_update"
  | "send_logs";

export async function sendRemoteAction(
  stationId: string,
  action: RemoteActionType,
  payload?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerSupabaseClient();

    // Verify station exists and get details (RLS enforces merchant ownership)
    const { data: station, error: fetchError } = await supabase
      .from("stations")
      .select("id, station_name, merchant_id, location_id, is_active")
      .eq("id", stationId)
      .single();

    if (fetchError || !station) {
      return { success: false, error: "Station not found" };
    }

    // For deactivate: update station in DB
    if (action === "deactivate") {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("stations")
        .update({
          is_active: false,
          deactivated_at: now,
          updated_at: now,
        })
        .eq("id", stationId);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    }

    // Log audit event
    await LogAuditEvent({
      merchantId: station.merchant_id,
      action: `Remote Action: ${action} on ${station.station_name}`,
      actionCategory: "settings",
      resourceType: "station",
      resourceId: stationId,
      resourceName: station.station_name,
      locationId: station.location_id,
      metadata: { remote_action: action, ...payload },
    });

    return { success: true };
  } catch (error) {
    console.error("[sendRemoteAction] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
