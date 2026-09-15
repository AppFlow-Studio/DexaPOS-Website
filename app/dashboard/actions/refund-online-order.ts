"use server";

/**
 * [C5] Online Valor order refund + void.
 *
 * Online sales are card-not-present, so a POS terminal cannot reverse them — this
 * is the ONLY refund path for a Valor web order. It reuses the existing reversal
 * engine (create_reversal_v2 -> update_reversal_status_v2 -> apply_refund_to_payment_v4)
 * and the refund-receipt foundation, adding only the processor call.
 *
 * CLIENTS (two, deliberately):
 *   - RLS client (createServerSupabaseClient): the reversal RPCs self-check
 *     user_merchant_id()/user_location_ids() from the caller's Clerk session, so
 *     they MUST run on it. This also enforces cross-merchant isolation.
 *   - Service-role client: reads processor fields + decrypts the Valor app key
 *     (get_valor_account_credentials is service_role/HQ gated).
 *
 * ORDERING (money-safe): open a pending reversal -> call the processor -> on
 * approval, complete the reversal (mints the refund number) then apply to the
 * payment. A decline/error marks the reversal failed and touches nothing else.
 * All three RPCs share one idempotency key (their op-name namespaces them apart),
 * so a full retry is a no-op.
 *
 * RECONCILIATION: the C6 valor-webhook only projects batch_summary settlement
 * totals — it never writes per-transaction refund status — so this action is the
 * sole writer of the reversal + order_payments refund columns. No double-record.
 *
 * [V-REFUND] The Valor refund/void endpoint is UNVERIFIED (see valor/refundApi).
 * Until it is confirmed against Valor's docs this path is staging-only.
 */

import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createValorProcessor } from "@/lib/payments/valor-adapter";
import { isApproved } from "@/lib/payments/types";
import { LogAuditEvent } from "./audit-logs";

/** Mirrors the `refund_reason_type` enum. */
export type RefundReasonCode =
  | "customer_request"
  | "item_quality"
  | "wrong_item"
  | "never_received"
  | "duplicate_charge"
  | "price_adjustment"
  | "order_cancelled"
  | "kitchen_error"
  | "manager_comp"
  | "other";

export interface RefundOnlineOrderInput {
  clerkOrgId: string;
  orderId: string;
  /** The specific order_payments row (the Valor sale). */
  paymentId: string;
  /** Refund amount in cents. Omit for a full refund of the remaining balance. */
  amountCents?: number;
  reasonCode?: RefundReasonCode;
  reasonDescription?: string;
  /**
   * Stable per-action key so a client retry is a safe no-op. Mint once in the UI;
   * if omitted the server mints one (a client retry would then re-charge, so the
   * UI should always supply it).
   */
  idempotencyKey?: string;
}

export interface RefundOnlineOrderResult {
  success: boolean;
  error?: string;
  reversalId?: string;
  refundNumber?: string;
  mode?: "refund" | "void";
}

export async function RefundOnlineOrder(
  input: RefundOnlineOrderInput
): Promise<RefundOnlineOrderResult> {
  const { clerkOrgId, orderId, paymentId } = input;
  const rls = createServerSupabaseClient();
  const svc = createServiceRoleClient();

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { success: false, error: "Unauthorized" };

  // 1. Resolve the acting merchant.
  const { data: merchant } = await svc
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  if (!merchant) return { success: false, error: "Merchant not found" };

  // 2. Load the payment (+ order number for the audit). Service role: we need the
  //    processor fields and settlement state regardless of RLS shape.
  const { data: payment } = await svc
    .from("order_payments")
    .select(
      "id, order_id, merchant_id, location_id, processor_name, transaction_id, authorization_code, rrn, status, amount, total_amount, tip_amount, refunded_amount, is_settled, settled_at, settlement_batch_id, metadata"
    )
    .eq("id", paymentId)
    .single();

  if (!payment || payment.order_id !== orderId || payment.merchant_id !== merchant.id) {
    return { success: false, error: "Payment not found" };
  }
  if (payment.processor_name !== "valor") {
    return {
      success: false,
      error: "This payment was not processed by Valor. Use the matching refund flow.",
    };
  }
  if (!payment.transaction_id) {
    return { success: false, error: "Missing Valor transaction reference; cannot refund." };
  }
  if (!payment.location_id) {
    return { success: false, error: "Payment is not scoped to a location." };
  }
  if (!["captured", "paid"].includes(payment.status ?? "")) {
    return { success: false, error: `Payment is ${payment.status} and cannot be refunded.` };
  }

  // 3. Amounts (integer cents throughout).
  // `total_amount` is the canonical charged amount; `amount` is a legacy fallback.
  const paymentAmountCents = Math.round(
    Number(payment.total_amount ?? payment.amount ?? 0) * 100
  );
  const alreadyRefundedCents = Math.round(Number(payment.refunded_amount ?? 0) * 100);
  const maxRefundableCents = paymentAmountCents - alreadyRefundedCents;
  const requestedCents = input.amountCents ?? maxRefundableCents;
  if (!Number.isFinite(requestedCents) || requestedCents <= 0 || requestedCents > maxRefundableCents) {
    return {
      success: false,
      error: `Refund amount must be between $0.01 and $${(maxRefundableCents / 100).toFixed(2)}.`,
    };
  }
  const isFull = requestedCents >= maxRefundableCents;
  // tip_amount is a subset of total_amount. tipRefundCents tells the local
  // accounting RPC how much of the processor reversal was gratuity.
  const tipCapCents = Math.round(Number(payment.tip_amount ?? 0) * 100);
  const tipRefundCents = isFull
    ? tipCapCents
    : paymentAmountCents > 0
      ? Math.min(tipCapCents, Math.round((tipCapCents * requestedCents) / paymentAmountCents))
      : 0;

  // 4. Permission gate (RLS client).
  const { data: canManage, error: permError } = await rls.rpc("user_has_location_permission", {
    p_location_id: payment.location_id,
    p_permission_code: "location.orders.manage",
  });
  if (permError) return { success: false, error: "Failed to verify refund permission." };
  if (!canManage) {
    return { success: false, error: "You do not have permission to refund orders at this location." };
  }

  // 5. Acting staff profile (for initiated_by / approved_by).
  const { data: staff } = await svc
    .from("staff_profiles")
    .select("id")
    .eq("user_id", clerkUserId)
    .eq("merchant_id", merchant.id)
    .maybeSingle();
  if (!staff) {
    return { success: false, error: "Your staff profile could not be found for this merchant." };
  }
  const staffProfileId = staff.id;

  // 6. Resolve + decrypt the Valor credentials for the account that charged this sale.
  const valorAccountId = (payment.metadata as { valor_account_id?: string } | null)?.valor_account_id;
  if (!valorAccountId) {
    return { success: false, error: "Valor account reference is missing on this payment." };
  }
  const { data: credRows, error: credError } = await svc.rpc("get_valor_account_credentials", {
    p_account_id: valorAccountId,
  });
  const cred = (credRows as Array<{ valor_appid: string; valor_epi: string; decrypted_appkey: string }> | null)?.[0];
  if (credError || !cred?.decrypted_appkey) {
    return { success: false, error: "Could not resolve Valor credentials for this account." };
  }
  const processor = createValorProcessor({
    epi: cred.valor_epi,
    appId: cred.valor_appid,
    appKey: cred.decrypted_appkey,
  });

  // 7. Void vs refund. A void is always full and only valid before settlement; a
  //    partial or a settled sale must be a refund. (Runtime void->refund fallback
  //    on a stale settlement flag is a follow-up once real Valor error codes are
  //    known — see [V-REFUND]; here the decision is made upfront and cleanly.)
  const isSettled = Boolean(payment.is_settled || payment.settled_at || payment.settlement_batch_id);
  const mode: "refund" | "void" = isSettled || !isFull ? "refund" : "void";
  const reversalType = mode === "void" ? "void" : isFull ? "refund" : "partial_refund";

  // 8. One idempotency key for all three RPCs (op-name namespaces them apart).
  const idemKey = input.idempotencyKey ?? randomUUID();

  // 9. Open a pending reversal (RLS client enforces ownership).
  const { data: reversal, error: createErr } = await rls.rpc("create_reversal_v2", {
    p_original_payment_id: paymentId,
    p_original_psp_reference: payment.transaction_id,
    p_reversal_reference_id: idemKey,
    p_reversal_type: reversalType,
    p_amount: requestedCents / 100,
    p_reason_code: input.reasonCode ?? "customer_request",
    p_reason_description: input.reasonDescription ?? null,
    p_initiated_by: staffProfileId,
    p_approved_by: staffProfileId,
    p_idempotency_key: idemKey,
  });
  if (createErr || !reversal) {
    return { success: false, error: createErr?.message ?? "Could not open the refund." };
  }
  const reversalId = (reversal as { id: string }).id;

  // 10. Call the processor — money moves here.
  let tx;
  try {
    tx =
      mode === "void"
        ? await processor.voidSale({
            transactionId: payment.transaction_id,
            reason: input.reasonDescription,
          })
        : await processor.refund({
            transactionId: payment.transaction_id,
            money: { amountMinor: requestedCents, currency: "USD" },
            authCode: payment.authorization_code ?? undefined,
            rrn: payment.rrn ?? undefined,
          });
  } catch (err) {
    await rls.rpc("update_reversal_status_v2", {
      p_reversal_id: reversalId,
      p_status: "failed",
      p_response_message: err instanceof Error ? err.message : "Processor error",
      p_idempotency_key: idemKey,
    });
    return { success: false, error: "The refund could not be completed. Please try again." };
  }

  // 11. Declined / transport error -> mark failed, touch nothing else.
  if (!isApproved(tx)) {
    await rls.rpc("update_reversal_status_v2", {
      p_reversal_id: reversalId,
      p_status: "failed",
      p_terminal_response: tx.raw as never,
      p_result_code: tx.responseCode,
      p_response_message: tx.responseText,
      p_idempotency_key: idemKey,
    });
    return { success: false, error: tx.responseText };
  }

  // 12. Approved -> complete the reversal (mints the refund number via trigger),
  //     then apply to the payment. Both idempotent on idemKey.
  const rawRrn = (tx.raw as { rrn?: string } | null)?.rrn ?? null;
  const reversalPspRef = tx.transactionId ?? tx.authCode ?? rawRrn;

  await rls.rpc("update_reversal_status_v2", {
    p_reversal_id: reversalId,
    p_status: "completed",
    p_terminal_response: tx.raw as never,
    p_result_code: tx.responseCode,
    p_response_message: tx.responseText,
    p_reversal_psp_reference: reversalPspRef,
    p_idempotency_key: idemKey,
  });

  // Read back the minted refund number (null for a void — voids get no receipt).
  const { data: refreshed } = await svc
    .from("reversals")
    .select("refund_number")
    .eq("id", reversalId)
    .maybeSingle();
  const refundNumber = (refreshed as { refund_number?: string | null } | null)?.refund_number ?? null;

  const applyRefund = () =>
    rls.rpc("apply_refund_to_payment_v4", {
      p_payment_id: paymentId,
      p_refund_amount: requestedCents / 100,
      p_reversal_type: reversalType,
      p_tip_refund_amount: tipRefundCents / 100,
      p_return_rrn: rawRrn,
      p_return_auth_code: tx.authCode,
      p_return_reference_id: tx.transactionId,
      p_return_number: refundNumber,
      p_return_reason: input.reasonDescription ?? null,
      p_initiated_by: staffProfileId,
      p_restore_paid_quantity: false,
      p_idempotency_key: idemKey,
      p_station_id: null,
    });

  let { error: applyErr } = await applyRefund();
  if (applyErr) {
    // Money moved + reversal completed, but the payment row did not update. The
    // RPC is idempotent on idemKey, so a same-key retry is safe.
    ({ error: applyErr } = await applyRefund());
    if (applyErr) {
      console.error("[RefundOnlineOrder] Valor reversal succeeded but apply_refund failed", {
        reversalId,
        paymentId,
        orderId,
        error: applyErr.message,
      });
      return {
        success: false,
        error: `Refund was accepted by Valor but could not be fully recorded. Do not retry — contact support with order ${orderId}.`,
        reversalId,
        mode,
      };
    }
  }

  // 13. Audit (never logs the app key).
  const { data: order } = await svc
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();

  await LogAuditEvent({
    clerkOrgId,
    locationId: payment.location_id,
    action: `${mode === "void" ? "Voided" : "Refunded"} online order (Valor): $${(requestedCents / 100).toFixed(2)}`,
    actionCategory: "order",
    severity: "critical",
    resourceType: "order",
    resourceId: orderId,
    resourceName: order?.order_number ?? refundNumber ?? reversalId,
    metadata: {
      reversalId,
      refundNumber,
      amountCents: requestedCents,
      tipRefundCents,
      mode,
      processor: "valor",
      reversalPspReference: reversalPspRef,
    },
  });

  return {
    success: true,
    reversalId,
    refundNumber: refundNumber ?? undefined,
    mode,
  };
}
