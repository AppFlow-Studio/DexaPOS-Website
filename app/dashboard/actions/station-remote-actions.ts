"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

// Actions that have security/access impact — logged at critical severity
const CRITICAL_ACTIONS = new Set<RemoteActionType>(["force_logout", "deactivate"]);

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
      severity: CRITICAL_ACTIONS.has(action) ? "critical" : "info",
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

// ============================================================================
// KICK STATION SESSION
// Called from the web dashboard when a manager force-ends an active POS session.
// Also callable by the POS tablet to log kicks initiated from the device itself.
// ============================================================================

export async function kickStationSession(params: {
  sessionId: string;
  deviceId: string;
  kickedByStaffName?: string;
  kickReason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerSupabaseClient();

    // Fetch session to get merchant/location context
    const { data: session, error: sessionError } = await supabase
      .from("station_sessions")
      .select(
        "id, station_id, merchant_id, location_id, staff_name, device_name, session_status",
      )
      .eq("id", params.sessionId)
      .single();

    if (sessionError || !session) {
      return { success: false, error: "Session not found" };
    }

    if (session.session_status !== "active") {
      return { success: false, error: "Session is not active" };
    }

    // Mark session as kicked
    const { error: updateError } = await supabase
      .from("station_sessions")
      .update({
        session_status: "kicked",
        ended_at: new Date().toISOString(),
        kicked_by_device_id: params.deviceId,
        kicked_by_staff_name: params.kickedByStaffName ?? null,
      })
      .eq("id", params.sessionId);

    if (updateError) {
      console.error("[kickStationSession] Update error:", updateError);
      return { success: false, error: updateError.message };
    }

    // Insert into session_kick_notifications so the POS device is notified
    await supabase.from("session_kick_notifications").insert({
      session_id: params.sessionId,
      device_id: params.deviceId,
      kicked_by_staff_name: params.kickedByStaffName ?? null,
      kick_reason: params.kickReason ?? null,
    });

    // Audit log — critical severity: this is a forced access termination
    await LogAuditEvent({
      merchantId: session.merchant_id,
      locationId: session.location_id,
      action: `Session Kicked: ${session.device_name ?? params.deviceId}`,
      actionCategory: "authentication",
      resourceType: "station",
      resourceId: session.station_id,
      resourceName: session.device_name ?? params.deviceId,
      severity: "critical",
      metadata: {
        session_id: params.sessionId,
        device_id: params.deviceId,
        kicked_staff_name: session.staff_name ?? null,
        kicked_by: params.kickedByStaffName ?? null,
        reason: params.kickReason ?? null,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[kickStationSession] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
