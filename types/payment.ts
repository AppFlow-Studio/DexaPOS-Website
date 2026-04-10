import {
  PaymentMethod,
  PaymentStatus,
  TerminalType,
} from "./order-management";

// ============================================================================
// Payment Record — Full order_payments DB schema
// ============================================================================

export interface PaymentRecord {
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
  reference_number?: string;
  card_type?: string;
  card_last_four?: string;
  card_entry_mode?: string;
  dejavoo_response_code?: string;
  batch_number?: string;
  dejavoo_batch_number?: string;
  is_settled?: boolean;
  invoice_number?: string;
  processor_response?: Record<string, any>;
  emv_data?: EmvData | null;
  device_id?: string;
  // Split payment
  is_split_payment?: boolean;
  split_sequence?: number;
  // Refund/void/return
  refunded_amount?: number;
  voided_at?: string;
  // Settlement
  settled_at?: string;
  settlement_batch_id?: string;
  // Timestamps
  initiated_at: string;
  captured_at?: string;
  created_at?: string;
  updated_at?: string;
  // Joined relations
  orders?: {
    order_number: string;
    display_number: string;
    location_id: string;
    status: string;
    order_type: string;
    customer_name?: string;
    created_at: string;
    merchant_id: string;
  };
  order_payment_items?: PaymentItemRecord[];
  reversals?: PaymentReversalRecord[];
}

// ============================================================================
// Payment Item Record — order_payment_items table
// ============================================================================

export interface PaymentItemRecord {
  id: string;
  order_payment_id: string;
  order_item_id: string;
  quantity_paid: number;
  unit_price_paid: number;
  subtotal_paid: number;
  tax_paid: number;
  created_at: string;
  order_items?: {
    id: string;
    item_name: string;
    quantity: number;
  };
}

// ============================================================================
// Payment Reversal Record — payment_reversals table
// ============================================================================

export interface PaymentReversalRecord {
  id: string;
  order_payment_id: string;
  reversal_type: "refund" | "void" | "chargeback";
  amount: number;
  reason?: string;
  status: string;
  processed_at?: string;
  created_at: string;
  order_refund_items?: RefundItemRecord[];
}

// ============================================================================
// Refund Item Record — order_refund_items table
// ============================================================================

export interface RefundItemRecord {
  id: string;
  reversal_id: string;
  order_item_id: string;
  item_name: string;
  quantity_refunded: number;
  amount: number;
  created_at: string;
}

// ============================================================================
// EMV Data
// ============================================================================

export interface EmvData {
  aid?: string;
  applicationName?: string;
  arc?: string;
  iad?: string;
  tsi?: string;
  tvr?: string;
}

// ============================================================================
// Payment Filters
// ============================================================================

export interface PaymentFilters {
  dateRange?: {
    from: Date | null;
    to: Date | null;
  };
  paymentMethod?: PaymentMethod[];
  status?: PaymentStatus[];
  cardType?: string[];
  amountRange?: {
    min?: number;
    max?: number;
  };
  searchQuery?: string;
}

// ============================================================================
// Payment Summary — Aggregated stats
// ============================================================================

// ============================================================================
// Settlement Batch — settlement_batches table
// ============================================================================

export type BatchStatus = "open" | "closed" | "submitted" | "settled" | "funded";

export interface SettlementBatchRecord {
  id: string;
  batch_id: string;
  merchant_id: string;
  location_id: string;
  terminal_id?: string;
  business_date: string;
  opened_at: string;
  closed_at?: string;
  settlement_date?: string;
  funded_date?: string;
  transaction_count: number;
  sales_count: number;
  refund_count: number;
  void_count: number;
  gross_amount: number;
  tip_amount: number;
  refund_amount: number;
  interchange_fees: number;
  assessment_fees: number;
  processor_fees: number;
  net_deposit: number;
  status: BatchStatus;
  raw_response?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Computed Batch — Grouping payments by batch_number when settlement_batches is empty
// ============================================================================

export interface ComputedBatch {
  batch_number: string;
  sales_count: number;
  refund_count: number;
  void_count: number;
  gross_amount: number;
  tip_amount: number;
  refund_amount: number;
  net_amount: number;
  earliest_payment: string;
  latest_payment: string;
  payments: PaymentRecord[];
}

// ============================================================================
// Batch Filters
// ============================================================================

export interface BatchFilters {
  dateRange?: {
    from: Date | null;
    to: Date | null;
  };
  status?: BatchStatus[];
}

// ============================================================================
// Payment Summary — Aggregated stats
// ============================================================================

export interface PaymentSummary {
  totalCount: number;
  totalAmount: number;
  totalTips: number;
  totalRefunded: number;
  refundCount: number;
  byMethod: { method: PaymentMethod; count: number; amount: number }[];
  byCardType: { cardType: string; count: number; amount: number }[];
  byStatus: { status: PaymentStatus; count: number; amount: number }[];
  dailyVolume: { date: string; count: number; amount: number }[];
  byEntryMode: { entryMode: string; count: number; amount: number }[];
}
