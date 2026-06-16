"use server";

import {
  buildInvoicePaymentOrderId,
  resolveInvoicePaymentRailForPublicToken,
} from "@/lib/invoices/payment-rail";
import { createNmiSale } from "@/lib/payments/nmi";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface ChargeInvoiceInput {
  publicToken: string;
  paymentToken: string;
  idempotencyKey: string;
  cardType?: string | null;
  cardLastFour?: string | null;
}

export interface ChargeInvoiceResult {
  success: boolean;
  status: "paid" | "declined" | "error";
  message: string;
}

interface InvoiceLookupRow {
  id: string;
  merchant_id: string;
  location_id: string | null;
  bill_type: string | null;
  status: string;
  total_amount: number;
  amount_paid: number;
  invoice_number: string | null;
}

interface InvoicePaymentAttemptRow {
  id: string;
  status: string;
  error_message: string | null;
}

function toAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function mergeMetadata(
  current: unknown,
  next: Record<string, unknown>,
): Record<string, unknown> {
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return { ...next };
  }

  return {
    ...(current as Record<string, unknown>),
    ...next,
  };
}

async function insertInvoicePaymentEventIfMissing(
  supabase: any,
  payload: {
    paymentId: string;
    invoiceId: string;
    locationId: string | null;
    eventType: "created" | "captured" | "declined" | "error";
    previousStatus?: string | null;
    newStatus?: string | null;
    amount?: number;
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
    console.error("[chargeInvoice] Failed to insert payment event:", error);
  }
}

export async function chargeInvoice(
  input: ChargeInvoiceInput,
): Promise<ChargeInvoiceResult> {
  const { publicToken, idempotencyKey } = input;

  if (!publicToken || !idempotencyKey || !input.paymentToken?.trim()) {
    return { success: false, status: "error", message: "Missing required fields." };
  }

  const supabase = createServiceRoleClient();

  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .select(
      "id, merchant_id, location_id, bill_type, status, total_amount, amount_paid, invoice_number",
    )
    .eq("public_token", publicToken)
    .single();

  if (invoiceErr || !invoice) {
    return { success: false, status: "error", message: "Invoice not found." };
  }

  const inv = invoice as InvoiceLookupRow;

  if (inv.status === "paid") {
    return { success: false, status: "error", message: "This invoice is already paid." };
  }
  if (inv.status === "cancelled") {
    return { success: false, status: "error", message: "This invoice has been cancelled." };
  }

  const { data: successfulPayment } = await supabase
    .from("invoice_payments")
    .select("id, status")
    .eq("invoice_id", inv.id)
    .in("status", ["captured", "paid"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (successfulPayment?.id) {
    return {
      success: true,
      status: "paid",
      message: "Payment already processed.",
    };
  }

  const { data: activeAttempt } = await supabase
    .from("invoice_payments")
    .select("id, status")
    .eq("invoice_id", inv.id)
    .in("status", ["pending", "processing", "authorized"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeAttempt?.id) {
    return {
      success: false,
      status: "error",
      message: "A payment attempt for this invoice is already in progress.",
    };
  }

  const { data: existingAttempt } = await supabase
    .from("invoice_payments")
    .select("id, status, error_message")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingAttempt) {
    const prior = existingAttempt as InvoicePaymentAttemptRow;
    if (prior.status === "captured" || prior.status === "paid") {
      return { success: true, status: "paid", message: "Payment already processed." };
    }
    if (prior.status === "declined") {
      return {
        success: false,
        status: "declined",
        message: prior.error_message || "Your card was declined. Please try another card.",
      };
    }
    if (prior.status === "failed") {
      return {
        success: false,
        status: "error",
        message: prior.error_message || "A prior payment attempt failed. Please retry.",
      };
    }
    return {
      success: false,
      status: "error",
      message: "A payment attempt with this key is already in progress.",
    };
  }

  const amountDue = Math.max(0, toAmount(inv.total_amount) - toAmount(inv.amount_paid));
  if (amountDue <= 0) {
    return { success: false, status: "error", message: "Nothing left to pay on this invoice." };
  }

  const rail = await resolveInvoicePaymentRailForPublicToken(publicToken, {
    includeSecrets: true,
  });

  if (!rail?.tokenizationKey || !rail.apiKey) {
    return {
      success: false,
      status: "error",
      message: "Card payments are not configured for this invoice.",
    };
  }

  const metadata = {
    public_token: publicToken,
    bill_type: rail.billType,
    rail_kind: rail.kind,
    payment_device_id: rail.paymentDeviceId,
    platform_billing_config_id: rail.platformBillingConfigId,
    webhook_secret_configured: Boolean(rail.webhookSecret),
  };

  const { data: insertedPayment, error: insertPaymentError } = await supabase
    .from("invoice_payments")
    .insert({
      invoice_id: inv.id,
      merchant_id: inv.merchant_id,
      location_id: inv.location_id,
      amount: Number(amountDue.toFixed(2)),
      status: "processing",
      processor_name: "nmi",
      card_token: input.paymentToken.trim(),
      card_type: input.cardType?.trim() || null,
      card_last_four: input.cardLastFour?.trim() || null,
      idempotency_key: idempotencyKey,
      metadata,
    })
    .select("id, metadata")
    .single();

  if (insertPaymentError || !insertedPayment?.id) {
    console.error("[chargeInvoice] Failed to create invoice payment row:", insertPaymentError);
    return {
      success: false,
      status: "error",
      message: "We couldn't start this payment. Please try again.",
    };
  }

  const paymentId = insertedPayment.id as string;
  const orderId = buildInvoicePaymentOrderId(paymentId);
  const now = new Date().toISOString();

  await supabase
    .from("invoice_payments")
    .update({
      metadata: mergeMetadata(insertedPayment.metadata, {
        ...metadata,
        order_id: orderId,
      }),
      updated_at: now,
    })
    .eq("id", paymentId);

  await insertInvoicePaymentEventIfMissing(supabase, {
    paymentId,
    invoiceId: inv.id,
    locationId: inv.location_id,
    eventType: "created",
    previousStatus: null,
    newStatus: "processing",
    amount: Number(amountDue.toFixed(2)),
    reason: "invoice public payment initiated",
  });

  const charge = await createNmiSale(
    {
      apiKey: rail.apiKey,
    },
    {
      amount: Number(amountDue.toFixed(2)),
      currency: "USD",
      paymentToken: input.paymentToken.trim(),
      industry: "ecommerce",
      orderId,
    },
  );

  const transactionId = charge.details.transactionId || charge.details.id || null;
  const authCode = charge.details.authCode || null;
  const responseCode = charge.details.responseCode || charge.details.response || null;
  const responseText =
    charge.details.responseText ||
    (charge.status >= 500
      ? "Payment service is temporarily unavailable. Please try again."
      : "Your card was declined. Please try another card.");

  if (!charge.success) {
    const nextStatus = charge.status >= 500 ? "failed" : "declined";

    const { error: paymentUpdateError } = await supabase
      .from("invoice_payments")
      .update({
        status: nextStatus,
        transaction_id: transactionId,
        authorization_code: authCode,
        card_type: input.cardType?.trim() || null,
        card_last_four: input.cardLastFour?.trim() || null,
        processor_response: charge.body,
        error_code: responseCode,
        error_message: responseText,
        failed_at: now,
        metadata: mergeMetadata(insertedPayment.metadata, {
          ...metadata,
          order_id: orderId,
        }),
      })
      .eq("id", paymentId);

    if (paymentUpdateError) {
      console.error("[chargeInvoice] Failed to mark invoice payment declined:", paymentUpdateError);
    }

    const { error: invoiceUpdateError } = await supabase
      .from("invoices")
      .update({
        status: "payment_failed",
        updated_at: now,
      })
      .eq("id", inv.id)
      .neq("status", "paid");

    if (invoiceUpdateError) {
      console.error("[chargeInvoice] Failed to mark invoice payment_failed:", invoiceUpdateError);
    }

    await insertInvoicePaymentEventIfMissing(supabase, {
      paymentId,
      invoiceId: inv.id,
      locationId: inv.location_id,
      eventType: charge.status >= 500 ? "error" : "declined",
      previousStatus: "processing",
      newStatus: nextStatus,
      amount: Number(amountDue.toFixed(2)),
      pspReference: transactionId,
      authCode,
      resultCode: responseCode,
      responseMessage: responseText,
      rawResponse: charge.body,
      reason: charge.status >= 500 ? "gateway error" : "gateway decline",
    });

    return {
      success: false,
      status: charge.status >= 500 ? "error" : "declined",
      message: responseText,
    };
  }

  const { error: capturedPaymentError } = await supabase
    .from("invoice_payments")
    .update({
      status: "captured",
      transaction_id: transactionId,
      authorization_code: authCode,
      card_type: input.cardType?.trim() || null,
      card_last_four: input.cardLastFour?.trim() || null,
      processor_response: charge.body,
      error_code: null,
      error_message: null,
      authorized_at: now,
      captured_at: now,
      metadata: mergeMetadata(insertedPayment.metadata, {
        ...metadata,
        order_id: orderId,
      }),
    })
    .eq("id", paymentId);

  if (capturedPaymentError) {
    console.error("[chargeInvoice] Failed to mark invoice payment captured:", capturedPaymentError);
  }

  await insertInvoicePaymentEventIfMissing(supabase, {
    paymentId,
    invoiceId: inv.id,
    locationId: inv.location_id,
    eventType: "captured",
    previousStatus: "processing",
    newStatus: "captured",
    amount: Number(amountDue.toFixed(2)),
    pspReference: transactionId,
    authCode,
    resultCode: responseCode,
    responseMessage: charge.details.responseText || "Approved",
    rawResponse: charge.body,
  });

  const { error: invoicePaidError } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: now,
      amount_paid: Number(toAmount(inv.total_amount).toFixed(2)),
      updated_at: now,
    })
    .eq("id", inv.id)
    .neq("status", "paid");

  if (invoicePaidError) {
    console.error("[chargeInvoice] Failed to mark invoice paid:", invoicePaidError);
    return {
      success: true,
      status: "paid",
      message: "Payment approved. Refresh in a moment if this page does not update automatically.",
    };
  }

  return {
    success: true,
    status: "paid",
    message: inv.invoice_number
      ? `Invoice ${inv.invoice_number} has been paid.`
      : "Payment received. Thank you!",
  };
}
