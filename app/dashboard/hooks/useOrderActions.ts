"use client";

import type { OrderFullHistory } from "@/types/order-full-history";

export type OrderActionsUserRole = "merchant" | "hq_admin" | "carrier_admin";

export interface UseOrderActionsParams {
  order: OrderFullHistory["order"] | null;
  payments: OrderFullHistory["payments"];
  userRole: OrderActionsUserRole;
  permissions: string[];
  /** When true (admin read-only view), merchant-only actions are hidden entirely */
  readOnly?: boolean;
}

export interface UseOrderActionsResult {
  canSendReceipt: boolean;
  canAssignCustomer: boolean;
  canAdjustTip: boolean;
}

/**
 * Computes visibility and enabled state for order action buttons based on
 * user role and order/payment state.
 */
export function useOrderActions({
  order,
  payments,
  userRole,
  readOnly = false,
}: UseOrderActionsParams): UseOrderActionsResult {
  const isMerchant = userRole === "merchant";
  const showMerchantActions = isMerchant && !readOnly;

  const canSendReceipt = true;

  const canAssignCustomer = showMerchantActions;

  const ELIGIBLE_TIP_STATUSES = ["captured", "paid"] as const;
  const eligibleTipPayments = payments.filter((p) => {
    const method = String(p.payment_method ?? "").toLowerCase();
    const isCard =
      method.startsWith("card_") ||
      ["card_spinapi", "card_dvpaylite", "card_manual"].includes(method);
    if (!isCard) return false;
    const status = String(p.status ?? "").toLowerCase().replace(/-/g, "_");
    if (!ELIGIBLE_TIP_STATUSES.includes(status as (typeof ELIGIBLE_TIP_STATUSES)[number]))
      return false;
    const pm = p as { is_voided?: boolean; is_settled?: boolean };
    if (pm.is_voided || pm.is_settled) return false;
    return true;
  });
  const canAdjustTip =
    showMerchantActions &&
    !!order &&
    order.status !== "void" &&
    order.status !== "cancelled" &&
    eligibleTipPayments.length > 0;

  return {
    canSendReceipt,
    canAssignCustomer,
    canAdjustTip,
  };
}
