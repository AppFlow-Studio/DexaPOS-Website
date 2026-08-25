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
 * Status is never colour-coded (UI-DESIGN-SYSTEM §4.6b / D-12): every payment
 * status renders as the same neutral pill and the *word* carries the meaning.
 *
 * The `{dot,text,bg}` shape is kept so existing consumers keep compiling, but
 * every status now resolves to the same neutral triple. Note these classes are
 * only generated because they are also written literally in a `.tsx` — this is
 * a `.ts` file and Tailwind does not scan it (C7).
 */
const NEUTRAL_STYLE: BadgeStyle = {
  dot: "bg-muted-foreground/60",
  text: "text-muted-foreground",
  bg: "bg-muted/60",
};

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, BadgeStyle> = {
  paid: NEUTRAL_STYLE,
  captured: NEUTRAL_STYLE,
  authorized: NEUTRAL_STYLE,
  pending: NEUTRAL_STYLE,
  processing: NEUTRAL_STYLE,
  partial: NEUTRAL_STYLE,
  partially_refunded: NEUTRAL_STYLE,
  refunded: NEUTRAL_STYLE,
  failed: NEUTRAL_STYLE,
  declined: NEUTRAL_STYLE,
  void: NEUTRAL_STYLE,
};

const FALLBACK_STYLE: BadgeStyle = NEUTRAL_STYLE;

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
