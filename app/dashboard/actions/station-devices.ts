"use server";

// ============================================================================
// Station Devices Server Actions
// Description: CRUD operations for peripheral devices (printers, cash drawers)
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// Types
// ============================================================================

export type StationDeviceType =
  | "receipt_printer"
  | "kitchen_printer"
  | "label_printer"
  | "cash_drawer"
  | "barcode_scanner"
  | "scale"
  | "customer_display";

export type ConnectionType = "usb" | "bluetooth" | "network" | "integrated";

export interface StationDevice {
  id: string;
  station_id: string;
  merchant_id: string;
  location_id: string;
  payment_terminal_id: string | null;

  // Device Identity
  device_type: StationDeviceType;
  device_name: string;
  device_model: string | null;
  serial_number: string | null;

  // Connection
  connection_type: ConnectionType;
  connection_address: string | null;
  connection_port: number | null;

  // Printer-specific settings
  printer_width: number | null;
  printer_dpi: number | null;
  auto_cut: boolean;
  open_cash_drawer: boolean;

  // Status
  is_active: boolean;
  is_connected: boolean;
  last_seen_at: string | null;
  last_error: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface CreateStationDeviceInput {
  station_id: string;
  device_type: StationDeviceType;
  device_name: string;
  device_model?: string | null;
  serial_number?: string | null;
  connection_type: ConnectionType;
  connection_address?: string | null;
  connection_port?: number | null;
  printer_width?: number | null;
  printer_dpi?: number | null;
  auto_cut?: boolean;
  open_cash_drawer?: boolean;
}

export interface UpdateStationDeviceInput {
  device_name?: string;
  device_model?: string | null;
  serial_number?: string | null;
  connection_type?: ConnectionType;
  connection_address?: string | null;
  connection_port?: number | null;
  printer_width?: number | null;
  printer_dpi?: number | null;
  auto_cut?: boolean;
  open_cash_drawer?: boolean;
  is_active?: boolean;
}

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get all devices for a specific station
 */
export async function getDevicesForStation(stationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("station_devices")
      .select("*")
      .eq("station_id", stationId)
      .order("device_type")
      .order("device_name");

    if (error) {
      console.error("[getDevicesForStation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data as StationDevice[], error: null };
  } catch (error) {
    console.error("[getDevicesForStation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Get a specific device by ID
 */
export async function getStationDeviceById(deviceId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("station_devices")
      .select("*")
      .eq("id", deviceId)
      .single();

    if (error) {
      console.error("[getStationDeviceById] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data as StationDevice, error: null };
  } catch (error) {
    console.error("[getStationDeviceById] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Get all devices for a location (across all stations)
 */
export async function getDevicesForLocation(locationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("station_devices")
      .select("*, stations(station_name)")
      .eq("location_id", locationId)
      .order("station_id")
      .order("device_type");

    if (error) {
      console.error("[getDevicesForLocation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data, error: null };
  } catch (error) {
    console.error("[getDevicesForLocation] Exception:", error);
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

/**
 * Create a new device for a station
 */
export async function createStationDevice(input: CreateStationDeviceInput) {
  try {
    const supabase = createServerSupabaseClient();

    // First, get the station to get merchant_id and location_id
    const { data: station, error: stationError } = await supabase
      .from("stations")
      .select("merchant_id, location_id, station_name")
      .eq("id", input.station_id)
      .single();

    if (stationError || !station) {
      console.error(
        "[createStationDevice] Error getting station:",
        stationError,
      );
      return { success: false, error: "Station not found", data: null };
    }

    // Get location name for audit log
    const { data: location } = await supabase
      .from("locations")
      .select("name")
      .eq("id", station.location_id)
      .single();

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("station_devices")
      .insert({
        station_id: input.station_id,
        merchant_id: station.merchant_id,
        location_id: station.location_id,
        device_type: input.device_type,
        device_name: input.device_name,
        device_model: input.device_model || null,
        serial_number: input.serial_number || null,
        connection_type: input.connection_type,
        connection_address: input.connection_address || null,
        connection_port: input.connection_port || null,
        printer_width: input.printer_width || null,
        printer_dpi: input.printer_dpi || null,
        auto_cut: input.auto_cut ?? true,
        open_cash_drawer: input.open_cash_drawer ?? false,
        is_active: true,
        is_connected: false,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      console.error("[createStationDevice] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Log audit event
    await LogAuditEvent({
      merchantId: station.merchant_id,
      action: `Added Device: ${input.device_name} (${input.device_type}) to Station: ${station.station_name}`,
      actionCategory: "settings",
      resourceType: "device",
      resourceId: data.id,
      resourceName: input.device_name,
      locationId: station.location_id,
      metadata: {
        station_id: input.station_id,
        station_name: station.station_name,
        location_name: location?.name,
        device_type: input.device_type,
        connection_type: input.connection_type,
        device_model: input.device_model,
        serial_number: input.serial_number,
      },
    });

    return { success: true, data: data as StationDevice, error: null };
  } catch (error) {
    console.error("[createStationDevice] Exception:", error);
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

/**
 * Update a station device
 */
export async function updateStationDevice(
  deviceId: string,
  input: UpdateStationDeviceInput,
) {
  try {
    const supabase = createServerSupabaseClient();

    // Fetch existing device BEFORE updating (for audit log)
    const { data: existingDevice } = await supabase
      .from("station_devices")
      .select("*, stations(station_name), locations(name)")
      .eq("id", deviceId)
      .single();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const beforeLog: Record<string, unknown> = {};
    const afterLog: Record<string, unknown> = {};

    if (input.device_name !== undefined) {
      updateData.device_name = input.device_name;
      if (existingDevice) beforeLog.device_name = existingDevice.device_name;
      afterLog.device_name = input.device_name;
    }
    if (input.device_model !== undefined) {
      updateData.device_model = input.device_model;
      if (existingDevice) beforeLog.device_model = existingDevice.device_model;
      afterLog.device_model = input.device_model;
    }
    if (input.serial_number !== undefined) {
      updateData.serial_number = input.serial_number;
      if (existingDevice)
        beforeLog.serial_number = existingDevice.serial_number;
      afterLog.serial_number = input.serial_number;
    }
    if (input.connection_type !== undefined) {
      updateData.connection_type = input.connection_type;
      if (existingDevice)
        beforeLog.connection_type = existingDevice.connection_type;
      afterLog.connection_type = input.connection_type;
    }
    if (input.connection_address !== undefined) {
      updateData.connection_address = input.connection_address;
      if (existingDevice)
        beforeLog.connection_address = existingDevice.connection_address;
      afterLog.connection_address = input.connection_address;
    }
    if (input.connection_port !== undefined) {
      updateData.connection_port = input.connection_port;
      if (existingDevice)
        beforeLog.connection_port = existingDevice.connection_port;
      afterLog.connection_port = input.connection_port;
    }
    if (input.printer_width !== undefined) {
      updateData.printer_width = input.printer_width;
      if (existingDevice)
        beforeLog.printer_width = existingDevice.printer_width;
      afterLog.printer_width = input.printer_width;
    }
    if (input.printer_dpi !== undefined) {
      updateData.printer_dpi = input.printer_dpi;
      if (existingDevice) beforeLog.printer_dpi = existingDevice.printer_dpi;
      afterLog.printer_dpi = input.printer_dpi;
    }
    if (input.auto_cut !== undefined) {
      updateData.auto_cut = input.auto_cut;
      if (existingDevice) beforeLog.auto_cut = existingDevice.auto_cut;
      afterLog.auto_cut = input.auto_cut;
    }
    if (input.open_cash_drawer !== undefined) {
      updateData.open_cash_drawer = input.open_cash_drawer;
      if (existingDevice)
        beforeLog.open_cash_drawer = existingDevice.open_cash_drawer;
      afterLog.open_cash_drawer = input.open_cash_drawer;
    }
    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active;
      if (existingDevice) beforeLog.is_active = existingDevice.is_active;
      afterLog.is_active = input.is_active;
    }

    const { data, error } = await supabase
      .from("station_devices")
      .update(updateData)
      .eq("id", deviceId)
      .select()
      .single();

    if (error) {
      console.error("[updateStationDevice] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Check if any values actually changed before logging
    let hasRealChanges = false;
    for (const key of Object.keys(afterLog)) {
      if (JSON.stringify(beforeLog[key]) !== JSON.stringify(afterLog[key])) {
        hasRealChanges = true;
        break;
      }
    }

    // Log audit event only if there were actual changes
    if (hasRealChanges && existingDevice) {
      await LogAuditEvent({
        merchantId: existingDevice.merchant_id,
        action: `Updated Device: ${data.device_name}`,
        actionCategory: "settings",
        resourceType: "device",
        resourceId: deviceId,
        resourceName: data.device_name,
        locationId: existingDevice.location_id,
        metadata: {
          station_name: (existingDevice as any).stations?.station_name,
          location_name: (existingDevice as any).locations?.name,
          device_type: existingDevice.device_type,
        },
        changes: { before: beforeLog, after: afterLog },
      });
    }

    return { success: true, data: data as StationDevice, error: null };
  } catch (error) {
    console.error("[updateStationDevice] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Update device connection status (called by POS app)
 */
export async function updateDeviceStatus(
  deviceId: string,
  isConnected: boolean,
  lastError?: string,
) {
  try {
    const supabase = createServerSupabaseClient();

    const { error } = await supabase
      .from("station_devices")
      .update({
        is_connected: isConnected,
        last_seen_at: isConnected ? new Date().toISOString() : undefined,
        last_error: lastError || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", deviceId);

    if (error) {
      console.error("[updateDeviceStatus] Error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("[updateDeviceStatus] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// DELETE Operations
// ============================================================================

/**
 * Delete a station device
 */
export async function deleteStationDevice(deviceId: string) {
  try {
    const supabase = createServerSupabaseClient();

    // Fetch device details BEFORE deleting (for audit log)
    const { data: device } = await supabase
      .from("station_devices")
      .select("*, stations(station_name), locations(name)")
      .eq("id", deviceId)
      .single();

    const { error } = await supabase
      .from("station_devices")
      .delete()
      .eq("id", deviceId);

    if (error) {
      console.error("[deleteStationDevice] Error:", error);
      return { success: false, error: error.message };
    }

    // Log audit event
    if (device) {
      await LogAuditEvent({
        merchantId: device.merchant_id,
        action: `Deleted Device: ${device.device_name} (${device.device_type}) from Station: ${(device as any).stations?.station_name || "Unknown"}`,
        actionCategory: "settings",
        resourceType: "device",
        resourceId: deviceId,
        resourceName: device.device_name,
        locationId: device.location_id,
        metadata: {
          station_name: (device as any).stations?.station_name,
          location_name: (device as any).locations?.name,
          device_type: device.device_type,
          device_model: device.device_model,
          serial_number: device.serial_number,
        },
      });
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("[deleteStationDevice] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Device Actions
// ============================================================================

/**
 * Test device connection (simulated - would integrate with actual device APIs)
 */
export async function testDeviceConnection(deviceId: string) {
  try {
    const supabase = createServerSupabaseClient();

    // Get device details
    const { data: device, error: fetchError } = await supabase
      .from("station_devices")
      .select("*")
      .eq("id", deviceId)
      .single();

    if (fetchError || !device) {
      return { success: false, error: "Device not found", connected: false };
    }

    // Simulate connection test based on connection type
    // In production, this would actually ping the device
    const simulatedSuccess = Math.random() > 0.2; // 80% success rate for demo

    // Update device status
    await supabase
      .from("station_devices")
      .update({
        is_connected: simulatedSuccess,
        last_seen_at: simulatedSuccess
          ? new Date().toISOString()
          : device.last_seen_at,
        last_error: simulatedSuccess ? null : "Connection timeout",
        updated_at: new Date().toISOString(),
      })
      .eq("id", deviceId);

    return {
      success: true,
      connected: simulatedSuccess,
      error: simulatedSuccess ? null : "Connection timeout",
    };
  } catch (error) {
    console.error("[testDeviceConnection] Exception:", error);
    return {
      success: false,
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Test print (for printers)
 */
export async function testPrint(deviceId: string) {
  try {
    // In production, this would send a test print job to the printer
    // For now, we'll simulate the operation

    // Simulate print time
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 90% success rate for demo
    const success = Math.random() > 0.1;

    return {
      success,
      error: success ? null : "Printer not responding",
    };
  } catch (error) {
    console.error("[testPrint] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Open cash drawer
 */
export async function openCashDrawer(deviceId: string) {
  try {
    // In production, this would send the open command to the cash drawer
    // For now, we'll simulate the operation

    // Simulate operation time
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 95% success rate for demo
    const success = Math.random() > 0.05;

    return {
      success,
      error: success ? null : "Cash drawer not responding",
    };
  } catch (error) {
    console.error("[openCashDrawer] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
