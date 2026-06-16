// Shared receipt data contract.
//
// This is the single TypeScript type that every web-rendered receipt surface
// normalizes its inputs to:
//   - dashboard receipt modal  (components/dashboard/orders/ReceiptModal.tsx)
//   - guest SMS receipt page    (app/receipts/[t1]/[t2]/page.tsx, via get_public_receipt RPC)
//   - upcoming email receipt    (Ali Awdi's transport job — consumes this contract as-is)
//
// Surfaces keep their own visual layout/JSX, but header resolution, phone
// formatting, and store-local date formatting all flow through lib/receipts/*
// driven by this contract, so header/dates/totals stay identical across SMS
// page, email, and dashboard view.
//
// The field set mirrors the get_public_receipt() jsonb shape (the most
// complete source). `header` is the resolved single header block (see
// lib/receipts/header.ts) and `location.timezone` drives date formatting.

import type { OrderStatus, PaymentStatus } from "@/types/order-management";
import { resolveReceiptHeader, type ResolvedReceiptHeader } from "./header";

export interface ReceiptContractOrder {
  display_number: string | null;
  order_number: string | null;
  /** Order placement timestamp (DB `created_at`). Source of all receipt dates. */
  created_at: string | null;
  status: OrderStatus | string | null;
  payment_status: PaymentStatus | string | null;
  voided_at: string | null;
  void_reason: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  tip_amount: number | null;
  discount_amount: number | null;
  service_charge: number | null;
  total_amount: number | null;
  effective_subtotal: number | null;
  effective_tax_amount: number | null;
  effective_total: number | null;
  payment_pricing_mode: string | null;
  // Dual-pricing lane columns + collected amounts. Feed getOrderBreakdown so a
  // single-lane total foots on dual / mixed-tender orders (matches dashboard).
  order_type?: string | null;
  cash_total: number | null;
  card_total: number | null;
  cash_subtotal?: number | null;
  card_subtotal?: number | null;
  cash_tax_amount?: number | null;
  card_tax_amount?: number | null;
  amount_paid?: number | null;
  amount_due?: number | null;
}

export interface ReceiptContractLocation {
  name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  /** IANA timezone (locations.timezone). Drives store-local date formatting. */
  timezone: string | null;
}

export interface ReceiptContractModifier {
  id?: string | null;
  modifier_group_name: string | null;
  modifier_name: string | null;
  price_modifier: number | null;
  quantity: number | null;
  is_no: boolean | null;
}

export interface ReceiptContractItem {
  id: string;
  item_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  subtotal: number | null;
  is_voided: boolean | null;
  // Per-item detail for dashboard-parity rendering.
  discount_amount?: number | null;
  discount_name?: string | null;
  selected_size_name?: string | null;
  special_instructions?: string | null;
  seat_number?: number | null;
  course_number?: number | null;
  modifiers: ReceiptContractModifier[];
}

export interface ReceiptContractPayment {
  payment_method: string | null;
  amount: number | null;
  tip_amount: number | null;
  total_amount: number | null;
  status: string | null;
  /** True when this tender was charged on the cash (discounted) lane. */
  is_cash_priced?: boolean | null;
  card_type: string | null;
  card_last_four: string | null;
  terminal_type: string | null;
  authorization_code: string | null;
  refunded_amount: number | null;
  refunded_at: string | null;
}

export interface ReceiptData {
  order: ReceiptContractOrder;
  location: ReceiptContractLocation;
  /** Resolved single header block (template header_text → else location record). */
  header: ResolvedReceiptHeader;
  /** Template footer_text (receipt_templates), shared by every surface. */
  footerText: string | null;
  logo_url: string | null;
  items: ReceiptContractItem[];
  payments: ReceiptContractPayment[];
}

/**
 * Raw shape returned by the `get_public_receipt()` RPC. It carries the
 * unresolved header inputs (`template_header` + the location record); call
 * `toReceiptData()` to normalize it into the shared {@link ReceiptData}
 * contract that the renderers consume.
 */
export interface RawPublicReceipt {
  order: ReceiptContractOrder;
  location: ReceiptContractLocation;
  /** Active sale receipt_templates.header_text — header precedence source. */
  template_header: string | null;
  template_footer: string | null;
  logo_url: string | null;
  items: ReceiptContractItem[];
  payments: ReceiptContractPayment[];
}

/**
 * Normalize a raw `get_public_receipt()` response into the shared
 * {@link ReceiptData} contract, resolving the single header block via the
 * documented precedence (active template header_text → else location record).
 */
export function toReceiptData(raw: RawPublicReceipt): ReceiptData {
  return {
    order: raw.order,
    location: raw.location,
    header: resolveReceiptHeader(raw.location, raw.template_header),
    footerText: raw.template_footer?.trim() || null,
    logo_url: raw.logo_url,
    items: raw.items,
    payments: raw.payments,
  };
}
