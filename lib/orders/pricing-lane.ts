import type { OrderPayment, OrderResponse } from "@/types/order-management";

/**
 * Brand blue used to emphasize the *card* pricing lane across receipts and
 * order summaries (per design system). Cash lane stays neutral.
 */
export const BRAND_BLUE = "#0C4FD1";

export type PricingLane = "card" | "cash" | "mixed";

/** Payments that actually tendered money (ignore pending/failed/voided). */
function capturedPayments(payments: OrderPayment[] | undefined): OrderPayment[] {
  return (payments ?? []).filter(
    (p) => p.status === "captured" || p.status === "paid"
  );
}

function isCashTender(p: OrderPayment): boolean {
  return p.is_cash_priced === true || p.payment_method === "cash";
}

/**
 * Resolve which pricing lane an order was actually charged on.
 *
 * Authoritative source is the payment record(s) — `is_cash_priced` /
 * `payment_method` — NOT `orders.effective_total` (which is always card_total
 * and is therefore wrong for cash orders). `orders.payment_pricing_mode` is
 * used only as a corroborating fallback when no captured payments exist yet.
 *
 * Returns `null` for unpaid / draft orders so callers can present both lanes as
 * quoted (no false strike-through).
 */
export function resolveChargedLane(
  order: Pick<OrderResponse, "payment_pricing_mode"> | null | undefined,
  payments: OrderPayment[] | undefined
): PricingLane | null {
  const captured = capturedPayments(payments);

  if (captured.length > 0) {
    const hasCash = captured.some((p) => isCashTender(p));
    const hasCard = captured.some((p) => !isCashTender(p));
    if (hasCash && hasCard) return "mixed";
    return hasCash ? "cash" : "card";
  }

  // No money tendered yet — fall back to the order's intended pricing mode.
  const mode = order?.payment_pricing_mode;
  if (mode === "card" || mode === "cash" || mode === "mixed") return mode;
  return null;
}

/**
 * Presentation props for one lane row in a dual-pricing total ladder.
 *
 * - The active (charged) lane is bold; card uses brand blue, cash stays neutral.
 * - The inactive lane is de-emphasized and struck through.
 * - When `chargedLane` is null (unpaid) neither lane is struck.
 */
export function laneTotalProps(
  chargedLane: PricingLane | null,
  row: "card" | "cash"
): { bold: boolean; valueClassName: string } {
  // Unpaid / draft: present both as plain quotes, no strike.
  if (chargedLane === null) {
    return { bold: false, valueClassName: "" };
  }

  const isActive = chargedLane === row || chargedLane === "mixed";
  if (!isActive) {
    return { bold: false, valueClassName: "text-muted-foreground line-through" };
  }

  return {
    bold: true,
    // Literal class (not interpolated) so Tailwind's source scanner emits it.
    valueClassName: row === "card" ? "text-[#0C4FD1]" : "",
  };
}
