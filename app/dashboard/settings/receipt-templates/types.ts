export interface LocationIdentity {
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  phone: string | null;
}

import type { TemplateType } from "@/lib/receipts/template-type";

export type { TemplateType };

export interface ReceiptTemplate {
  id: string;
  merchant_id: string;
  location_id: string;
  template_type: TemplateType;
  template_name: string;

  // Branding
  show_logo: boolean;
  header_text: string | null;
  footer_text: string | null;

  // Content
  show_item_modifiers: boolean;
  show_tax_breakdown: boolean;
  show_tip_line: boolean;
  show_server_name: boolean;
  show_order_type: boolean;

  // Card payments (sale receipt only)
  print_signature_line: boolean;
  signature_line_disclaimer: string | null;

  // Extras
  show_barcode: boolean;
  show_qr_code: boolean;

  // Kitchen specific
  large_item_text: boolean;
  show_mods_large: boolean;
  group_by_station: boolean;
  show_allergy_alert: boolean;
  show_ready_by_time: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface ReceiptTemplateFormData {
  show_logo: boolean;
  header_text: string;
  footer_text: string;
  show_item_modifiers: boolean;
  show_tax_breakdown: boolean;
  show_tip_line: boolean;
  show_server_name: boolean;
  show_order_type: boolean;
  print_signature_line: boolean;
  signature_line_disclaimer: string;
  show_barcode: boolean;
  show_qr_code: boolean;
  large_item_text: boolean;
  show_mods_large: boolean;
  group_by_station: boolean;
  show_allergy_alert: boolean;
  show_ready_by_time: boolean;
}

export interface UpsertReceiptTemplateInput {
  location_id: string;
  template_type: TemplateType;
  show_logo?: boolean;
  header_text?: string | null;
  footer_text?: string | null;
  show_item_modifiers?: boolean;
  show_tax_breakdown?: boolean;
  show_tip_line?: boolean;
  show_server_name?: boolean;
  show_order_type?: boolean;
  print_signature_line?: boolean;
  signature_line_disclaimer?: string | null;
  show_barcode?: boolean;
  show_qr_code?: boolean;
  large_item_text?: boolean;
  show_mods_large?: boolean;
  group_by_station?: boolean;
  show_allergy_alert?: boolean;
  show_ready_by_time?: boolean;
}
