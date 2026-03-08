"use client";

import type { OrderFullHistory } from "@/types/order-full-history";
import { Permissions } from "@/types/permissions";

export type OrderActionsUserRole = "merchant" | "hq_admin" | "carrier_admin";

export interface UseOrderActionsParams {
  order: OrderFullHistory["order"] | null;
  payments: OrderFullHistory["payments"];
  userRole: OrderActionsUserRole;
  permissions: string[];
  printersConfigured: boolean;
  /** When true (admin read-only view), merchant-only actions are hidden entirely */
  readOnly?: boolean;
}

export interface UseOrderActionsResult {
  canRefund: boolean;
  canVoid: boolean;
  canReprint: boolean;
  canSendReceipt: boolean;
  canAssignCustomer: boolean;
  canAdjustTip: boolean;
  /** True when Refund button should be visible (may be disabled) */
  showRefund: boolean;
  /** True when Void button should be visible (may be disabled) */
  showVoid: boolean;
  refundDisabledReason: string | null;
  voidDisabledReason: string | null;
}

const VOID_DISABLED_STATUSES = ["completed", "void", "cancelled", "refunded"] as const;

function hasRefundPermission(permissions: string[]): boolean {
  if (permissions.length === 0) return true; // No permission check → allow
  return (
    permissions.includes(Permissions.FINANCE_PROCESS_REFUNDS) ||
    permissions.includes("order.refund") ||
    permissions.includes("merchant.refund")
  );
}

function hasVoidPermission(permissions: string[]): boolean {
  if (permissions.length === 0) return true;
  return (
    permissions.includes("order.void") ||
    permissions.includes("merchant.void")
  );
}

function hasReprintPermission(permissions: string[]): boolean {
  if (permissions.length === 0) return true;
  return (
    permissions.includes(Permissions.MERCHANT_MANAGE_DEVICES) ||
    permissions.includes("order.reprint")
  );
}

/**
 * Computes visibility and enabled state for order action buttons based on
 * user role, permissions, and order/payment state.
 */
export function useOrderActions({
  order,
  payments,
  userRole,
  permissions,
  printersConfigured,
  readOnly = false,
}: UseOrderActionsParams): UseOrderActionsResult {
  const isMerchant = userRole === "merchant";
  const isAdmin = userRole === "hq_admin" || userRole === "carrier_admin";

  // When admin read-only banner is shown, hide merchant-only actions (handled by visibility)
  const showMerchantActions = isMerchant && !readOnly;

  // ─── Refund ───
  const hasCapturedPayments = payments.some((p) =>
    ["captured", "paid"].includes(String(p.status ?? "").toLowerCase().replace(/-/g, "_"))
  );
  const isOrderFullyRefunded =
    order?.status === "refunded" ||
    order?.status === "void" ||
    order?.status === "cancelled";
  const refundRoleOk = showMerchantActions && hasRefundPermission(permissions);
  const showRefund = !!order && refundRoleOk;
  const canRefund =
    showRefund &&
    hasCapturedPayments &&
    !isOrderFullyRefunded;

  let refundDisabledReason: string | null = null;
  if (showRefund && !canRefund) {
    if (!hasCapturedPayments)
      refundDisabledReason = "No captured payments to refund";
    else if (isOrderFullyRefunded)
      refundDisabledReason = "Order is already fully refunded or voided";
  }

  // ─── Void ───
  const orderStatus = order?.status ?? "";
  const canVoidStatus = !VOID_DISABLED_STATUSES.includes(
    orderStatus as (typeof VOID_DISABLED_STATUSES)[number]
  );
  const voidRoleOk = showMerchantActions && hasVoidPermission(permissions);
  const showVoid = !!order && voidRoleOk;
  const canVoid = showVoid && canVoidStatus;

  let voidDisabledReason: string | null = null;
  if (showVoid && !canVoid) {
    if (orderStatus === "completed")
      voidDisabledReason = "Order is completed and cannot be voided";
    else if (orderStatus === "void" || orderStatus === "cancelled")
      voidDisabledReason = "Order is already voided or cancelled";
    else if (orderStatus === "refunded")
      voidDisabledReason = "Order is fully refunded";
  }

  // ─── Reprint ─── (Merchant only, printers configured)
  const canReprint =
    isMerchant && printersConfigured && hasReprintPermission(permissions);

  // ─── Send Receipt ─── (All roles)
  const canSendReceipt = true;

  // ─── Assign Customer ─── (Merchant only)
  const canAssignCustomer = showMerchantActions;

  // ─── Adjust Tip ─── (Merchant only, has card payments, pre-settlement)
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
    canRefund,
    canVoid,
    showRefund,
    showVoid,
    canReprint,
    canSendReceipt,
    canAssignCustomer,
    canAdjustTip,
    refundDisabledReason,
    voidDisabledReason,
  };
}
