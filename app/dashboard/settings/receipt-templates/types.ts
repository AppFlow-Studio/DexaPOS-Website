export type TemplateType =
  | "sale"
  | "kitchen"
  | "bar"
  | "void"
  | "refund"
  | "end_of_day"
  | "cash_drawer"
  | "online_order";

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

  // Extras
  show_barcode: boolean;
  show_qr_code: boolean;

  // Kitchen/Bar specific
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
  show_barcode?: boolean;
  show_qr_code?: boolean;
  large_item_text?: boolean;
  show_mods_large?: boolean;
  group_by_station?: boolean;
  show_allergy_alert?: boolean;
  show_ready_by_time?: boolean;
}
