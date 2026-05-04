"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { refundNmiSale } from "@/lib/payments/nmi";

export interface RefundItemRequest {
  orderItemId: string;
  quantity: number;
  returnToInventory: boolean;
  reason: string;
}

export interface RefundRequest {
  orderId: string;
  refundType: "full" | "partial" | "item_return";
  amount: number;
  paymentId: string;
  reasonCode: string;
  reasonDetail?: string;
  approvedBy?: string;
  items?: RefundItemRequest[];
}

function getReversalType(refundType: RefundRequest["refundType"]) {
  switch (refundType) {
    case "partial":
      return "partial_refund";
    case "item_return":
      return "item_return";
    default:
      return "refund";
  }
}

export async function processRefund(
  request: RefundRequest
): Promise<{ success: boolean; message: string; refundId?: string; stub?: boolean }> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, message: "Unauthorized" };
    }

    const supabase = createServerSupabaseClient() as any;
    const serviceSupabase = createServiceRoleClient() as any;
    const { data: payment, error: paymentError } = await supabase
      .from("order_payments")
      .select(
        "id, order_id, merchant_id, transaction_id, processor_name, total_amount, refunded_amount, is_voided"
      )
      .eq("id", request.paymentId)
      .eq("order_id", request.orderId)
      .single();

    if (paymentError || !payment) {
      return { success: false, message: "Payment not found" };
    }

    if (payment.is_voided) {
      return { success: false, message: "Payment is already voided" };
    }

    if (payment.processor_name !== "nmi" || !payment.transaction_id) {
      return {
        success: false,
        message: "Only NMI-backed online payments can be refunded by this action.",
      };
    }

    const { data: credentialRows, error: credentialError } = await serviceSupabase.rpc(
      "get_merchant_payment_api_secret",
      {
        p_merchant_id: payment.merchant_id,
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

    await serviceSupabase.from("merchant_payment_credential_access_log").insert({
      merchant_payment_credential_id: credential.credential_id,
      merchant_id: payment.merchant_id,
      function_name: "process-refund",
      actor_user_id: userId,
      metadata: {
        order_id: request.orderId,
        payment_id: request.paymentId,
        refund_type: request.refundType,
      },
    });

    const refundAmount = Number(request.amount || 0);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return { success: false, message: "Refund amount must be greater than zero." };
    }

    const refundResult = await refundNmiSale(
      { apiKey: credential.decrypted_secret },
      payment.transaction_id,
      {
        amount: refundAmount.toFixed(2),
      }
    );

    if (!refundResult.success) {
      return {
        success: false,
        message:
          refundResult.details.responseText ||
          "NMI refund failed. No local state was updated.",
      };
    }

    const reversalType = getReversalType(request.refundType);
    const reason = request.reasonDetail?.trim() || request.reasonCode;
    const { error: applyError } = await supabase.rpc("apply_refund_to_payment", {
      p_payment_id: payment.id,
      p_refund_amount: refundAmount,
      p_reversal_type: reversalType,
      p_return_rrn: null,
      p_return_auth_code: refundResult.details.authCode || null,
      p_return_reference_id:
        refundResult.details.referenceNumber || refundResult.details.transactionId || null,
      p_return_number: refundResult.details.transactionId || null,
      p_return_reason: reason,
      p_initiated_by: null,
    });

    if (applyError) {
      return {
        success: false,
        message: `Refund succeeded at NMI but could not be recorded locally: ${applyError.message}`,
      };
    }

    return {
      success: true,
      message: "Refund processed successfully.",
      refundId: refundResult.details.transactionId || undefined,
      stub: false,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to process refund.",
      stub: false,
    };
  }
}
