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
        "id, merchant_id, order_id, payment_device_id, transaction_id, processor_name, is_settled, settled_at, status"
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

    let paymentDeviceId = payment.payment_device_id as string | null;

    if (!paymentDeviceId) {
      const { data: orderRow, error: orderRowError } = await supabase
        .from("orders")
        .select("location_id")
        .eq("id", payment.order_id)
        .single();

      if (orderRowError || !orderRow?.location_id) {
        return {
          success: false,
          error: "Unable to resolve the order location for NMI reconciliation.",
        };
      }

      const { data: storefrontPaymentConfigRows, error: storefrontPaymentConfigError } =
        await supabase.rpc("get_storefront_payment_config", {
          p_location_id: orderRow.location_id,
        });

      if (storefrontPaymentConfigError) {
        return {
          success: false,
          error: `Failed to load NMI storefront config: ${storefrontPaymentConfigError.message}`,
        };
      }

      paymentDeviceId =
        ((storefrontPaymentConfigRows as Array<{ device_id: string; provider: string }> | null) ?? [])
          .find((row) => row.provider === "nmi")
          ?.device_id ?? null;
    }

    if (!paymentDeviceId) {
      return { success: false, error: "No NMI payment device is associated with this payment." };
    }

    const { data: credentialRows, error: credentialError } = await supabase.rpc(
      "get_nmi_device_credentials",
      {
        p_device_id: paymentDeviceId,
      }
    );

    if (credentialError) {
      return {
        success: false,
        error: `Failed to load NMI device credentials: ${credentialError.message}`,
      };
    }

    const credential = (credentialRows ?? [])[0] ?? null;
    if (!credential?.decrypted_security_key) {
      return { success: false, error: "NMI credentials are not configured." };
    }

    await supabase.from("payment_credential_access_log").insert({
      device_id: paymentDeviceId,
      function_name: "reconcile-nmi-order-payment",
      actor_user_id: null,
      metadata: {
        order_payment_id: payment.id,
        order_id: payment.order_id,
      },
    });

    // [C2] Intentionally NOT routed through the PaymentProcessor interface.
    // This reconciliation path reads NMI-specific transaction attributes
    // (`condition`, `gatewayFee`) that have no processor-agnostic equivalent,
    // and Valor's equivalent reconciliation arrives via webhook projection in
    // C6 rather than a transaction lookup. Generalizing it here would either
    // pollute the interface or silently drop data.
    const lookup = await getNmiTransaction(
      { apiKey: credential.decrypted_security_key },
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
