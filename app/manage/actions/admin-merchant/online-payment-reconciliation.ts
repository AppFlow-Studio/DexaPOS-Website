"use server";

import { assertHQPermission } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getNmiTransaction } from "@/lib/payments/nmi";

function deriveOrderPaymentUpdates(details: {
  responseCode: string;
  responseText: string;
  condition: string;
  gatewayFee: number | null;
  raw: Record<string, unknown>;
}) {
  const condition = details.condition.toLowerCase();
  const updates: Record<string, unknown> = {
    processor_response: details.raw,
    result_code: details.responseCode || null,
    result_message: details.responseText || null,
    gateway_fee: details.gatewayFee ?? null,
    updated_at: new Date().toISOString(),
  };

  if (condition.includes("settled")) {
    updates.is_settled = true;
    updates.settled_at = new Date().toISOString();
  }

  if (condition.includes("void")) {
    updates.status = "void";
    updates.is_voided = true;
    updates.voided_at = new Date().toISOString();
  }

  if (condition.includes("refund")) {
    updates.status = "refunded";
    updates.refunded_at = new Date().toISOString();
  }

  return updates;
}

export async function reconcileNmiOrderPayment(orderPaymentId: string): Promise<{
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}> {
  try {
    await assertHQPermission("hq.merchant.view");

    const supabase = createServiceRoleClient() as any;
    const { data: payment, error: paymentError } = await supabase
      .from("order_payments")
      .select(
        "id, merchant_id, order_id, transaction_id, processor_name, is_settled, settled_at, status"
      )
      .eq("id", orderPaymentId)
      .single();

    if (paymentError || !payment) {
      return { success: false, error: "Payment not found" };
    }

    if (payment.processor_name !== "nmi" || !payment.transaction_id) {
      return {
        success: false,
        error: "Only NMI-backed online payments can be reconciled by this action.",
      };
    }

    const { data: credentialRows, error: credentialError } = await supabase.rpc(
      "get_merchant_payment_api_secret",
      {
        p_merchant_id: payment.merchant_id,
        p_provider: "nmi",
      }
    );

    if (credentialError) {
      return {
        success: false,
        error: `Failed to load NMI credentials: ${credentialError.message}`,
      };
    }

    const credential = (credentialRows ?? [])[0] ?? null;
    if (!credential?.decrypted_secret) {
      return { success: false, error: "NMI credentials are not configured." };
    }

    await supabase.from("merchant_payment_credential_access_log").insert({
      merchant_payment_credential_id: credential.credential_id,
      merchant_id: payment.merchant_id,
      function_name: "reconcile-nmi-order-payment",
      actor_user_id: null,
      metadata: {
        order_payment_id: payment.id,
        order_id: payment.order_id,
      },
    });

    const lookup = await getNmiTransaction(
      { apiKey: credential.decrypted_secret },
      payment.transaction_id
    );

    if (!lookup.success) {
      return {
        success: false,
        error:
          lookup.details.responseText ||
          `NMI lookup failed with status ${lookup.status}.`,
      };
    }

    const updates = deriveOrderPaymentUpdates({
      responseCode: lookup.details.responseCode || lookup.details.response,
      responseText: lookup.details.responseText || "",
      condition: lookup.details.condition || "",
      gatewayFee: lookup.details.gatewayFee,
      raw: lookup.body,
    });

    const { error: updateError } = await supabase
      .from("order_payments")
      .update(updates)
      .eq("id", payment.id);

    if (updateError) {
      return {
        success: false,
        error: `NMI lookup succeeded but the local payment row could not be updated: ${updateError.message}`,
      };
    }

    return {
      success: true,
      data: {
        order_payment_id: payment.id,
        transaction_id: payment.transaction_id,
        response_code: lookup.details.responseCode || lookup.details.response,
        response_text: lookup.details.responseText,
        condition: lookup.details.condition,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reconcile NMI payment.",
    };
  }
}
