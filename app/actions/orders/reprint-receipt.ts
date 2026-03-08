"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { testPrint } from "@/app/dashboard/actions/station-devices";
import { auth } from "@clerk/nextjs/server";

export type ReprintReceiptType = "customer" | "kitchen" | "bar";

const PRINTER_TYPES = [
  "receipt_printer",
  "kitchen_printer",
  "label_printer",
] as const;

export type PrinterDevice = {
  id: string;
  device_name: string;
  device_type: string;
  station_id: string;
  location_id: string;
  stations?: { station_name: string } | null;
};

/**
 * Fetch available printers for a location (direct Supabase query, no RPC).
 * Filters station_devices by printer types and active status.
 */
export async function getPrintersForLocation(
  locationId: string | null
): Promise<{ success: boolean; printers: PrinterDevice[]; error?: string }> {
  if (!locationId) {
    return { success: true, printers: [] };
  }

  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("station_devices")
      .select("id, device_name, device_type, station_id, location_id, stations(station_name)")
      .eq("location_id", locationId)
      .in("device_type", PRINTER_TYPES)
      .eq("is_active", true)
      .order("device_type")
      .order("device_name");

    if (error) {
      console.error("[getPrintersForLocation] Error:", error);
      return { success: false, printers: [], error: error.message };
    }

    return { success: true, printers: (data ?? []) as PrinterDevice[] };
  } catch (err) {
    console.error("[getPrintersForLocation] Exception:", err);
    return {
      success: false,
      printers: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export interface ReprintReceiptParams {
  orderId: string;
  receiptType: ReprintReceiptType;
  deviceId: string;
}

export interface ReprintReceiptResult {
  success: boolean;
  message?: string;
}

/**
 * Queue a reprint job for an order. Uses the existing print service layer (testPrint).
 * In production, this would integrate with a real print queue.
 */
export async function reprintReceipt(
  params: ReprintReceiptParams
): Promise<ReprintReceiptResult> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, message: "Unauthorized" };
  }

  const { orderId, receiptType, deviceId } = params;
  if (!orderId || !deviceId) {
    return { success: false, message: "Missing order or printer" };
  }

  try {
    const result = await testPrint(deviceId);
    if (result.success) {
      return { success: true };
    }
    return { success: false, message: result.error ?? "Print failed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, message: msg };
  }
}
