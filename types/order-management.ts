// types/database.types.ts
export type OrderStatus =
  | "draft"
  | "pending"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled"
  | "refunded"
  | "void";

export type OrderType =
  | "dine_in"
  | "takeout"
  | "delivery"
  | "online"
  | "catering";

export type PaymentMethod =
  | "cash"
  | "card_spinapi"
  | "card_dvpaylite"
  | "card_manual"
  | "gift_card"
  | "house_account"
  | "external";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "authorized"
  | "captured"
  | "failed"
  | "declined"
  | "refunded"
  | "partially_refunded"
  | "void"
  | "paid";

export type TerminalType =
  | "dejavoo_spinapi"
  | "dejavoo_p18"
  | "manual"
  | "none";

export interface Order {
  id: string;
  order_number: string;
  display_number: string;
  merchant_id: string;
  location_id: string;
  order_type: OrderType;
  status: OrderStatus;
  customer_name?: string;
  customer_phone?: string;
  table_number?: string;
  subtotal: number;
  tax_amount: number;
  tip_amount: number;
  discount_amount: number;
  service_charge: number;
  total_amount: number;
  payment_status: PaymentStatus;
  amount_paid: number;
  amount_due: number;
  special_instructions?: string;
  created_at: string;
  updated_at: string;
  sent_to_kitchen_at?: string;
  completed_at?: string;
  sync_version: number;
  created_by_staff_id?: string;
  // Cash/Card Dual Pricing
  card_subtotal?: number;
  card_tax_amount?: number;
  card_total?: number;
  cash_subtotal?: number;
  cash_tax_amount?: number;
  cash_total?: number;
  payment_pricing_mode?: "card" | "cash" | "mixed";
  cash_discount_applied?: boolean;
  cash_discount_amount?: number;
}

export interface OrderFilters {
  dateRange?: {
    from: Date | null;
    to: Date | null;
  };
  status?: OrderStatus[];
  orderType?: OrderType[];
  paymentMethod?: PaymentMethod[];
  staffId?: string;
  amountRange?: {
    min?: number;
    max?: number;
  };
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id?: string;
  location_exclusive_item_id?: string;
  item_name: string;
  item_description?: string;
  category_name?: string;
  quantity: number;
  unit_price: number;
  cash_price?: number;
  price_paid: number;
  subtotal: number;
  selected_size_id?: string;
  selected_size_name?: string;
  size_price_modifier: number;
  item_status: string;
  is_voided: boolean;
  void_reason?: string;
  voided_at?: string;
  voided_by?: string;
  special_instructions?: string;
  created_at: string;
  updated_at: string;
  // Discount fields
  discount_id?: string;
  discount_name?: string;
  discount_type?: "fixed_amount" | "percentage";
  discount_value?: number;
  discount_amount?: number;
  discount_source?: "preset" | "manual" | "promo" | "cash_pricing";
  discount_reason?: string;
  discount_applied_by?: string;
  discount_approved_by?: string;
  pre_discount_subtotal?: number;
}

export interface OrderItemModifier {
  id: string;
  order_item_id: string;
  modifier_group_id?: string;
  modifier_item_id?: string;
  modifier_group_name: string;
  modifier_name: string;
  price_modifier: number;
  quantity: number;
  total_price: number;
}

export interface OrderPaymentItem {
  id: string;
  order_payment_id: string;
  order_item_id: string;
  quantity_paid: number;
  unit_price_paid: number;
  subtotal_paid: number;
  tax_paid: number;
  created_at: string;
  // Joined data for display
  order_items?: {
    id: string;
    item_name: string;
    quantity: number;
  };
}

export interface OrderPayment {
  id: string;
  order_id: string;
  payment_method: PaymentMethod;
  amount: number;
  tip_amount: number;
  total_amount: number;
  status: PaymentStatus;
  terminal_type: TerminalType;
  terminal_id?: string;
  transaction_id?: string;
  authorization_code?: string;
  card_type?: string;
  card_last_four?: string;
  initiated_at: string;
  captured_at?: string;
  // Junction table items
  order_payment_items?: OrderPaymentItem[];
}

export interface CreateOrderParams {
  p_merchant_id: string;
  p_location_id: string;
  p_order_type?: OrderType;
  p_table_number?: string;
  p_customer_name?: string;
  p_customer_phone?: string;
  p_special_instructions?: string;
  p_device_id?: string;
  p_created_by_staff_id?: string;
}

export interface AddOrderItemParams {
  p_order_id: string;
  p_menu_item_id?: string;
  p_location_exclusive_item_id?: string;
  p_quantity?: number;
  p_selected_size_id?: string;
  p_special_instructions?: string;
  p_modifiers?: Array<{
    modifier_group_id: string;
    modifier_item_id: string;
    modifier_group_name: string;
    modifier_name: string;
    price_modifier: number;
    quantity?: number;
  }>;
}

export interface ProcessPaymentParams {
  p_order_id: string;
  p_payment_method: PaymentMethod;
  p_amount: number;
  p_tip_amount?: number;
  p_terminal_type?: TerminalType;
  p_terminal_id?: string;
  p_device_id?: string;
  p_transaction_details?: Record<string, any>;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  from_status: OrderStatus;
  to_status: OrderStatus;
  changed_by_staff_id?: string;
  changed_by_user_id?: string;
  changed_at: string;
  device_id?: string;
  reason?: string;
  staff_profiles?: {
    first_name: string;
    last_name: string;
  };
  users?: {
    first_name: string;
    last_name: string;
  };
  notes?: string;
  metadata?: Record<string, any>;
}

export interface OrderResponse {
  id: string;
  order_number: string;
  display_number: string;
  merchant_id: string;
  location_id: string;
  order_type: OrderType;
  status: OrderStatus;
  customer_name?: string;
  customer_phone?: string;
  table_number?: string;
  subtotal: number;
  tax_amount: number;
  tip_amount: number;
  discount_amount: number;
  service_charge: number;
  total_amount: number;
  payment_status: PaymentStatus;
  amount_paid: number;
  amount_due: number;
  special_instructions?: string;
  created_at: string;
  updated_at: string;
  sent_to_kitchen_at?: string;
  completed_at?: string;
  sync_version: number;
  order_items: OrderItem[];
  order_payments: OrderPayment[];
  order_status_history: OrderStatusHistory[];
  table_sessions: TableSessionWithEvents[];
  // Cash/Card Dual Pricing
  card_subtotal?: number;
  card_tax_amount?: number;
  card_total?: number;
  cash_subtotal?: number;
  cash_tax_amount?: number;
  cash_total?: number;
  payment_pricing_mode?: "card" | "cash" | "mixed";
  cash_discount_applied?: boolean;
  cash_discount_amount?: number;
}

export interface TableSessionWithEvents {
  id: string;
  order_id: string;
  session_id: string;
  session_type: string;
  session_status: string;
  session_start_time: string;
  session_end_time: string;
  table_session_events: TableSessionEvent[];
}

export interface TableSessionEvent {
  id: string;
  session_id: string;
  event_type: string;
  event_data: Record<string, any>;
  notes: string;
  triggered_by_staff_id?: string;
  triggered_by_user_id?: string;
  triggered_by_system?: boolean;
  occurred_at: string;
  minutes_since_previous: number;
  staff_profiles?: StaffProfile;
}

export interface StaffProfile {
  first_name: string;
  last_name: string;
}
