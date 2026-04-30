"use server";

// ============================================================================
// Payment Terminals Server Actions
// Description: CRUD operations for payment terminals (Dejavoo, PAX)
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { maskAuthKey } from "@/app/dashboard/settings/stations/utils/terminal-helpers";
import bcrypt from "bcryptjs";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// Types
// ============================================================================

export type TerminalType = "dejavoo" | "castles";
export type ApiEnvironment = "sandbox" | "production";
export type ConnectionType = "cloud" | "local";

export interface PaymentTerminal {
  id: string;
  merchant_id: string;
  location_id: string;
  station_id: string | null;

  // Terminal Identity
  terminal_name: string;
  terminal_type: TerminalType;
  terminal_model: string | null;
  serial_number: string | null;

  // Credentials (note: auth_key should be masked in responses)
  auth_key: string;
  register_id: string;

  // API Configuration
  api_environment: ApiEnvironment;
  api_base_url: string | null;
  spin_proxy_timeout: number;

  // Connection Settings
  connection_type: ConnectionType;
  local_ip_address: string | null;
  local_port: number | null;

  // Status
  is_active: boolean;
  is_connected: boolean;
  last_connection_test_at: string | null;
  last_connection_status: string | null;
  last_transaction_at: string | null;

  // Capabilities
  supports_contactless: boolean;
  supports_emv: boolean;
  supports_manual_entry: boolean;
  supports_ebt: boolean;
  supports_debit: boolean;
  supports_tip_adjust: boolean;

  // Settings
  auto_settle: boolean;
  settle_time: string | null;
  print_merchant_receipt: boolean;
  print_customer_receipt: boolean;
  signature_threshold: number;

  // Metadata
  metadata: Record<string, unknown>;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentTerminalInput {
  location_id: string;
  station_id?: string | null;
  terminal_name: string;
  terminal_type: TerminalType;
  terminal_model?: string | null;
  serial_number?: string | null;
  auth_key: string;
  register_id: string;
  api_environment?: ApiEnvironment;
  connection_type?: ConnectionType;
  local_ip_address?: string | null;
  local_port?: number | null;
  signature_threshold?: number;
  print_merchant_receipt?: boolean;
  print_customer_receipt?: boolean;
}

export interface UpdatePaymentTerminalInput {
  terminal_name?: string;
  terminal_model?: string | null;
  serial_number?: string | null;
  auth_key?: string;
  register_id?: string;
  api_environment?: ApiEnvironment;
  api_base_url?: string | null;
  spin_proxy_timeout?: number;
  connection_type?: ConnectionType;
  local_ip_address?: string | null;
  local_port?: number | null;
  auto_settle?: boolean;
  settle_time?: string | null;
  print_merchant_receipt?: boolean;
  print_customer_receipt?: boolean;
  signature_threshold?: number;
  supports_contactless?: boolean;
  supports_emv?: boolean;
  supports_manual_entry?: boolean;
  supports_ebt?: boolean;
  supports_debit?: boolean;
  supports_tip_adjust?: boolean;
  is_active?: boolean;
}

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get all terminals for a location
 */
export async function getTerminalsForLocation(locationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("payment_terminals")
      .select("*")
      .eq("location_id", locationId)
      .order("terminal_name");

    if (error) {
      console.error("[getTerminalsForLocation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Mask auth_key for security
    const maskedData = (data || []).map((terminal) => ({
      ...terminal,
      auth_key: maskAuthKey(terminal.auth_key),
    }));

    return {
      success: true,
      data: maskedData as PaymentTerminal[],
      error: null,
    };
  } catch (error) {
    console.error("[getTerminalsForLocation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Get available (unassigned) terminals for a location
 */
export async function getAvailableTerminals(locationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("payment_terminals")
      .select("*")
      .eq("location_id", locationId)
      .is("station_id", null)
      .eq("is_active", true)
      .order("terminal_name");

    if (error) {
      console.error("[getAvailableTerminals] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Mask auth_key for security
    const maskedData = (data || []).map((terminal) => ({
      ...terminal,
      auth_key: maskAuthKey(terminal.auth_key),
    }));

    return {
      success: true,
      data: maskedData as PaymentTerminal[],
      error: null,
    };
  } catch (error) {
    console.error("[getAvailableTerminals] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Get terminal for a specific station
 */
export async function getTerminalForStation(stationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("payment_terminals")
      .select("*")
      .eq("station_id", stationId)
      .single();

    if (error) {
      // No terminal assigned is okay
      if (error.code === "PGRST116") {
        return { success: true, data: null, error: null };
      }
      console.error("[getTerminalForStation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Mask auth_key for security
    const maskedData = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
    };

    return { success: true, data: maskedData as PaymentTerminal, error: null };
  } catch (error) {
    console.error("[getTerminalForStation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Get ALL terminals for a specific station (supports multiple terminals per station)
 */
export async function getTerminalsForStation(stationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("payment_terminals")
      .select("*")
      .eq("station_id", stationId)
      .order("is_active", { ascending: false })
      .order("terminal_name");

    if (error) {
      console.error("[getTerminalsForStation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Mask auth_key for security
    const maskedData = (data || []).map((terminal) => ({
      ...terminal,
      auth_key: maskAuthKey(terminal.auth_key),
    }));

    return {
      success: true,
      data: maskedData as PaymentTerminal[],
      error: null,
    };
  } catch (error) {
    console.error("[getTerminalsForStation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Get a specific terminal by ID
 */
export async function getPaymentTerminalById(terminalId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("payment_terminals")
      .select("*")
      .eq("id", terminalId)
      .single();

    if (error) {
      console.error("[getPaymentTerminalById] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Mask auth_key for security
    const maskedData = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
    };

    return { success: true, data: maskedData as PaymentTerminal, error: null };
  } catch (error) {
    console.error("[getPaymentTerminalById] Exception:", error);
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
 * Create a new payment terminal
 */
export async function createPaymentTerminal(
  clerkOrgId: string,
  input: CreatePaymentTerminalInput,
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
        "[createPaymentTerminal] Error getting merchant:",
        merchantError,
      );
      return { success: false, error: "Merchant not found", data: null };
    }

    // Validate RegisterId uniqueness per merchant
    const { data: existingRegisterId } = await supabase
      .from("payment_terminals")
      .select("id")
      .eq("merchant_id", merchant.id)
      .eq("register_id", input.register_id)
      .single();

    if (existingRegisterId) {
      return {
        success: false,
        error: `Terminal with Register ID "${input.register_id}" already exists`,
        data: null,
      };
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("payment_terminals")
      .insert({
        merchant_id: merchant.id,
        location_id: input.location_id,
        station_id: input.station_id || null,
        terminal_name: input.terminal_name,
        terminal_type: input.terminal_type,
        terminal_model: input.terminal_model || null,
        serial_number: input.serial_number || null,
        auth_key: input.auth_key,
        register_id: input.register_id,
        auth_key_encrypted: bcrypt.hashSync(input.auth_key) || null,
        api_environment: input.api_environment || "sandbox",
        connection_type: input.connection_type || "cloud",
        local_ip_address: input.local_ip_address || null,
        local_port: input.local_port || null,
        signature_threshold: input.signature_threshold ?? 25.0,
        print_merchant_receipt: input.print_merchant_receipt ?? true,
        print_customer_receipt: input.print_customer_receipt ?? true,
        is_active: true,
        is_connected: false,
        supports_contactless: true,
        supports_emv: true,
        supports_manual_entry: true,
        supports_ebt: false,
        supports_debit: true,
        supports_tip_adjust: true,
        auto_settle: false,
        spin_proxy_timeout: 120,
        metadata: {},
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      console.error("[createPaymentTerminal] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Vault the auth_key and store the secret UUID pointer
    const { error: vaultErr } = await supabase.rpc("upsert_terminal_vault_secret", {
      p_terminal_id: data.id,
      p_auth_key: input.auth_key,
    });
    if (vaultErr) {
      console.error("[createPaymentTerminal] Vault error:", vaultErr);
    }

    // Mask auth_key in response
    const maskedData = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
    };

    // Log audit event
    await LogAuditEvent({
      merchantId: merchant.id,
      action: `Created Payment Terminal: ${input.terminal_name}`,
      actionCategory: "settings",
      resourceType: "payment_terminal",
      resourceId: data.id,
      resourceName: input.terminal_name,
      locationId: input.location_id,
      metadata: { register_id: input.register_id },
    });

    return { success: true, data: maskedData as PaymentTerminal, error: null };
  } catch (error) {
    console.error("[createPaymentTerminal] Exception:", error);
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
 * Update a payment terminal
 */
export async function updatePaymentTerminal(
  terminalId: string,
  input: UpdatePaymentTerminalInput,
) {
  try {
    const supabase = createServerSupabaseClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.terminal_name !== undefined)
      updateData.terminal_name = input.terminal_name;
    if (input.terminal_model !== undefined)
      updateData.terminal_model = input.terminal_model;
    if (input.serial_number !== undefined)
      updateData.serial_number = input.serial_number;
    if (input.auth_key !== undefined) updateData.auth_key = input.auth_key;
    if (input.register_id !== undefined)
      updateData.register_id = input.register_id;
    if (input.api_environment !== undefined)
      updateData.api_environment = input.api_environment;
    if (input.api_base_url !== undefined)
      updateData.api_base_url = input.api_base_url;
    if (input.spin_proxy_timeout !== undefined)
      updateData.spin_proxy_timeout = input.spin_proxy_timeout;
    if (input.connection_type !== undefined)
      updateData.connection_type = input.connection_type;
    if (input.local_ip_address !== undefined)
      updateData.local_ip_address = input.local_ip_address;
    if (input.local_port !== undefined)
      updateData.local_port = input.local_port;
    if (input.auto_settle !== undefined)
      updateData.auto_settle = input.auto_settle;
    if (input.settle_time !== undefined)
      updateData.settle_time = input.settle_time;
    if (input.print_merchant_receipt !== undefined)
      updateData.print_merchant_receipt = input.print_merchant_receipt;
    if (input.print_customer_receipt !== undefined)
      updateData.print_customer_receipt = input.print_customer_receipt;
    if (input.signature_threshold !== undefined)
      updateData.signature_threshold = input.signature_threshold;
    if (input.supports_contactless !== undefined)
      updateData.supports_contactless = input.supports_contactless;
    if (input.supports_emv !== undefined)
      updateData.supports_emv = input.supports_emv;
    if (input.supports_manual_entry !== undefined)
      updateData.supports_manual_entry = input.supports_manual_entry;
    if (input.supports_ebt !== undefined)
      updateData.supports_ebt = input.supports_ebt;
    if (input.supports_debit !== undefined)
      updateData.supports_debit = input.supports_debit;
    if (input.supports_tip_adjust !== undefined)
      updateData.supports_tip_adjust = input.supports_tip_adjust;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    // Fetch current terminal data for audit log diff
    const { data: currentTerminal, error: fetchError } = await supabase
      .from("payment_terminals")
      .select("*")
      .eq("id", terminalId)
      .single();

    if (fetchError || !currentTerminal) {
      return { success: false, error: "Terminal not found", data: null };
    }

    const { data, error } = await supabase
      .from("payment_terminals")
      .update(updateData)
      .eq("id", terminalId)
      .select()
      .single();

    if (error) {
      console.error("[updatePaymentTerminal] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Re-vault auth_key if it was updated
    if (input.auth_key !== undefined) {
      const { error: vaultErr } = await supabase.rpc("upsert_terminal_vault_secret", {
        p_terminal_id: terminalId,
        p_auth_key: input.auth_key,
      });
      if (vaultErr) {
        console.error("[updatePaymentTerminal] Vault error:", vaultErr);
      }
    }

    // Mask auth_key in response
    const maskedData = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
    };

    // Calculate changes for audit log
    const changedFields: string[] = [];
    const beforeLog: Record<string, unknown> = {};
    const afterLog: Record<string, unknown> = {};

    Object.keys(updateData).forEach((key) => {
      // Skip updated_at
      if (key === "updated_at") return;

      const newValue = updateData[key];
      const oldValue = currentTerminal[key as keyof typeof currentTerminal];

      // Handle masking for sensitive fields in logs if necessary (auth_key)
      // For now, tracking them as changed is okay, but maybe don't log the actual key if it's sensitive
      // The updateInput has auth_key unmasked usually.
      // Let's mask auth_key in logs if it changes
      if (key === "auth_key") {
        if (newValue !== oldValue) {
          changedFields.push(key);
          beforeLog[key] = "***"; // Mask in log
          afterLog[key] = "***"; // Mask in log
        }
        return;
      }

      if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
        changedFields.push(key);
        beforeLog[key] = oldValue;
        afterLog[key] = newValue;
      }
    });

    // Log audit event
    if (changedFields.length > 0) {
      await LogAuditEvent({
        merchantId: data.merchant_id,
        action: `Updated Payment Terminal: ${data.terminal_name}`,
        actionCategory: "settings",
        resourceType: "payment_terminal",
        resourceId: terminalId,
        resourceName: data.terminal_name,
        locationId: data.location_id,
        changes: { before: beforeLog, after: afterLog },
      });
    }

    return { success: true, data: maskedData as PaymentTerminal, error: null };
  } catch (error) {
    console.error("[updatePaymentTerminal] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Set a specific terminal as the active one for a station
 * Deactivates all other terminals on that station first
 */
export async function setActiveTerminalForStation(
  terminalId: string,
  stationId: string,
) {
  try {
    const supabase = createServerSupabaseClient();

    // Deactivate all terminals for this station
    const { error: deactivateError } = await supabase
      .from("payment_terminals")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("station_id", stationId);

    if (deactivateError) {
      console.error("[setActiveTerminalForStation] Deactivate error:", deactivateError);
      return { success: false, error: deactivateError.message, data: null };
    }

    // Activate the specified terminal
    const { data, error } = await supabase
      .from("payment_terminals")
      .update({
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", terminalId)
      .select()
      .single();

    if (error) {
      console.error("[setActiveTerminalForStation] Activate error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Mask auth_key in response
    const maskedData = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
    };

    // Log audit event
    await LogAuditEvent({
      merchantId: data.merchant_id,
      action: `Set Active Terminal: ${data.terminal_name}`,
      actionCategory: "settings",
      resourceType: "payment_terminal",
      resourceId: terminalId,
      resourceName: data.terminal_name,
      locationId: data.location_id,
      metadata: { station_id: stationId },
    });

    return { success: true, data: maskedData as PaymentTerminal, error: null };
  } catch (error) {
    console.error("[setActiveTerminalForStation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Link a terminal to a station
 */
export async function linkTerminalToStation(
  terminalId: string,
  stationId: string,
) {
  try {
    const supabase = createServerSupabaseClient();

    // Check if station already has an active terminal — if so, new one links as inactive
    const { data: existingTerminals } = await supabase
      .from("payment_terminals")
      .select("id")
      .eq("station_id", stationId);

    const hasExisting = existingTerminals && existingTerminals.length > 0;

    const { data, error } = await supabase
      .from("payment_terminals")
      .update({
        station_id: stationId,
        is_active: !hasExisting, // First terminal is active, subsequent ones are inactive
        updated_at: new Date().toISOString(),
      })
      .eq("id", terminalId)
      .select()
      .single();

    if (error) {
      console.error("[linkTerminalToStation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Mask auth_key in response
    const maskedData = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
    };

    // Log audit event
    // Fetch station name for better context
    const { data: station } = await supabase
      .from("stations")
      .select("name")
      .eq("id", stationId)
      .single();

    await LogAuditEvent({
      merchantId: data.merchant_id,
      action: `Linked Terminal ${data.terminal_name} to Station ${station?.name || "Unknown"}`,
      actionCategory: "settings",
      resourceType: "payment_terminal",
      resourceId: terminalId,
      resourceName: data.terminal_name,
      locationId: data.location_id,
      metadata: { station_id: stationId, station_name: station?.name },
    });

    return { success: true, data: maskedData as PaymentTerminal, error: null };
  } catch (error) {
    console.error("[linkTerminalToStation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Unlink a terminal from its station
 */
export async function unlinkTerminalFromStation(terminalId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("payment_terminals")
      .update({
        station_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", terminalId)
      .select()
      .single();

    if (error) {
      console.error("[unlinkTerminalFromStation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Mask auth_key in response
    const maskedData = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
    };

    // Log audit event
    await LogAuditEvent({
      merchantId: data.merchant_id,
      action: `Unlinked Terminal ${data.terminal_name} from Station`,
      actionCategory: "settings",
      resourceType: "payment_terminal",
      resourceId: terminalId,
      resourceName: data.terminal_name,
      locationId: data.location_id,
    });

    return { success: true, data: maskedData as PaymentTerminal, error: null };
  } catch (error) {
    console.error("[unlinkTerminalFromStation] Exception:", error);
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

/**
 * Delete a payment terminal
 */
export async function deletePaymentTerminal(terminalId: string) {
  try {
    const supabase = createServerSupabaseClient();

    // Fetch details before delete
    const { data: terminal } = await supabase
      .from("payment_terminals")
      .select("terminal_name, merchant_id, location_id, register_id")
      .eq("id", terminalId)
      .single();

    const { error } = await supabase
      .from("payment_terminals")
      .delete()
      .eq("id", terminalId);

    if (error) {
      console.error("[deletePaymentTerminal] Error:", error);
      return { success: false, error: error.message };
    }

    // Log audit event
    if (terminal) {
      await LogAuditEvent({
        merchantId: terminal.merchant_id,
        action: `Deleted Terminal: ${terminal.terminal_name}`,
        actionCategory: "settings",
        resourceType: "payment_terminal",
        resourceId: terminalId,
        resourceName: terminal.terminal_name,
        locationId: terminal.location_id,
        metadata: { register_id: terminal.register_id },
      });
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("[deletePaymentTerminal] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Terminal Actions
// ============================================================================

/**
 * Test terminal connection
 */
export async function testTerminalConnection(terminalId: string) {
  try {
    const supabase = createServerSupabaseClient();

    // Get terminal details
    const { data: terminal, error: fetchError } = await supabase
      .from("payment_terminals")
      .select("*")
      .eq("id", terminalId)
      .single();

    if (fetchError || !terminal) {
      return {
        success: false,
        error: "Terminal not found",
        status: "NotFound",
      };
    }

    // Simulate SPIN API connection test
    // In production, this would call the actual Dejavoo/PAX SPIN API
    // await new Promise(resolve => setTimeout(resolve, 1500))
    // NEXT_PUBLIC_DEJAVOO_SPIN_API/v2/Common/TerminalStatus
    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");

    var requestOptions = {
      method: "GET",
      headers: myHeaders,
      redirect: "follow",
    };
    let isOnline = false;
    let status = "Offline";
    // await new Promise((resolve) => setTimeout(resolve, 1500));

    // // 85% success rate for demo
    // const isOnline = Math.random() > 0.15;
    // const status = isOnline ? "Online" : "Offline";

    // Determine online_since
    let onlineSince = (terminal.metadata as any)?.online_since;

    if (isOnline) {
      // If previously offline or no online_since record, set to now
      if (terminal.last_connection_status !== "Online" || !onlineSince) {
        onlineSince = new Date().toISOString();
      }
      // If already online, preserve existing onlineSince
    } else {
      // If offline, clear online_since
      onlineSince = null;
    }

    const updatedMetadata = {
      ...terminal.metadata,
      online_since: onlineSince,
    };
    // Retrieve the real auth_key from vault — never read plaintext from the row
    const { data: authKey, error: vaultErr } = await supabase.rpc(
      "get_payment_terminal_credentials",
      { p_terminal_id: terminalId },
    );
    if (vaultErr || !authKey) {
      console.error("[testTerminalConnection] Vault error:", vaultErr);
      return { success: false, status: "Error", error: "Could not retrieve terminal credentials" };
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_DEJAVOO_SPIN_API}/v2/Common/TerminalStatus?request.registerId=${terminal.register_id}&request.authkey=${authKey}`,
      requestOptions as RequestInit,
    )
      .then((response) => response.json())
      .then((result) => {
        console.log(result);
        if (result.TerminalStatus == "Online") {
          isOnline = true;
          status = "Online";
        } else {
          isOnline = false;
          status = "Offline";
        }
      })
      .catch((error) => console.log("error", error));

    // Update terminal status
    await supabase
      .from("payment_terminals")
      .update({
        is_connected: isOnline,
        last_connection_test_at: new Date().toISOString(),
        last_connection_status: status,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", terminalId);

    return {
      success: true,
      status,
      error: isOnline ? null : "Terminal not responding",
    };
  } catch (error) {
    console.error("[testTerminalConnection] Exception:", error);
    return {
      success: false,
      status: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get terminal capabilities (would query actual terminal in production)
 */
export async function refreshTerminalCapabilities(terminalId: string) {
  try {
    const supabase = createServerSupabaseClient();

    // In production, this would query the terminal for its actual capabilities
    // For now, we'll return default capabilities

    const capabilities = {
      supports_contactless: true,
      supports_emv: true,
      supports_manual_entry: true,
      supports_ebt: false,
      supports_debit: true,
      supports_tip_adjust: true,
    };

    const { data, error } = await supabase
      .from("payment_terminals")
      .update({
        ...capabilities,
        updated_at: new Date().toISOString(),
      })
      .eq("id", terminalId)
      .select()
      .single();

    if (error) {
      console.error("[refreshTerminalCapabilities] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: capabilities, error: null };
  } catch (error) {
    console.error("[refreshTerminalCapabilities] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}
