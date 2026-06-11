import { OrderStatus } from "@/types/order-management";

/**
 * Single source of truth for order `status` (fulfillment) presentation and grouping.
 *
 * The `order_status` enum has 9 values. Keep this file in sync with the enum so the
 * Status filter, KPI cards, and status badges can never drift to a partial subset.
 * NOTE: this is fulfillment `status`, not `payment_status` — do not conflate the two.
 */

/** Display order for the Status filter dropdown (`draft`/Open … Void). */
export const ORDER_STATUS_ORDER: OrderStatus[] = [
  "draft",
  "pending",
  "sent_to_kitchen",
  "preparing",
  "ready",
  "completed",
  "cancelled",
  "refunded",
  "void",
];

/** Human-readable labels for each order status. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Open",
  pending: "Pending",
  sent_to_kitchen: "Sent to Kitchen",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  void: "Void",
};

/**
 * Status groupings shared by the Overview KPI cards and any rollup logic.
 * The table filter stays granular (one chip per status); these groups are glance metrics.
 */
export const ORDER_STATUS_GROUPS = {
  open: ["draft", "pending", "sent_to_kitchen", "preparing", "ready"],
  completed: ["completed"],
  closed_out: ["cancelled", "refunded", "void"],
} as const satisfies Record<string, OrderStatus[]>;
