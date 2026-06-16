import { PaymentStatus } from "@/types/order-management";

/**
 * Single source of truth for `payment_status` presentation.
 *
 * This is distinct from order `status` (fulfillment) — the two are independent
 * DB enums and must be rendered as separate badges. A prepaid dine-in order can
 * legitimately read `Preparing` (order status) + `Paid` (payment status) at the
 * same time. Never infer payment state from totals; `payment_status` /
 * `order_payments` are the tender truth. See lib/constants/order-status.ts for
 * the fulfillment-status counterpart.
 *
 * Covers all `payment_status` enum values so a badge can never hit an unmapped
 * value and leak a raw enum string to the UI.
 */

/** Human-readable labels per the reporting spec. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Paid",
  captured: "Paid",
  authorized: "Authorized",
  pending: "Unpaid",
  processing: "Unpaid",
  partial: "Partially Paid",
  partially_refunded: "Partial Refund",
  refunded: "Refunded",
  void: "Void",
  failed: "Failed",
  declined: "Failed",
};

interface BadgeStyle {
  dot: string;
  text: string;
  bg: string;
}

/**
 * Color palette for payment-status badges. Deliberately a different mapping
 * from the order-status badge so the two columns are visually distinct.
 */
export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, BadgeStyle> = {
  paid: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  captured: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  authorized: {
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  pending: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  processing: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  partial: {
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
  },
  partially_refunded: {
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
  },
  refunded: {
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/20",
  },
  failed: {
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/20",
  },
  declined: {
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/20",
  },
  void: {
    dot: "bg-gray-400",
    text: "text-gray-600 dark:text-gray-400",
    bg: "bg-gray-50 dark:bg-gray-800/30",
  },
};

const FALLBACK_STYLE: BadgeStyle = {
  dot: "bg-gray-400",
  text: "text-gray-600 dark:text-gray-400",
  bg: "bg-gray-50 dark:bg-gray-800/30",
};

/** Label for a payment status, with a humanized fallback for unknown values. */
export function getPaymentStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return (
    PAYMENT_STATUS_LABELS[status as PaymentStatus] ??
    status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")
  );
}

/** Badge style for a payment status, with a neutral fallback for unknown values. */
export function getPaymentStatusStyle(status: string | null | undefined): BadgeStyle {
  if (!status) return FALLBACK_STYLE;
  return PAYMENT_STATUS_STYLES[status as PaymentStatus] ?? FALLBACK_STYLE;
}
