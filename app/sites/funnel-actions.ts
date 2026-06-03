"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type QrFunnelStage = "menu_viewed" | "cart_started" | "checkout";

interface QrSessionContext {
  id: string;
  floor_plan_object_id: string | null;
  table_qr_code_id: string | null;
  table_label: string | null;
  online_store_config: {
    merchant_id: string;
    location_id: string;
  } | null;
}

async function resolveQrSessionContext(
  sessionToken: string
): Promise<QrSessionContext | null> {
  const supabase = createServiceRoleClient();

  const { data: session } = await supabase
    .from("online_order_sessions")
    .select(`
      id,
      floor_plan_object_id,
      table_qr_code_id,
      table_label,
      online_store_config!inner(
        merchant_id,
        location_id
      )
    `)
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!session?.id) return null;
  if (
    !session.table_qr_code_id &&
    !session.floor_plan_object_id &&
    !session.table_label
  ) {
    return null;
  }

  return session as QrSessionContext;
}

export async function trackQrFunnelEvent(
  sessionToken: string,
  stage: QrFunnelStage,
  userAgent?: string | null
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  if (!sessionToken) {
    return { success: false, error: "Session token is required" };
  }

  const supabase = createServiceRoleClient();
  const session = await resolveQrSessionContext(sessionToken);

  if (!session?.id || !session.online_store_config) {
    return { success: true, skipped: true };
  }

  const { data: existingEvent } = await supabase
    .from("qr_scan_events")
    .select("id")
    .eq("online_order_session_id", session.id)
    .eq("stage", stage)
    .limit(1)
    .maybeSingle();

  if (existingEvent?.id) {
    return { success: true, skipped: true };
  }

  const { error } = await supabase.from("qr_scan_events").insert({
    merchant_id: session.online_store_config.merchant_id,
    location_id: session.online_store_config.location_id,
    floor_plan_object_id: session.floor_plan_object_id,
    table_qr_code_id: session.table_qr_code_id,
    online_order_session_id: session.id,
    stage,
    user_agent: userAgent?.slice(0, 512) ?? null,
  });

  if (error) {
    console.error("trackQrFunnelEvent error:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
