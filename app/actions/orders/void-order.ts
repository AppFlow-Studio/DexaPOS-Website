"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { refundNmiSale, voidNmiSale } from "@/lib/payments/nmi";

export interface VoidOrderRequest {
  orderId: string;
  reason: string;
  reasonDetail?: string;
  approvedBy: string;
  paymentIds: string[];
}

export async function voidOrder(
  request: VoidOrderRequest
): Promise<{ success: boolean; message: string; stub?: boolean }> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, message: "Unauthorized" };
    }

    const supabase = createServerSupabaseClient() as any;
    const serviceSupabase = createServiceRoleClient() as any;
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, merchant_id, status, payment_status")
      .eq("id", request.orderId)
      .single();

    if (orderError || !order) {
      return { success: false, message: "Order not found" };
    }

    const { data: payments, error: paymentsError } = await supabase
      .from("order_payments")
      .select(
        "id, order_id, merchant_id, transaction_id, processor_name, total_amount, payment_method, is_settled, settled_at, is_voided"
      )
      .in("id", request.paymentIds)
      .eq("order_id", request.orderId);

    if (paymentsError) {
      return { success: false, message: paymentsError.message };
    }

    if (!payments?.length) {
      return { success: false, message: "No matching payments found for this order." };
    }

    const { data: credentialRows, error: credentialError } = await serviceSupabase.rpc(
      "get_merchant_payment_api_secret",
      {
        p_merchant_id: order.merchant_id,
        p_provider: "nmi",
      }
    );

    if (credentialError) {
      return {
        success: false,
        message: `Failed to load NMI credentials: ${credentialError.message}`,
      };
    }

    const credential = (credentialRows ?? [])[0] ?? null;
    if (!credential?.decrypted_secret) {
      return { success: false, message: "NMI credentials are not configured." };
    }

    const reason = request.reasonDetail?.trim() || request.reason;
    for (const payment of payments) {
      if (payment.is_voided || payment.payment_method !== "card") {
        continue;
      }

      if (payment.processor_name !== "nmi" || !payment.transaction_id) {
        return {
          success: false,
          message: `Payment ${payment.id} cannot be voided by the NMI online-ordering flow.`,
        };
      }

      await serviceSupabase.from("merchant_payment_credential_access_log").insert({
        merchant_payment_credential_id: credential.credential_id,
        merchant_id: order.merchant_id,
        function_name: "void-order",
        actor_user_id: userId,
        metadata: {
          order_id: request.orderId,
          payment_id: payment.id,
        },
      });

      const amount = Number(payment.total_amount || 0).toFixed(2);
      const shouldRefund = Boolean(payment.is_settled || payment.settled_at);
      const reversalResult = shouldRefund
        ? await refundNmiSale(
          { apiKey: credential.decrypted_secret },
          payment.transaction_id,
          { amount }
        )
        : await voidNmiSale(
          { apiKey: credential.decrypted_secret },
          payment.transaction_id,
          reason
        );

      if (!reversalResult.success) {
        return {
          success: false,
          message:
            reversalResult.details.responseText ||
            `Failed to reverse payment ${payment.id}.`,
        };
      }

      const { error: applyError } = await supabase.rpc("apply_refund_to_payment", {
        p_payment_id: payment.id,
        p_refund_amount: Number(amount),
        p_reversal_type: shouldRefund ? "refund" : "void",
        p_return_rrn: null,
        p_return_auth_code: reversalResult.details.authCode || null,
        p_return_reference_id:
          reversalResult.details.referenceNumber || reversalResult.details.transactionId || null,
        p_return_number: reversalResult.details.transactionId || null,
        p_return_reason: reason,
        p_initiated_by: null,
      });

      if (applyError) {
        return {
          success: false,
          message: `Payment ${payment.id} was reversed but could not be recorded locally: ${applyError.message}`,
        };
      }
    }

    const now = new Date().toISOString();
    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        status: "void",
        payment_status: "void",
        cancelled_at: now,
        cancellation_reason: reason,
        voided_at: now,
        void_reason: reason,
        updated_at: now,
      })
      .eq("id", request.orderId);

    if (updateOrderError) {
      return { success: false, message: updateOrderError.message };
    }

    return {
      success: true,
      message: "Order voided successfully.",
      stub: false,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to void order.",
      stub: false,
    };
  }
}
