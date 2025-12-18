// types/database.types.ts
export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'void';

export type OrderType =
  | 'dine_in'
  | 'takeout'
  | 'delivery'
  | 'online'
  | 'catering';

export type PaymentMethod =
  | 'cash'
  | 'card_spinapi'
  | 'card_dvpaylite'
  | 'card_manual'
  | 'gift_card'
  | 'house_account'
  | 'external';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'declined'
  | 'refunded'
  | 'partially_refunded'
  | 'void';

export type TerminalType =
  | 'dejavoo_spinapi'
  | 'dejavoo_p18'
  | 'manual'
  | 'none';

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
  special_instructions?: string;
  created_at: string;
  updated_at: string;
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
} 