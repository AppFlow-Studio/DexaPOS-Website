"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { GetOrderDetails } from "@/app/dashboard/actions/order";

/** Resolve current user's staff profile ID for audit fields. */
export async function getCurrentStaffProfileId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("staff_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.id ?? null;
}

export interface AdjustTipParams {
  paymentId: string;
  orderId: string;
  newTipAmount: number;
  reason: string;
  staffId: string;
}

export interface AdjustTipResult {
  success: boolean;
  error?: string;
}

/**
 * Adjust the tip on a card payment.
 * Database-only update; terminal/processor tip adjustment happens at settlement.
 * Preconditions: card payment, captured/paid, not voided, not settled.
 */
export async function adjustTip(
  params: AdjustTipParams
): Promise<AdjustTipResult> {
  const { paymentId, orderId, newTipAmount, reason, staffId } = params;

  if (newTipAmount < 0) {
    return { success: false, error: "Tip cannot be negative." };
  }

  if (!reason?.trim()) {
    return { success: false, error: "Reason is required." };
  }

  // Verify access to order
  const order = await GetOrderDetails(orderId);
  if (!order) {
    return { success: false, error: "Order not found." };
  }

  const supabase = createServiceRoleClient();

  // Get current payment
  const { data: payment, error: fetchError } = await supabase
    .from("order_payments")
    .select("id, amount, tip_amount, total_amount, status, payment_method, is_settled, is_voided")
    .eq("id", paymentId)
    .eq("order_id", orderId)
    .single();

  if (fetchError || !payment) {
    return { success: false, error: "Payment not found." };
  }

  // Preconditions: card payment
  const isCard =
    typeof payment.payment_method === "string" &&
    (payment.payment_method.startsWith("card_") ||
      ["card_spinapi", "card_dvpaylite", "card_manual"].includes(
        payment.payment_method
      ));
  if (!isCard) {
    return { success: false, error: "Tip adjustment is only allowed for card payments." };
  }

  // Preconditions: captured or paid
  const status = String(payment.status ?? "").toLowerCase().replace(/-/g, "_");
  if (status !== "captured" && status !== "paid") {
    return { success: false, error: "Payment must be captured or paid." };
  }

  // Preconditions: not voided
  if (payment.is_voided || payment.status === "void") {
    return { success: false, error: "Cannot adjust tip on a voided payment." };
  }

  // Preconditions: not settled
  if (payment.is_settled) {
    return { success: false, error: "Cannot adjust tip after batch settlement." };
  }

  // Validation: tip <= 100% of payment amount
  const amount = Number(payment.amount) ?? 0;
  if (newTipAmount > amount) {
    return { success: false, error: "Tip cannot exceed the payment amount." };
  }

  const newTotal = amount + newTipAmount;

  // Update payment record
  const { error: updateError } = await supabase
    .from("order_payments")
    .update({
      tip_amount: newTipAmount,
      total_amount: newTotal,
      original_tip_amount: payment.tip_amount,
      tip_adjusted_by: staffId,
      tip_adjusted_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (updateError) {
    console.error("[adjustTip] Update payment error:", updateError);
    return { success: false, error: updateError.message };
  }

  // Log payment event
  const { error: eventError } = await supabase.from("payment_events").insert({
    payment_id: paymentId,
    order_id: orderId,
    event_type: "tip_adjusted",
    amount: newTipAmount,
    tip_amount: newTipAmount,
    reason: reason.trim(),
    staff_id: staffId,
  });

  if (eventError) {
    console.warn("[adjustTip] Payment event insert (non-fatal):", eventError);
  }

  // Recalculate order amount_paid from all active payments
  const { data: allPayments, error: paymentsError } = await supabase
    .from("order_payments")
    .select("total_amount, status")
    .eq("order_id", orderId)
    .not("status", "in", "(void,failed,declined)");

  if (paymentsError) {
    console.error("[adjustTip] Fetch all payments error:", paymentsError);
  } else {
    const totalPaid =
      (allPayments ?? []).reduce(
        (sum, p) => sum + Number(p.total_amount ?? 0),
        0
      ) ?? 0;

    await supabase
      .from("orders")
      .update({ amount_paid: totalPaid })
      .eq("id", orderId);
  }

  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath(`/manage/merchants/*/orders/${orderId}`);

  return { success: true };
}
