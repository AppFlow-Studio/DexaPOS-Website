import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  parseSupportTicketNotificationRecipients,
  sendSupportTicketCreatedNotification,
  sendSupportTicketMessageNotification,
} from "@/lib/support/ticket-notifications";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STALE_PROCESSING_MS = 5 * 60 * 1000;

type DeliveryTable =
  | "support_ticket_notification_deliveries"
  | "support_ticket_message_notification_deliveries";

type DeliveryConfig = {
  table: DeliveryTable;
  identityColumn: "ticket_id" | "message_id";
  identityValue: string;
  ticketId: string;
  messageId?: string;
};

async function claimDelivery(
  supabase: ReturnType<typeof createServiceRoleClient>,
  config: DeliveryConfig,
  recipients: string[],
): Promise<"claimed" | "already_sent" | "already_processing"> {
  const now = new Date().toISOString();
  const deliveryClaim = {
    ticket_id: config.ticketId,
    ...(config.messageId ? { message_id: config.messageId } : {}),
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
    .from(config.table)
    .insert(deliveryClaim);

  if (!insertError) return "claimed";
  if (insertError.code !== "23505") {
    throw new Error(insertError.message);
  }

  const { data: previousDelivery, error: previousError } = await supabase
    .from(config.table)
    .select("status, attempt_count, updated_at")
    .eq(config.identityColumn, config.identityValue)
    .single();

  if (previousError || !previousDelivery) {
    throw new Error(previousError?.message || "Delivery claim was not found");
  }

  if (previousDelivery.status === "sent") {
    return "already_sent";
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
    return "already_processing";
  }

  let retryQuery = supabase
    .from(config.table)
    .update({
      ...deliveryClaim,
      attempt_count: previousDelivery.attempt_count + 1,
    })
    .eq(config.identityColumn, config.identityValue)
    .eq("status", previousDelivery.status);

  if (previousDelivery.status === "processing") {
    retryQuery = retryQuery.lt("updated_at", staleBefore);
  }

  const { data: retryClaim, error: retryError } = await retryQuery
    .select(config.identityColumn)
    .maybeSingle();

  if (retryError) {
    throw new Error(retryError.message);
  }

  return retryClaim ? "claimed" : "already_processing";
}

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_NOTIFICATION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  if (request.headers.get("x-internal-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { ticket_id?: string; message_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    (body.ticket_id && !UUID_PATTERN.test(body.ticket_id)) ||
    (body.message_id && !UUID_PATTERN.test(body.message_id)) ||
    (!body.ticket_id && !body.message_id)
  ) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  let ticketId = body.ticket_id ?? "";
  let config: DeliveryConfig;
  let sendNotification: () => ReturnType<
    typeof sendSupportTicketCreatedNotification
  >;

  if (body.message_id) {
    const { data: message, error: messageError } = await supabase
      .from("support_ticket_messages")
      .select("ticket_id")
      .eq("id", body.message_id)
      .maybeSingle();

    if (messageError || !message) {
      return NextResponse.json({ error: "message_not_found" }, { status: 404 });
    }

    if (ticketId && ticketId !== message.ticket_id) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    ticketId = message.ticket_id;
    config = {
      table: "support_ticket_message_notification_deliveries",
      identityColumn: "message_id",
      identityValue: body.message_id,
      ticketId,
      messageId: body.message_id,
    };
    sendNotification = () =>
      sendSupportTicketMessageNotification(body.message_id!);
  } else {
    config = {
      table: "support_ticket_notification_deliveries",
      identityColumn: "ticket_id",
      identityValue: ticketId,
      ticketId,
    };
    sendNotification = () => sendSupportTicketCreatedNotification(ticketId);
  }

  const recipients = parseSupportTicketNotificationRecipients();
  try {
    const claim = await claimDelivery(supabase, config, recipients);
    if (claim !== "claimed") {
      return NextResponse.json({ ok: true, skipped: claim });
    }
  } catch (error) {
    console.error("[support-ticket-notification] delivery claim failed", {
      ticketId,
      messageId: body.message_id ?? null,
      message: error instanceof Error ? error.message : "Unknown claim error",
    });
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  try {
    const result = await sendNotification();
    await supabase
      .from(config.table)
      .update({
        status: "sent",
        recipient_emails: result.recipients,
        resend_message_ids: result.resendMessageIds,
        last_error: null,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq(config.identityColumn, config.identityValue);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Support ticket email failed";
    console.error("[support-ticket-notification] notification failed", {
      ticketId,
      messageId: body.message_id ?? null,
      message,
    });

    await supabase
      .from(config.table)
      .update({
        status: "failed",
        recipient_emails: recipients,
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq(config.identityColumn, config.identityValue);

    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}
