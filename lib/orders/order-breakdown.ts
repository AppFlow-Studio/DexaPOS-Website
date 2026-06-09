import type { OrderPayment } from "@/types/order-management";
import { resolveChargedLane, type PricingLane } from "@/lib/orders/pricing-lane";

/**
 * Single source of truth for an order's totals breakdown.
 *
 * Dexa stores every order in two parallel pricing tracks (cash-discounting):
 * a `card_*` track (full / list price) and a `cash_*` track (discounted). The
 * bare columns (`subtotal`, `tax_amount`, `total_amount`) mirror the card track,
 * and `service_charge` / `discount_amount` / `tip_amount` are flat (shared by
 * both tracks). Each track is internally consistent and foots on its own.
 *
 * The recurring bug this module exists to prevent: a breakdown that sources its
 * lines from *different* tracks (e.g. subtotal from cash, total from card) — the
 * lines then don't sum to the total. Notably, the `effective_*` columns are NOT
 * a charged-lane resolver; they are a card alias (see `pricing-lane.ts`), so
 * binding subtotal/tax to `effective_*` while taking the total from `cash_total`
 * silently mixes tracks for cash orders.
 *
 * `getOrderBreakdown` resolves the lane the order was actually charged on and
 * returns each lane assembled *exclusively* from that lane's own columns, so any
 * single-track render is guaranteed to foot. Totals are read straight from the
 * stored lane-total column (never recomputed), so this is display-only and never
 * changes a stored value.
 */

/** Numeric-ish fields can arrive as number | string | null from Supabase. */
type Money = number | string | null | undefined;

/** Minimal order shape needed to build a breakdown (covers every surface). */
export interface BreakdownOrderInput {
  subtotal?: Money;
  tax_amount?: Money;
  total_amount?: Money;
  discount_amount?: Money;
  service_charge?: Money;
  tip_amount?: Money;
  card_subtotal?: Money;
  card_tax_amount?: Money;
  card_total?: Money;
  cash_subtotal?: Money;
  cash_tax_amount?: Money;
  cash_total?: Money;
  amount_paid?: Money;
  amount_due?: Money;
  payment_pricing_mode?: string | null;
}

/** One self-consistent pricing track. Lines foot to `total` (excluding tip). */
export interface LaneBreakdown {
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  tip: number;
  /** Stored lane total (card_total / cash_total). subtotal − discount + tax + serviceCharge. */
  total: number;
  amountPaid: number;
  amountDue: number;
}

export interface OrderBreakdown {
  /** The lane money was actually tendered on; null when nothing is paid yet. */
  charged: PricingLane | null;
  /** Lane to show for a single-track render. Pre-tender defaults to card/list. */
  display: "card" | "cash";
  /** True when the card and cash totals differ (cash discount is in play). */
  dual: boolean;
  /** True when the order was settled across both cash and card tenders. */
  isMixed: boolean;
  /**
   * For split-tender (mixed) cash-discount orders only: the discount that
   * bridges the card/list ladder down to what was actually collected, so a
   * single-total receipt foots to `amountPaid`. 0 for every other case (pure
   * cash / card lanes already bake the discount into their own total).
   */
  mixedCashDiscount: number;
  card: LaneBreakdown;
  cash: LaneBreakdown;
  /** Convenience alias for the `display` lane — the block a single-track UI renders. */
  primary: LaneBreakdown;
}

function num(v: Money): number {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

/** First defined/finite of the candidates, coerced to a number (else 0). */
function pick(...candidates: Money[]): number {
  for (const c of candidates) {
    if (c !== null && c !== undefined && c !== "") {
      const x = num(c);
      if (Number.isFinite(x)) return x;
    }
  }
  return 0;
}

function buildLane(
  lane: "card" | "cash",
  order: BreakdownOrderInput,
  shared: { discount: number; serviceCharge: number; tip: number; amountPaid: number; amountDue: number }
): LaneBreakdown {
  // Per-lane columns fall back to the bare columns, which mirror the card track.
  const subtotal =
    lane === "card"
      ? pick(order.card_subtotal, order.subtotal)
      : pick(order.cash_subtotal, order.subtotal);
  const tax =
    lane === "card"
      ? pick(order.card_tax_amount, order.tax_amount)
      : pick(order.cash_tax_amount, order.tax_amount);
  const total =
    lane === "card"
      ? pick(order.card_total, order.total_amount)
      : pick(order.cash_total, order.total_amount);
  return {
    subtotal,
    discount: shared.discount,
    serviceCharge: shared.serviceCharge,
    tax,
    tip: shared.tip,
    total,
    amountPaid: shared.amountPaid,
    amountDue: shared.amountDue,
  };
}

/**
 * Resolve an order's totals into two self-consistent pricing tracks plus the
 * lane to display. Every line in `primary` (or in either `card`/`cash` block)
 * comes from a single track and therefore foots.
 */
export function getOrderBreakdown(
  order: BreakdownOrderInput | null | undefined,
  payments: OrderPayment[] | undefined
): OrderBreakdown {
  const o = order ?? {};
  const shared = {
    discount: num(o.discount_amount),
    serviceCharge: num(o.service_charge),
    tip: num(o.tip_amount),
    amountPaid: num(o.amount_paid),
    amountDue: num(o.amount_due),
  };

  const card = buildLane("card", o, shared);
  const cash = buildLane("cash", o, shared);

  const charged = resolveChargedLane(o as { payment_pricing_mode?: PricingLane }, payments);
  // Single-track render shows the charged lane; cash only when actually cash.
  // Pre-tender / card / mixed all default to the card (list) track.
  const display: "card" | "cash" = charged === "cash" ? "cash" : "card";

  // Sub-cent tolerance so float noise never flips the dual flag.
  const dual = Math.abs(card.total - cash.total) > 0.005;

  const primary = display === "cash" ? cash : card;

  // Split tender: the bill is the card/list ladder, but only the discounted
  // blend was collected. Surface the difference (list incl. tip − amount paid)
  // as a cash-discount line so a single-total receipt foots to amountPaid.
  const isMixed = charged === "mixed";
  const mixedCashDiscount =
    isMixed && primary.amountPaid > 0
      ? Math.max(0, primary.total + primary.tip - primary.amountPaid)
      : 0;

  return {
    charged,
    display,
    dual,
    isMixed,
    mixedCashDiscount,
    card,
    cash,
    primary,
  };
}
