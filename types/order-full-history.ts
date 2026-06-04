/**
 * TICKET DM-011-01: Unified Order History Response Types
 * Types for the get_order_full_history() RPC function
 */

export interface OrderFullHistoryTimeline {
  timestamp: string;
  category: "status" | "item" | "payment" | "refund" | "discount" | "kitchen" | "session" | "chargeback" | "system";
  event_type: string;
  description: string; // Human-readable: "Item added: 1x Mocha Latte ($9.00)"
  actor_name: string | null; // "Sam K." or "System"
  actor_role: string | null; // "Server", "Manager", "System"
  details: Record<string, unknown> | null; // Extra context for expandable view
  severity: "info" | "success" | "warning" | "error"; // For color coding
}

export interface OrderFullHistoryItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  cash_price: number | null;
  category_name: string | null;
  course_number: number | null;
  is_voided: boolean;
  void_reason: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  special_instructions: string | null;
  kitchen_status: string | null;
  fire_time: string | null;
  completed_at: string | null;
  item_status: string;
  created_at: string;
  discount_name: string | null;
  discount_amount: number | null;
  modifiers: Array<{
    modified_group_name: string;
    modifier_name: string;
    price_modifier: number;
    quantity: number;
  }>;
  refund_info: Array<{
    quantity_refunded: number;
    total_refunded: number;
    refund_reason: string;
    refund_reason_detail: string | null;
    refunded_at: string;
  }> | null;
}

export interface OrderFullHistoryPayment {
  id: string;
  payment_method: string;
  amount: number;
  tip_amount: number;
  total_amount: number;
  status: string;
  card_type: string | null;
  card_last_four: string | null;
  auth_code: string | null;
  terminal_type: string | null;
  terminal_id: string | null;
  batch_number: string | null;
  psp_reference: string | null;
  captured_at: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
  created_at: string;
  processed_by_name: string | null;
  payment_items: Array<{
    item_name: string;
    quantity_paid: number;
    subtotal_paid: number;
    tax_paid: number;
  }> | null;
}

export interface OrderFullHistoryReversal {
  id: string;
  reversal_type: "void" | "refund" | "partial_refund" | "item_return";
  amount: number;
  status: string;
  reason_code: string;
  reason_description: string | null;
  completed_at: string | null;
  initiated_by_name: string | null;
  approved_by_name: string | null;
  reversal_reference_id: string;
  original_payment_method: string;
  original_card_last_four: string | null;
  refund_items: Array<{
    item_name: string;
    quantity_refunded: number;
    subtotal_refunded: number;
    tax_refunded: number;
    total_refunded: number;
    refund_reason: string;
    refund_reason_detail: string | null;
    return_to_inventory: boolean;
  }>;
}

export interface OrderFullHistoryDiscount {
  discount_name: string;
  discount_amount: number;
  applied_at: string;
  applied_by_name: string | null;
  voided: boolean;
  voided_at: string | null;
  target: "order" | "item";
  target_item_name: string | null;
}

export interface OrderFullHistoryChargeback {
  id: string;
  amount: number;
  reason_code: string;
  reason_description: string | null;
  status: string;
  received_at: string;
  defense_deadline: string | null;
  resolution: string | null;
  resolved_at: string | null;
}

export interface OrderFullHistoryHeader {
  id: string;
  display_number: string;
  status: string;
  order_type: string;
  order_channel: string;
  pricing_mode: string;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_by_staff_name: string | null;
  device_id: string | null;
  station_name: string | null;
  location_name: string;
  table_name: string | null;
  server_name: string | null;
  party_size: number | null;
  card_subtotal: number;
  cash_subtotal: number;
  cash_discount_amount: number;
  tax_amount: number;
  discount_amount: number;
  amount_paid: number;
  amount_due: number;
  effective_total: number;
  internal_notes: string | null;
}

export interface OrderFullHistory {
  order: OrderFullHistoryHeader;
  items: OrderFullHistoryItem[];
  payments: OrderFullHistoryPayment[];
  reversals: OrderFullHistoryReversal[];
  discounts: OrderFullHistoryDiscount[];
  chargebacks: OrderFullHistoryChargeback[];
  timeline: OrderFullHistoryTimeline[];
}
