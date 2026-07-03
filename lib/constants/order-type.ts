import { OrderType } from "@/types/order-management";

/**
 * Single source of truth for order `order_type` presentation.
 *
 * The live `order_type` enum has 6 values. The generated `database.types.ts` is
 * stale and omits `qr_dine_in`, so this map is keyed off the hand-maintained
 * `OrderType` union (which is complete) — never off the generated type.
 *
 * Reuse `ORDER_TYPE_LABELS` / `orderTypeLabel()` everywhere an order type is shown
 * (filters, order list, detail sheet, receipts) so the labels can never drift.
 */

/** Display order for the Type filter dropdown. */
export const ORDER_TYPE_ORDER: OrderType[] = [
  "dine_in",
  "qr_dine_in",
  "takeout",
  "delivery",
  "online",
  "catering",
];

/** Canonical human-readable label for each order type. */
export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  dine_in: "Dine In",
  qr_dine_in: "QR Dine-In",
  takeout: "Takeout",
  delivery: "Delivery",
  online: "Online",
  catering: "Catering",
};

/**
 * Resolve an order type to its display label, with a safe fallback for any value
 * not yet in the map (e.g. a new enum value before this file is updated).
 */
export function orderTypeLabel(type: string | null | undefined): string {
  if (!type) return "";
  return ORDER_TYPE_LABELS[type as OrderType] ?? type.replace(/_/g, " ");
}
