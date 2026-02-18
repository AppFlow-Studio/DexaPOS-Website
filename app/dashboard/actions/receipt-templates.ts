"use server";

// ============================================================================
// Receipt Templates Server Actions
// Description: CRUD operations for location-specific receipt templates
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// Types
// ============================================================================

export type TemplateType =
  | "sale"
  | "kitchen"
  | "void_refund"
  | "no_sale"
  | "end_of_day"
  | "cash_drawer"
  | "online_order";

export interface ReceiptTemplate {
  id: string;
  merchant_id: string;
  location_id: string;
  template_type: TemplateType;
  template_name: string;
  show_logo: boolean;
  header_text: string | null;
  footer_text: string | null;
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
  created_at: string;
  updated_at: string;
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

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get all receipt templates for a specific location
 */
export async function getReceiptTemplates(locationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("receipt_templates")
      .select("*")
      .eq("location_id", locationId)
      .order("template_type", { ascending: true });

    if (error) {
      console.error("[getReceiptTemplates] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data as ReceiptTemplate[], error: null };
  } catch (error) {
    console.error("[getReceiptTemplates] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Get a single receipt template by location and type
 */
export async function getReceiptTemplate(
  locationId: string,
  templateType: TemplateType,
) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("receipt_templates")
      .select("*")
      .eq("location_id", locationId)
      .eq("template_type", templateType)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found (expected for new templates)
      console.error("[getReceiptTemplate] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return {
      success: true,
      data: (data as ReceiptTemplate) || null,
      error: null,
    };
  } catch (error) {
    console.error("[getReceiptTemplate] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// Defaults (mirrors client-side DEFAULT_TEMPLATE_VALUES)
// ============================================================================

const ALL_TEMPLATE_TYPES: TemplateType[] = [
  "sale",
  "kitchen",
  "void_refund",
  "no_sale",
  "end_of_day",
  "cash_drawer",
  "online_order",
];

const TEMPLATE_TYPE_NAMES: Record<TemplateType, string> = {
  sale: "Sale Receipt",
  kitchen: "Kitchen Ticket",
  void_refund: "Void / Refund",
  no_sale: "No Sale",
  end_of_day: "End of Day Report",
  cash_drawer: "Cash Drawer Report",
  online_order: "Online Order Ticket",
};

const DEFAULT_TEMPLATE_VALUES: Record<
  TemplateType,
  Omit<UpsertReceiptTemplateInput, "location_id" | "template_type">
> = {
  sale: {
    show_logo: true,
    header_text: "",
    footer_text: "Thank you for your purchase!",
    show_item_modifiers: true,
    show_tax_breakdown: true,
    show_tip_line: true,
    show_server_name: true,
    show_order_type: true,
    show_barcode: true,
    show_qr_code: false,
    large_item_text: false,
    show_mods_large: false,
    group_by_station: false,
    show_allergy_alert: false,
    show_ready_by_time: false,
  },
  kitchen: {
    show_logo: false,
    header_text: "",
    footer_text: "",
    show_item_modifiers: true,
    show_tax_breakdown: false,
    show_tip_line: false,
    show_server_name: true,
    show_order_type: true,
    show_barcode: false,
    show_qr_code: false,
    large_item_text: true,
    show_mods_large: true,
    group_by_station: true,
    show_allergy_alert: true,
    show_ready_by_time: true,
  },
  void_refund: {
    show_logo: true,
    header_text: "",
    footer_text: "",
    show_item_modifiers: true,
    show_tax_breakdown: true,
    show_tip_line: false,
    show_server_name: true,
    show_order_type: true,
    show_barcode: false,
    show_qr_code: false,
    large_item_text: false,
    show_mods_large: false,
    group_by_station: false,
    show_allergy_alert: false,
    show_ready_by_time: false,
  },
  no_sale: {
    show_logo: true,
    header_text: "",
    footer_text: "",
    show_item_modifiers: false,
    show_tax_breakdown: false,
    show_tip_line: false,
    show_server_name: true,
    show_order_type: false,
    show_barcode: false,
    show_qr_code: false,
    large_item_text: false,
    show_mods_large: false,
    group_by_station: false,
    show_allergy_alert: false,
    show_ready_by_time: false,
  },
  end_of_day: {
    show_logo: true,
    header_text: "",
    footer_text: "",
    show_item_modifiers: false,
    show_tax_breakdown: true,
    show_tip_line: false,
    show_server_name: false,
    show_order_type: false,
    show_barcode: false,
    show_qr_code: false,
    large_item_text: false,
    show_mods_large: false,
    group_by_station: false,
    show_allergy_alert: false,
    show_ready_by_time: false,
  },
  cash_drawer: {
    show_logo: true,
    header_text: "",
    footer_text: "",
    show_item_modifiers: false,
    show_tax_breakdown: false,
    show_tip_line: false,
    show_server_name: false,
    show_order_type: false,
    show_barcode: false,
    show_qr_code: false,
    large_item_text: false,
    show_mods_large: false,
    group_by_station: false,
    show_allergy_alert: false,
    show_ready_by_time: false,
  },
  online_order: {
    show_logo: true,
    header_text: "",
    footer_text: "Thank you for your order!",
    show_item_modifiers: true,
    show_tax_breakdown: true,
    show_tip_line: false,
    show_server_name: false,
    show_order_type: true,
    show_barcode: true,
    show_qr_code: true,
    large_item_text: false,
    show_mods_large: false,
    group_by_station: false,
    show_allergy_alert: false,
    show_ready_by_time: true,
  },
};

// ============================================================================
// INITIALIZE ALL DEFAULTS
// ============================================================================

/**
 * Initialize all 8 default receipt templates for a location in one call
 */
export async function initializeDefaultTemplates(
  clerkOrgId: string,
  locationId: string,
) {
  try {
    const supabase = createServerSupabaseClient();

    // Get merchant ID from clerk org
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      console.error(
        "[initializeDefaultTemplates] Error getting merchant:",
        merchantError,
      );
      return { success: false, error: "Merchant not found", data: null };
    }

    const now = new Date().toISOString();

    const rows = ALL_TEMPLATE_TYPES.map((templateType) => {
      const defaults = DEFAULT_TEMPLATE_VALUES[templateType];
      return {
        merchant_id: merchant.id,
        location_id: locationId,
        template_type: templateType,
        template_name: TEMPLATE_TYPE_NAMES[templateType],
        show_logo: defaults.show_logo ?? true,
        header_text: defaults.header_text ?? null,
        footer_text: defaults.footer_text ?? null,
        show_item_modifiers: defaults.show_item_modifiers ?? true,
        show_tax_breakdown: defaults.show_tax_breakdown ?? true,
        show_tip_line: defaults.show_tip_line ?? false,
        show_server_name: defaults.show_server_name ?? true,
        show_order_type: defaults.show_order_type ?? true,
        show_barcode: defaults.show_barcode ?? false,
        show_qr_code: defaults.show_qr_code ?? false,
        large_item_text: defaults.large_item_text ?? false,
        show_mods_large: defaults.show_mods_large ?? false,
        group_by_station: defaults.group_by_station ?? false,
        show_allergy_alert: defaults.show_allergy_alert ?? false,
        show_ready_by_time: defaults.show_ready_by_time ?? false,
        updated_at: now,
      };
    });

    const { data, error } = await supabase
      .from("receipt_templates")
      .upsert(rows, {
        onConflict: "merchant_id,location_id,template_type",
      })
      .select();

    if (error) {
      console.error("[initializeDefaultTemplates] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Log audit event
    await LogAuditEvent({
      merchantId: merchant.id,
      action: "Initialized default receipt templates",
      actionCategory: "settings",
      resourceType: "receipt_template",
      resourceId: locationId,
      resourceName: "all_defaults",
      locationId: locationId,
      metadata: {
        template_count: ALL_TEMPLATE_TYPES.length,
      },
    });

    return { success: true, data: data as ReceiptTemplate[], error: null };
  } catch (error) {
    console.error("[initializeDefaultTemplates] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// UPSERT Operations
// ============================================================================

/**
 * Create or update a receipt template
 * Uses (merchant_id, location_id, template_type) unique constraint
 */
export async function upsertReceiptTemplate(
  clerkOrgId: string,
  input: UpsertReceiptTemplateInput,
) {
  try {
    const supabase = createServerSupabaseClient();

    // Get merchant ID from clerk org
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      console.error(
        "[upsertReceiptTemplate] Error getting merchant:",
        merchantError,
      );
      return { success: false, error: "Merchant not found", data: null };
    }

    const now = new Date().toISOString();

    const upsertData = {
      merchant_id: merchant.id,
      location_id: input.location_id,
      template_type: input.template_type,
      template_name: TEMPLATE_TYPE_NAMES[input.template_type],
      show_logo: input.show_logo ?? true,
      header_text: input.header_text ?? null,
      footer_text: input.footer_text ?? null,
      show_item_modifiers: input.show_item_modifiers ?? true,
      show_tax_breakdown: input.show_tax_breakdown ?? true,
      show_tip_line: input.show_tip_line ?? false,
      show_server_name: input.show_server_name ?? true,
      show_order_type: input.show_order_type ?? true,
      show_barcode: input.show_barcode ?? false,
      show_qr_code: input.show_qr_code ?? false,
      large_item_text: input.large_item_text ?? false,
      show_mods_large: input.show_mods_large ?? false,
      group_by_station: input.group_by_station ?? false,
      show_allergy_alert: input.show_allergy_alert ?? false,
      show_ready_by_time: input.show_ready_by_time ?? false,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from("receipt_templates")
      .upsert(upsertData, {
        onConflict: "merchant_id,location_id,template_type",
      })
      .select()
      .single();

    if (error) {
      console.error("[upsertReceiptTemplate] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Fetch location name for audit log
    const { data: location } = await supabase
      .from("locations")
      .select("name")
      .eq("id", input.location_id)
      .single();

    // Log audit event
    await LogAuditEvent({
      merchantId: merchant.id,
      action: `Updated Receipt Template: ${input.template_type}`,
      actionCategory: "settings",
      resourceType: "receipt_template",
      resourceId: data.id,
      resourceName: input.template_type,
      locationId: input.location_id,
      metadata: {
        location_name: location?.name,
        template_type: input.template_type,
      },
    });

    return { success: true, data: data as ReceiptTemplate, error: null };
  } catch (error) {
    console.error("[upsertReceiptTemplate] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}
