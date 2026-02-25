import type { OrderStatus, OrderType, PaymentMethod, PaymentStatus } from "./order-management";

export type TimelineCategory =
  | "status"
  | "item"
  | "payment"
  | "refund"
  | "discount"
  | "kitchen"
  | "session"
  | "chargeback"
  | "system";

export type TimelineSeverity = "info" | "success" | "warning" | "error";

export interface OrderFullHistoryTimelineEvent {
  timestamp: string;
  category: TimelineCategory;
  event_type: string;
  description: string;
  actor_name: string | null;
  actor_role: string | null;
  details: Record<string, unknown> | null;
  severity: TimelineSeverity;
}

export interface OrderFullHistory {
  order: {
    id: string;
    display_number: string | null;
    order_number: string;
    status: OrderStatus;
    order_type: OrderType;
    pricing_mode: string | null;
    created_at: string;
    completed_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    created_by_staff_name: string | null;
    created_by_user_name: string | null;
    device_id: string | null;
    station_name: string | null;
    location_name: string | null;
    table_session_id: string | null;
    table_name: string | null;
    server_name: string | null;
    party_size: number | null;
    customer_name: string | null;
    customer_phone: string | null;
    card_subtotal: number | null;
    cash_subtotal: number | null;
    cash_discount_amount: number | null;
    tax_amount: number;
    discount_amount: number;
    amount_paid: number;
    amount_due: number;
    effective_total: number | null;
    internal_notes: string | null;
  };

  items: Array<{
    id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    cash_unit_price: number | null;
    category_name: string | null;
    course_number: number | null;
    is_voided: boolean;
    void_reason: string | null;
    voided_at: string | null;
    voided_by_name: string | null;
    is_open_item: boolean;
    is_tax_exempt: boolean;
    special_instructions: string | null;
    kitchen_status: string | null;
    kitchen_notes: string | null;
    fire_time: string | null;
    preparing_at: string | null;
    ready_at: string | null;
    completed_at: string | null;
    item_status: string;
    created_at: string;
    discount_name: string | null;
    discount_amount: number | null;
    discount_type: string | null;
    modifiers: Array<{
      modifier_group_name: string;
      modifier_name: string;
      price_modifier: number;
      quantity: number;
    }>;
  }>;

  payments: Array<{
    id: string;
    payment_method: PaymentMethod;
    amount: number;
    tip_amount: number;
    total_amount: number;
    status: PaymentStatus;
    card_type: string | null;
    card_last_four: string | null;
    auth_code: string | null;
    authorization_code: string | null;
    terminal_type: string | null;
    terminal_id: string | null;
    batch_number: string | null;
    dejavoo_batch_number: string | null;
    dejavoo_invoice_number: string | null;
    psp_reference: string | null;
    transaction_id: string | null;
    captured_at: string | null;
    authorized_at: string | null;
    approved_at: string | null;
    created_at: string;
    processed_by_name: string | null;
    amount_tendered: number | null;
    change_given: number | null;
    voided_at: string | null;
    voided_by_name: string | null;
    void_reason: string | null;
    tip_adjusted_at: string | null;
    original_tip_amount: number | null;
    covers_items: string[] | null;
    payment_items: Array<{
      item_name: string;
      quantity_paid: number;
      subtotal_paid: number;
      tax_paid: number | null;
    }> | null;
    events: Array<{
      event_type: string;
      timestamp: string;
      previous_status: string | null;
      new_status: string | null;
      amount: number | null;
      tip_amount?: number | null;
      auth_code: string | null;
      result_code: string | null;
      response_message: string | null;
      reason: string | null;
      terminal_id: string | null;
      staff_name: string | null;
    }>;
  }>;

  reversals: Array<{
    id: string;
    reversal_type: string;
    amount: number;
    status: string;
    reason_code: string | null;
    reason_description: string | null;
    requested_at: string;
    completed_at: string | null;
    initiated_by_name: string | null;
    approved_by_name: string | null;
    reversal_reference_id: string;
    original_payment_method: string;
    original_card_last_four: string | null;
    result_code: string | null;
    response_message: string | null;
    refund_items: Array<{
      order_item_id: string;
      item_name: string;
      quantity_refunded: number;
      amount: number;
      tax_refunded: number | null;
      reason: string | null;
      returned_to_inventory: boolean;
    }>;
  }>;

  discounts: Array<{
    discount_name: string;
    discount_amount: number;
    applied_at: string;
    applied_by_name: string | null;
    voided: boolean;
    voided_at: string | null;
    target: "order" | "item";
    target_item_name: string | null;
  }>;

  chargebacks: Array<{
    id: string;
    amount: number;
    reason_code: string;
    reason_description: string | null;
    status: string;
    received_at: string;
    defense_deadline: string | null;
    resolution: string | null;
    resolved_at: string | null;
  }>;

  timeline: OrderFullHistoryTimelineEvent[];
}

