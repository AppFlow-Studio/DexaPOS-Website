import { createHmac, timingSafeEqual } from "node:crypto";
import {
  parseInvoicePaymentOrderId,
  resolveInvoicePaymentRail,
  type InvoiceRailInvoiceRef,
} from "@/lib/invoices/payment-rail";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InvoicePaymentWebhookRow {
  id: string;
  invoice_id: string;
  merchant_id: string;
  location_id: string | null;
  status: string;
  amount: number;
  transaction_id: string | null;
  metadata: Record<string, unknown> | null;
  invoice: InvoiceRailInvoiceRef | InvoiceRailInvoiceRef[] | null;
}

interface MappedWebhookEvent {
  eventId: string | null;
  eventType: string;
  transactionId: string | null;
  authCode: string | null;
  responseCode: string | null;
  responseMessage: string | null;
  cardType: string | null;
  cardLastFour: string | null;
  amount: number | null;
  normalizedStatus: "authorized" | "captured" | "declined" | "error" | "ignored";
  paymentStatus: "authorized" | "captured" | "declined" | "failed" | null;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return null;
}

function toAmount(value: unknown): number | null {
  const amount = Number(value ?? NaN);
  return Number.isFinite(amount) ? amount : null;
}

function getLastFour(maskedCard: string | null | undefined) {
  if (!maskedCard) return null;
  const digits = maskedCard.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function verifyWebhookSignature(
  rawBody: string,
  headerValue: string | null,
  signingSecret: string,
) {
  const signature = headerValue?.trim().toLowerCase();
  if (!signature) return false;

  const expected = createHmac("sha256", signingSecret).update(rawBody).digest("hex");

  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(signature, "hex");

  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function mapWebhookEvent(body: Record<string, unknown>, fallbackAmount: number): MappedWebhookEvent {
  const eventBody = asRecord(body.event_body);
  const action = asRecord(eventBody.action);
  const card = asRecord(eventBody.card);
  const eventType = pickString(body.event_type, body.type) || "unknown";
  const transactionId = pickString(
    eventBody.transaction_id,
    eventBody.id,
    body.transaction_id,
  );
  const authCode = pickString(
    eventBody.authorization_code,
    action.authorization_code,
    action.auth_code,
  );
  const responseCode = pickString(
    action.response_code,
    action.response,
    body.response_code,
  );
  const responseMessage = pickString(
    action.processor_response_text,
    action.response_text,
    action.message,
    body.message,
  );
  const amount =
    toAmount(action.amount) ??
    toAmount(eventBody.requested_amount) ??
    toAmount(eventBody.amount) ??
    fallbackAmount;
  const cardType = pickString(card.cc_type, card.brand, body.card_type);
  const cardLastFour =
    getLastFour(pickString(card.cc_number, body.card_last_four)) ||
    pickString(body.card_last_four);

  let normalizedStatus: MappedWebhookEvent["normalizedStatus"] = "ignored";
  let paymentStatus: MappedWebhookEvent["paymentStatus"] = null;

  if (eventType === "transaction.auth.success") {
    normalizedStatus = "authorized";
    paymentStatus = "authorized";
  } else if (
    eventType === "transaction.sale.success" ||
    eventType === "transaction.capture.success"
  ) {
    normalizedStatus = "captured";
    paymentStatus = "captured";
  } else if (
    eventType === "transaction.sale.failure" ||
    eventType === "transaction.auth.failure" ||
    eventType === "transaction.capture.failure"
  ) {
    normalizedStatus = "declined";
    paymentStatus = "declined";
  } else if (
    eventType === "transaction.sale.unknown" ||
    eventType === "transaction.auth.unknown" ||
    eventType === "transaction.capture.unknown"
  ) {
    normalizedStatus = "error";
    paymentStatus = "failed";
  }

  return {
    eventId: pickString(body.event_id, body.id),
    eventType,
    transactionId,
    authCode,
    responseCode,
    responseMessage,
    cardType,
    cardLastFour,
    amount,
    normalizedStatus,
    paymentStatus,
  };
}

function mergeMetadata(
  current: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
) {
  return {
    ...(current ?? {}),
    ...next,
  };
}

async function insertInvoicePaymentEventIfMissing(
  supabase: any,
  payload: {
    paymentId: string;
    invoiceId: string;
    locationId: string | null;
    eventType: "authorized" | "captured" | "declined" | "error";
    previousStatus?: string | null;
    newStatus?: string | null;
    amount?: number | null;
    pspReference?: string | null;
    authCode?: string | null;
    resultCode?: string | null;
    responseMessage?: string | null;
    rawResponse?: unknown;
    reason?: string | null;
  },
) {
  let duplicateQuery = supabase
    .from("payment_events")
    .select("id")
    .eq("payment_id", payload.paymentId)
    .eq("event_type", payload.eventType)
    .limit(1);

  if (payload.pspReference) {
    duplicateQuery = duplicateQuery.eq("psp_reference", payload.pspReference);
  }

  const { data: existingEvent } = await duplicateQuery.maybeSingle();
  if (existingEvent?.id) return;

  const { error } = await supabase.from("payment_events").insert({
    payment_id: payload.paymentId,
    invoice_id: payload.invoiceId,
    location_id: payload.locationId,
    event_type: payload.eventType,
    previous_status: payload.previousStatus ?? null,
    new_status: payload.newStatus ?? null,
    amount: payload.amount ?? null,
    psp_reference: payload.pspReference ?? null,
    auth_code: payload.authCode ?? null,
    result_code: payload.resultCode ?? null,
    response_message: payload.responseMessage ?? null,
    raw_response: payload.rawResponse ?? null,
    reason: payload.reason ?? null,
  });

  if (error) {
    console.error("[invoice-nmi-webhook] Failed to insert payment event:", error);
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!rawBody) {
    return json({ success: false, error: "Empty body" }, 400);
  }

  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = asRecord(JSON.parse(rawBody));
  } catch (error) {
    return json({ success: false, error: "Invalid JSON payload" }, 400);
  }

  const eventBody = asRecord(parsedBody.event_body);
  const orderId = pickString(eventBody.order_id, parsedBody.order_id);
  const paymentIdFromOrder = parseInvoicePaymentOrderId(orderId);
  const transactionId = pickString(eventBody.transaction_id, parsedBody.transaction_id);

  if (!paymentIdFromOrder && !transactionId) {
    return json({ received: true, ignored: true, reason: "No invoice payment reference" });
  }

  const supabase = createServiceRoleClient();

  let paymentQuery = supabase
    .from("invoice_payments")
    .select(
      "id, invoice_id, merchant_id, location_id, status, amount, transaction_id, metadata, invoice:invoices(id, merchant_id, location_id, bill_type, total_amount, amount_paid, status)",
    )
    .limit(1);

  paymentQuery = paymentIdFromOrder
    ? paymentQuery.eq("id", paymentIdFromOrder)
    : paymentQuery.eq("transaction_id", transactionId!);

  const { data: paymentRow, error: paymentLookupError } = await paymentQuery.maybeSingle();

  if (paymentLookupError) {
    console.error("[invoice-nmi-webhook] Payment lookup error:", paymentLookupError);
    return json({ success: false, error: "Payment lookup failed" }, 500);
  }

  if (!paymentRow?.id) {
    return json({ received: true, ignored: true, reason: "Invoice payment not found" });
  }

  const payment = paymentRow as InvoicePaymentWebhookRow;
  const invoice = Array.isArray(payment.invoice) ? payment.invoice[0] : payment.invoice;

  if (!invoice?.id) {
    return json({ success: false, error: "Invoice context missing" }, 500);
  }

  const metadata = asRecord(payment.metadata);
  const rail = await resolveInvoicePaymentRail(invoice, {
    includeSecrets: true,
    preferredPaymentDeviceId: pickString(metadata.payment_device_id),
    preferredPlatformBillingConfigId: pickString(metadata.platform_billing_config_id),
    supabase,
  });

  const webhookSecret = rail?.webhookSecret?.trim();
  if (!webhookSecret) {
    return json({ success: false, error: "Webhook secret not configured" }, 503);
  }

  const signatureHeader =
    request.headers.get("Signature") ??
    request.headers.get("Webhook-Signature");
  if (!verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)) {
    return json({ success: false, error: "Webhook signature verification failed" }, 401);
  }

  const mapped = mapWebhookEvent(parsedBody, Number(payment.amount ?? 0));
  if (mapped.normalizedStatus === "ignored" || !mapped.paymentStatus) {
    return json({ received: true, ignored: true, reason: `Unhandled event ${mapped.eventType}` });
  }

  const now = new Date().toISOString();
  const mergedMetadata = mergeMetadata(metadata, {
    webhook_last_event_id: mapped.eventId,
    webhook_last_event_type: mapped.eventType,
    webhook_last_verified_at: now,
    order_id: orderId,
  });

  if (mapped.normalizedStatus === "authorized") {
    const { error: paymentUpdateError } = await supabase
      .from("invoice_payments")
      .update({
        status: "authorized",
        transaction_id: mapped.transactionId ?? payment.transaction_id,
        authorization_code: mapped.authCode,
        card_type: mapped.cardType,
        card_last_four: mapped.cardLastFour,
        processor_response: parsedBody,
        error_code: null,
        error_message: null,
        authorized_at: now,
        metadata: mergedMetadata,
      })
      .eq("id", payment.id)
      .not("status", "in", "(authorized,captured,paid)");

    if (paymentUpdateError) {
      console.error("[invoice-nmi-webhook] Authorized payment update error:", paymentUpdateError);
    }

    await insertInvoicePaymentEventIfMissing(supabase, {
      paymentId: payment.id,
      invoiceId: payment.invoice_id,
      locationId: payment.location_id,
      eventType: "authorized",
      previousStatus: payment.status,
      newStatus: "authorized",
      amount: mapped.amount,
      pspReference: mapped.transactionId,
      authCode: mapped.authCode,
      resultCode: mapped.responseCode,
      responseMessage: mapped.responseMessage,
      rawResponse: parsedBody,
      reason: "nmi webhook",
    });

    return json({ success: true, status: "authorized", paymentId: payment.id });
  }

  if (mapped.normalizedStatus === "captured") {
    const { error: paymentUpdateError } = await supabase
      .from("invoice_payments")
      .update({
        status: "captured",
        transaction_id: mapped.transactionId ?? payment.transaction_id,
        authorization_code: mapped.authCode,
        card_type: mapped.cardType,
        card_last_four: mapped.cardLastFour,
        processor_response: parsedBody,
        error_code: null,
        error_message: null,
        authorized_at: now,
        captured_at: now,
        metadata: mergedMetadata,
      })
      .eq("id", payment.id)
      .neq("status", "captured");

    if (paymentUpdateError) {
      console.error("[invoice-nmi-webhook] Captured payment update error:", paymentUpdateError);
    }

    const { error: invoiceUpdateError } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: now,
        amount_paid: Number(
          (invoice.total_amount ?? payment.amount ?? 0) as number,
        ),
        updated_at: now,
      })
      .eq("id", invoice.id)
      .neq("status", "paid");

    if (invoiceUpdateError) {
      console.error("[invoice-nmi-webhook] Paid invoice update error:", invoiceUpdateError);
    }

    await insertInvoicePaymentEventIfMissing(supabase, {
      paymentId: payment.id,
      invoiceId: payment.invoice_id,
      locationId: payment.location_id,
      eventType: "captured",
      previousStatus: payment.status,
      newStatus: "captured",
      amount: mapped.amount,
      pspReference: mapped.transactionId,
      authCode: mapped.authCode,
      resultCode: mapped.responseCode,
      responseMessage: mapped.responseMessage,
      rawResponse: parsedBody,
      reason: "nmi webhook",
    });

    return json({ success: true, status: "captured", paymentId: payment.id });
  }

  const nextInvoiceStatus = mapped.normalizedStatus === "declined" ? "payment_failed" : "payment_failed";

  const { error: paymentUpdateError } = await supabase
    .from("invoice_payments")
    .update({
      status: mapped.paymentStatus,
      transaction_id: mapped.transactionId ?? payment.transaction_id,
      authorization_code: mapped.authCode,
      card_type: mapped.cardType,
      card_last_four: mapped.cardLastFour,
      processor_response: parsedBody,
      error_code: mapped.responseCode,
      error_message: mapped.responseMessage,
      failed_at: now,
      metadata: mergedMetadata,
    })
    .eq("id", payment.id)
    .not("status", "in", "(captured,paid)");

  if (paymentUpdateError) {
    console.error("[invoice-nmi-webhook] Failed payment update error:", paymentUpdateError);
  }

  const { error: invoiceUpdateError } = await supabase
    .from("invoices")
    .update({
      status: nextInvoiceStatus,
      updated_at: now,
    })
    .eq("id", invoice.id)
    .neq("status", "paid");

  if (invoiceUpdateError) {
    console.error("[invoice-nmi-webhook] Failed invoice status update error:", invoiceUpdateError);
  }

  await insertInvoicePaymentEventIfMissing(supabase, {
    paymentId: payment.id,
    invoiceId: payment.invoice_id,
    locationId: payment.location_id,
    eventType: mapped.normalizedStatus === "declined" ? "declined" : "error",
    previousStatus: payment.status,
    newStatus: mapped.paymentStatus,
    amount: mapped.amount,
    pspReference: mapped.transactionId,
    authCode: mapped.authCode,
    resultCode: mapped.responseCode,
    responseMessage: mapped.responseMessage,
    rawResponse: parsedBody,
    reason: "nmi webhook",
  });

  return json({
    success: true,
    status: mapped.paymentStatus,
    paymentId: payment.id,
  });
}
