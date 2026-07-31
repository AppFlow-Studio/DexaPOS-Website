import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  parseSupportTicketNotificationRecipients,
  sendSupportTicketCreatedNotification,
} from "@/lib/support/ticket-notifications";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STALE_PROCESSING_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_NOTIFICATION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  if (request.headers.get("x-internal-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { ticket_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const ticketId = body.ticket_id;
  if (!ticketId || !UUID_PATTERN.test(ticketId)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const recipients = parseSupportTicketNotificationRecipients();
  const now = new Date().toISOString();
  const deliveryClaim = {
    ticket_id: ticketId,
    status: "processing",
    recipient_emails: recipients,
    resend_message_ids: [],
    attempt_count: 1,
    last_error: null,
    last_attempt_at: now,
    sent_at: null,
    updated_at: now,
  };
  const { error: insertError } = await supabase
    .from("support_ticket_notification_deliveries")
    .insert(deliveryClaim);

  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("[support-ticket-created] delivery claim failed", {
        ticketId,
        message: insertError.message,
      });
      return NextResponse.json({ error: "claim_failed" }, { status: 500 });
    }

    const { data: previousDelivery, error: previousError } = await supabase
      .from("support_ticket_notification_deliveries")
      .select("status, attempt_count, updated_at")
      .eq("ticket_id", ticketId)
      .single();

    if (previousError || !previousDelivery) {
      return NextResponse.json({ error: "claim_failed" }, { status: 500 });
    }

    if (previousDelivery.status === "sent") {
      return NextResponse.json({ ok: true, skipped: "already_sent" });
    }

    const staleBefore = new Date(
      Date.now() - STALE_PROCESSING_MS,
    ).toISOString();
    const previousUpdatedAt = Date.parse(previousDelivery.updated_at);
    if (
      previousDelivery.status === "processing" &&
      Number.isFinite(previousUpdatedAt) &&
      previousUpdatedAt >= Date.now() - STALE_PROCESSING_MS
    ) {
      return NextResponse.json({ ok: true, skipped: "already_processing" });
    }

    let retryQuery = supabase
      .from("support_ticket_notification_deliveries")
      .update({
        ...deliveryClaim,
        attempt_count: previousDelivery.attempt_count + 1,
      })
      .eq("ticket_id", ticketId)
      .eq("status", previousDelivery.status);

    if (previousDelivery.status === "processing") {
      retryQuery = retryQuery.lt("updated_at", staleBefore);
    }

    const { data: retryClaim, error: retryError } = await retryQuery
      .select("ticket_id")
      .maybeSingle();

    if (retryError) {
      return NextResponse.json({ error: "claim_failed" }, { status: 500 });
    }

    if (!retryClaim) {
      return NextResponse.json({ ok: true, skipped: "already_processing" });
    }
  }

  try {
    const result = await sendSupportTicketCreatedNotification(ticketId);
    await supabase
      .from("support_ticket_notification_deliveries")
      .update({
        status: "sent",
        recipient_emails: result.recipients,
        resend_message_ids: result.resendMessageIds,
        last_error: null,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("ticket_id", ticketId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Support ticket email failed";
    console.error("[support-ticket-created] notification failed", {
      ticketId,
      message,
    });

    await supabase
      .from("support_ticket_notification_deliveries")
      .update({
        status: "failed",
        recipient_emails: recipients,
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("ticket_id", ticketId);

    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}
