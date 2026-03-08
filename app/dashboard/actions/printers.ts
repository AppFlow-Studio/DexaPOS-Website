"use server";

// ============================================================================
// Printers Server Actions
// Description: CRUD operations for the dedicated printers table
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// Types
// ============================================================================

export interface Printer {
  id: string;
  station_id: string | null;
  merchant_id: string;
  location_id: string;

  // Identity
  printer_name: string;
  printer_type: string;
  printer_model: string | null;
  printer_role: string;
  serial_number: string | null;

  // Connection
  connection_type: string;
  network_address: string | null; // inet type in PG, handled as string
  network_port: number | null;
  bluetooth_address: string | null;
  usb_device_path: string | null;

  // Role flags
  is_default_receipt: boolean | null;
  is_default_kitchen: boolean | null;
  print_order_tickets: boolean | null;

  // Config
  paper_width: number;
  max_chars_per_line: number | null;
  print_density: number | null;
  supports_auto_cut: boolean | null;
  supports_barcode: boolean | null;
  supports_qr_code: boolean | null;
  supports_logo: boolean | null;
  supports_cash_drawer_kick: boolean | null;

  // Receipt
  receipt_header: string | null;
  receipt_footer: string | null;
  auto_print_receipt: boolean | null;
  print_logo: boolean | null;
  copies: number | null;

  // Status
  is_active: boolean | null;
  is_connected: boolean | null;
  last_status: string | null;
  last_status_at: string | null;
  last_print_at: string | null;
  error_count: number | null;
  metadata: unknown;

  // Timestamps
  created_at: string | null;
  updated_at: string | null;
}

export interface CreatePrinterInput {
  station_id: string;
  printer_name: string;
  printer_type: string;
  printer_role?: string;
  printer_model?: string | null;
  serial_number?: string | null;

  connection_type: string;
  network_address?: string | null;
  network_port?: number | null;
  bluetooth_address?: string | null;
  usb_device_path?: string | null;

  is_default_receipt?: boolean;
  is_default_kitchen?: boolean;
  print_order_tickets?: boolean;

  paper_width?: number;
  max_chars_per_line?: number | null;
  print_density?: number | null;
  supports_auto_cut?: boolean;
  supports_barcode?: boolean;
  supports_qr_code?: boolean;
  supports_logo?: boolean;
  supports_cash_drawer_kick?: boolean;

  receipt_header?: string | null;
  receipt_footer?: string | null;
  auto_print_receipt?: boolean;
  print_logo?: boolean;
  copies?: number | null;
}

export interface UpdatePrinterInput {
  printer_name?: string;
  printer_type?: string;
  printer_role?: string;
  printer_model?: string | null;
  serial_number?: string | null;

  connection_type?: string;
  network_address?: string | null;
  network_port?: number | null;
  bluetooth_address?: string | null;
  usb_device_path?: string | null;

  is_default_receipt?: boolean;
  is_default_kitchen?: boolean;
  print_order_tickets?: boolean;

  paper_width?: number;
  max_chars_per_line?: number | null;
  print_density?: number | null;
  supports_auto_cut?: boolean;
  supports_barcode?: boolean;
  supports_qr_code?: boolean;
  supports_logo?: boolean;
  supports_cash_drawer_kick?: boolean;

  receipt_header?: string | null;
  receipt_footer?: string | null;
  auto_print_receipt?: boolean;
  print_logo?: boolean;
  copies?: number | null;

  is_active?: boolean;
}

// ============================================================================
// READ Operations
// ============================================================================

export async function getPrintersForStation(stationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("printers")
      .select("*")
      .eq("station_id", stationId)
      .order("printer_role")
      .order("printer_name");

    if (error) {
      console.error("[getPrintersForStation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data as Printer[], error: null };
  } catch (error) {
    console.error("[getPrintersForStation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

export async function getPrinterById(printerId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("printers")
      .select("*")
      .eq("id", printerId)
      .single();

    if (error) {
      console.error("[getPrinterById] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data as Printer, error: null };
  } catch (error) {
    console.error("[getPrinterById] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// CREATE Operations
// ============================================================================

export async function createPrinter(input: CreatePrinterInput) {
  try {
    const supabase = createServerSupabaseClient();

    // Get station to resolve merchant_id and location_id
    const { data: station, error: stationError } = await supabase
      .from("stations")
      .select("merchant_id, location_id, station_name")
      .eq("id", input.station_id)
      .single();

    if (stationError || !station) {
      console.error("[createPrinter] Error getting station:", stationError);
      return { success: false, error: "Station not found", data: null };
    }

    const { data: location } = await supabase
      .from("locations")
      .select("name")
      .eq("id", station.location_id)
      .single();

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("printers")
      .insert({
        station_id: input.station_id,
        merchant_id: station.merchant_id,
        location_id: station.location_id,
        printer_name: input.printer_name,
        printer_type: input.printer_type,
        printer_role: input.printer_role || "receipt",
        printer_model: input.printer_model || null,
        serial_number: input.serial_number || null,
        connection_type: input.connection_type,
        network_address: input.network_address || null,
        network_port: input.network_port || null,
        bluetooth_address: input.bluetooth_address || null,
        usb_device_path: input.usb_device_path || null,
        is_default_receipt: input.is_default_receipt ?? false,
        is_default_kitchen: input.is_default_kitchen ?? false,
        print_order_tickets: input.print_order_tickets ?? false,
        paper_width: input.paper_width ?? 80,
        max_chars_per_line: input.max_chars_per_line ?? null,
        print_density: input.print_density ?? null,
        supports_auto_cut: input.supports_auto_cut ?? true,
        supports_barcode: input.supports_barcode ?? false,
        supports_qr_code: input.supports_qr_code ?? false,
        supports_logo: input.supports_logo ?? false,
        supports_cash_drawer_kick: input.supports_cash_drawer_kick ?? false,
        receipt_header: input.receipt_header || null,
        receipt_footer: input.receipt_footer || null,
        auto_print_receipt: input.auto_print_receipt ?? true,
        print_logo: input.print_logo ?? false,
        copies: input.copies ?? 1,
        is_active: true,
        is_connected: false,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      console.error("[createPrinter] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    await LogAuditEvent({
      merchantId: station.merchant_id,
      action: `Added Printer: ${input.printer_name} (${input.printer_role || "receipt"}) to Station: ${station.station_name}`,
      actionCategory: "settings",
      resourceType: "printer",
      resourceId: data.id,
      resourceName: input.printer_name,
      locationId: station.location_id,
      metadata: {
        station_id: input.station_id,
        station_name: station.station_name,
        location_name: location?.name,
        printer_type: input.printer_type,
        printer_role: input.printer_role,
        connection_type: input.connection_type,
      },
    });

    return { success: true, data: data as Printer, error: null };
  } catch (error) {
    console.error("[createPrinter] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// UPDATE Operations
// ============================================================================

export async function updatePrinter(
  printerId: string,
  input: UpdatePrinterInput,
) {
  try {
    const supabase = createServerSupabaseClient();

    const { data: existingPrinter } = await supabase
      .from("printers")
      .select("*, stations(station_name), locations(name)")
      .eq("id", printerId)
      .single();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const beforeLog: Record<string, unknown> = {};
    const afterLog: Record<string, unknown> = {};

    const fields = [
      "printer_name",
      "printer_type",
      "printer_role",
      "printer_model",
      "serial_number",
      "connection_type",
      "network_address",
      "network_port",
      "bluetooth_address",
      "usb_device_path",
      "is_default_receipt",
      "is_default_kitchen",
      "print_order_tickets",
      "paper_width",
      "max_chars_per_line",
      "print_density",
      "supports_auto_cut",
      "supports_barcode",
      "supports_qr_code",
      "supports_logo",
      "supports_cash_drawer_kick",
      "receipt_header",
      "receipt_footer",
      "auto_print_receipt",
      "print_logo",
      "copies",
      "is_active",
    ] as const;

    for (const field of fields) {
      if ((input as Record<string, unknown>)[field] !== undefined) {
        updateData[field] = (input as Record<string, unknown>)[field];
        if (existingPrinter)
          beforeLog[field] = (existingPrinter as Record<string, unknown>)[
            field
          ];
        afterLog[field] = (input as Record<string, unknown>)[field];
      }
    }

    const { data, error } = await supabase
      .from("printers")
      .update(updateData)
      .eq("id", printerId)
      .select()
      .single();

    if (error) {
      console.error("[updatePrinter] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    let hasRealChanges = false;
    for (const key of Object.keys(afterLog)) {
      if (JSON.stringify(beforeLog[key]) !== JSON.stringify(afterLog[key])) {
        hasRealChanges = true;
        break;
      }
    }

    if (hasRealChanges && existingPrinter) {
      await LogAuditEvent({
        merchantId: existingPrinter.merchant_id,
        action: `Updated Printer: ${data.printer_name}`,
        actionCategory: "settings",
        resourceType: "printer",
        resourceId: printerId,
        resourceName: data.printer_name,
        locationId: existingPrinter.location_id,
        metadata: {
          station_name: (existingPrinter as any).stations?.station_name,
          location_name: (existingPrinter as any).locations?.name,
          printer_type: existingPrinter.printer_type,
          printer_role: existingPrinter.printer_role,
        },
        changes: { before: beforeLog, after: afterLog },
      });
    }

    return { success: true, data: data as Printer, error: null };
  } catch (error) {
    console.error("[updatePrinter] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// DELETE Operations
// ============================================================================

export async function deletePrinter(printerId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data: printer } = await supabase
      .from("printers")
      .select("*, stations(station_name), locations(name)")
      .eq("id", printerId)
      .single();

    const { error } = await supabase
      .from("printers")
      .delete()
      .eq("id", printerId);

    if (error) {
      console.error("[deletePrinter] Error:", error);
      return { success: false, error: error.message };
    }

    if (printer) {
      await LogAuditEvent({
        merchantId: printer.merchant_id,
        action: `Deleted Printer: ${printer.printer_name} (${printer.printer_role}) from Station: ${(printer as any).stations?.station_name || "Unknown"}`,
        actionCategory: "settings",
        resourceType: "printer",
        resourceId: printerId,
        resourceName: printer.printer_name,
        locationId: printer.location_id,
        metadata: {
          station_name: (printer as any).stations?.station_name,
          location_name: (printer as any).locations?.name,
          printer_type: printer.printer_type,
          printer_role: printer.printer_role,
          printer_model: printer.printer_model,
          serial_number: printer.serial_number,
        },
      });
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("[deletePrinter] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
