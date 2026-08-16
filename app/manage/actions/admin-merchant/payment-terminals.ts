'use server'

// ============================================================================
// Admin Payment Terminals Server Actions
// Description: CRUD operations for viewing/managing merchant payment terminals from HQ
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { maskAuthKey, normalizeSerial, isDuplicateSerialError } from '@/app/dashboard/settings/stations/utils/terminal-helpers'
import bcrypt from 'bcryptjs'

// ============================================================================
// Types (duplicated from dashboard/actions/payment-terminals.ts for server action compatibility)
// ============================================================================

export type TerminalType = 'dejavoo' | 'castles' | 'valor' | 'pax'
export type ApiEnvironment = 'sandbox' | 'production'
export type ConnectionType = 'cloud' | 'local'

export interface PaymentTerminal {
  id: string
  merchant_id: string
  location_id: string
  station_id: string | null
  terminal_name: string
  terminal_type: TerminalType
  terminal_model: string | null
  serial_number: string | null
  auth_key: string
  register_id: string
  api_environment: ApiEnvironment
  api_base_url: string | null
  spin_proxy_timeout: number
  connection_type: ConnectionType
  local_ip_address: string | null
  local_port: number | null
  is_active: boolean
  is_connected: boolean
  last_connection_test_at: string | null
  last_connection_status: string | null
  last_transaction_at: string | null
  supports_contactless: boolean
  supports_emv: boolean
  supports_manual_entry: boolean
  supports_ebt: boolean
  supports_debit: boolean
  supports_tip_adjust: boolean
  auto_settle: boolean
  settle_time: string | null
  valor_epi: string | null
  print_merchant_receipt: boolean
  print_customer_receipt: boolean
  signature_threshold: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CreatePaymentTerminalInput {
  location_id: string
  station_id?: string | null
  terminal_name: string
  terminal_type: TerminalType
  terminal_model?: string | null
  serial_number?: string | null
  // Dejavoo/SPIN cloud fields — not used by Castles/Valor (semi-integrated, LAN-local).
  auth_key?: string | null
  register_id?: string | null
  // Valor terminal identity (EPI) — anchor for the auto-batch settlement webhook.
  valor_epi?: string | null
  api_environment?: ApiEnvironment
  connection_type?: ConnectionType
  local_ip_address?: string | null
  local_port?: number | null
  signature_threshold?: number
  print_merchant_receipt?: boolean
  print_customer_receipt?: boolean
}

export interface UpdatePaymentTerminalInput {
  terminal_name?: string
  terminal_model?: string | null
  serial_number?: string | null
  auth_key?: string
  register_id?: string
  api_environment?: ApiEnvironment
  api_base_url?: string | null
  spin_proxy_timeout?: number
  connection_type?: ConnectionType
  local_ip_address?: string | null
  local_port?: number | null
  auto_settle?: boolean
  settle_time?: string | null
  valor_epi?: string | null
  print_merchant_receipt?: boolean
  print_customer_receipt?: boolean
  signature_threshold?: number
  supports_contactless?: boolean
  supports_emv?: boolean
  supports_manual_entry?: boolean
  supports_ebt?: boolean
  supports_debit?: boolean
  supports_tip_adjust?: boolean
  is_active?: boolean
  /**
   * Explicit override to change a terminal's serial_number from one non-null
   * value to a DIFFERENT non-null value. Without it, such a change is blocked:
   * the serial is the physical-device identity and settlement batches are keyed
   * to it, so a different serial means a different device that must be
   * registered as its own terminal row (see adminUpdateTerminal guard).
   */
  confirmSerialChange?: boolean
}

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get all payment terminals for a merchant (admin access)
 */
export async function getAdminMerchantTerminals(
  merchantId: string,
  locationId?: string | null
) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('payment_terminals')
      .select(`
        *,
        locations:location_id (
          id,
          name
        ),
        stations:station_id (
          id,
          station_name
        )
      `)
      .eq('merchant_id', merchantId)
      .order('terminal_name')

    if (locationId && locationId !== 'all') {
      query = query.eq('location_id', locationId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[getAdminMerchantTerminals] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Transform and mask auth_key
    const terminalsWithDetails = (data || []).map((terminal) => ({
      ...terminal,
      auth_key: maskAuthKey(terminal.auth_key),
      location_name: terminal.locations?.name || 'Unknown Location',
      station_name: terminal.stations?.station_name || null,
    }))

    return {
      success: true,
      data: terminalsWithDetails as (PaymentTerminal & { location_name: string; station_name: string | null })[],
      error: null,
    }
  } catch (error) {
    console.error('[getAdminMerchantTerminals] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * Get a specific payment terminal by ID (admin access)
 */
export async function getAdminTerminalById(terminalId: string) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('payment_terminals')
      .select(`
        *,
        locations:location_id (
          id,
          name
        ),
        stations:station_id (
          id,
          station_name
        )
      `)
      .eq('id', terminalId)
      .single()

    if (error) {
      console.error('[getAdminTerminalById] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Mask auth_key
    const terminalWithDetails = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
      location_name: data.locations?.name || 'Unknown Location',
      station_name: data.stations?.station_name || null,
    }

    return {
      success: true,
      data: terminalWithDetails as PaymentTerminal & { location_name: string; station_name: string | null },
      error: null,
    }
  } catch (error) {
    console.error('[getAdminTerminalById] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * Get available (unassigned) terminals for a location (admin access)
 */
export async function getAdminAvailableTerminals(locationId: string) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('payment_terminals')
      .select('*')
      .eq('location_id', locationId)
      .is('station_id', null)
      .eq('is_active', true)
      .order('terminal_name')

    if (error) {
      console.error('[getAdminAvailableTerminals] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Mask auth_key for security
    const maskedData = (data || []).map((terminal) => ({
      ...terminal,
      auth_key: maskAuthKey(terminal.auth_key),
    }))

    return {
      success: true,
      data: maskedData as PaymentTerminal[],
      error: null,
    }
  } catch (error) {
    console.error('[getAdminAvailableTerminals] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * Get payment terminal statistics for a merchant
 */
export async function getAdminMerchantTerminalStats(
  merchantId: string,
  locationId?: string | null
) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('payment_terminals')
      .select('id, is_connected, is_active, terminal_type, station_id')
      .eq('merchant_id', merchantId)

    if (locationId && locationId !== 'all') {
      query = query.eq('location_id', locationId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[getAdminMerchantTerminalStats] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    const terminals = data || []
    const stats = {
      total: terminals.length,
      active: terminals.filter((t) => t.is_active).length,
      connected: terminals.filter((t) => t.is_connected && t.is_active).length,
      disconnected: terminals.filter((t) => !t.is_connected && t.is_active).length,
      assigned: terminals.filter((t) => t.station_id !== null).length,
      unassigned: terminals.filter((t) => t.station_id === null).length,
      byType: {
        dejavoo: terminals.filter((t) => t.terminal_type === 'dejavoo').length,
        pax: terminals.filter((t) => t.terminal_type === 'pax').length,
      },
    }

    return { success: true, data: stats, error: null }
  } catch (error) {
    console.error('[getAdminMerchantTerminalStats] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * A single physical terminal, deduplicated by serial number, with live
 * connection state and the auto-settle config. One row per unique serial.
 */
export interface ConnectedTerminalRow {
  terminal_uuid: string
  serial_number: string | null
  terminal_name: string
  terminal_type: string
  terminal_model: string | null
  station_id: string | null
  station_name: string | null
  location_id: string
  location_name: string | null
  is_active: boolean
  is_connected: boolean
  last_connection_test_at: string | null
  last_connection_status: string | null
  connection_state: 'online' | 'offline' | 'stale' | 'unknown'
  last_transaction_at: string | null
  last_batch_at: string | null
  open_batch_count: number | null
  consecutive_failures: number | null
  auto_settle: boolean
  settle_time: string | null
  valor_epi: string | null
  duplicate_serial: boolean
}

/**
 * Get the UNIQUE payment terminals (by serial number) for a merchant, with
 * connection state and auto-settle config. Castles + Valor only. Backed by the
 * get_connected_terminals_by_serial RPC (deduplicates by serial).
 */
export async function getAdminConnectedTerminals(
  merchantId: string,
  locationId?: string | null
) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data, error } = await (supabase as any).rpc(
      'get_connected_terminals_by_serial',
      {
        p_merchant_id: merchantId,
        p_location_id: locationId && locationId !== 'all' ? locationId : null,
      }
    )

    if (error) {
      console.error('[getAdminConnectedTerminals] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    return { success: true, data: (data || []) as ConnectedTerminalRow[], error: null }
  } catch (error) {
    console.error('[getAdminConnectedTerminals] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// ============================================================================
// CREATE Operations
// ============================================================================

/**
 * Create a new payment terminal (admin access)
 */
export async function adminCreateTerminal(
  merchantId: string,
  input: CreatePaymentTerminalInput
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Validate RegisterId uniqueness per merchant (Dejavoo only — Castles/Valor
    // don't have a register id, so skip the check when it's absent).
    if (input.register_id) {
      const { data: existingRegisterId } = await supabase
        .from('payment_terminals')
        .select('id')
        .eq('merchant_id', merchantId)
        .eq('register_id', input.register_id)
        .single()

      if (existingRegisterId) {
        return {
          success: false,
          error: `Terminal with Register ID "${input.register_id}" already exists`,
          data: null,
        }
      }
    }

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('payment_terminals')
      .insert({
        merchant_id: merchantId,
        location_id: input.location_id,
        station_id: input.station_id || null,
        terminal_name: input.terminal_name,
        terminal_type: input.terminal_type,
        terminal_model: input.terminal_model || null,
        serial_number: normalizeSerial(input.serial_number),
        valor_epi: input.valor_epi?.trim() || null,
        auth_key: input.auth_key || null,
        register_id: input.register_id || null,
        auth_key_encrypted: input.auth_key ? bcrypt.hashSync(input.auth_key) : null,
        api_environment: input.api_environment || 'sandbox',
        connection_type:
          input.connection_type ||
          (input.terminal_type === 'castles' || input.terminal_type === 'valor' ? 'local' : 'cloud'),
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
        // valor_epi is a real column but not yet in the generated types; cast below.
      } as any)
      .select()
      .single()

    if (error) {
      console.error('[adminCreateTerminal] Error:', error)
      if (isDuplicateSerialError(error)) {
        return {
          success: false,
          error: `A terminal with serial "${normalizeSerial(input.serial_number)}" already exists at this location.`,
          data: null,
        }
      }
      return { success: false, error: error.message, data: null }
    }

    // Vault the auth_key and store the secret UUID pointer (Dejavoo only).
    if (input.auth_key) {
      const { error: vaultErr } = await supabase.rpc('upsert_terminal_vault_secret', {
        p_terminal_id: data.id,
        p_auth_key: input.auth_key,
      })
      if (vaultErr) {
        console.error('[adminCreateTerminal] Vault error:', vaultErr)
      }
    }

    // Mask auth_key in response
    const maskedData = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
    }

    await logAdminAction('TERMINAL_PAIRED', {
      merchantId,
      locationId: input.location_id,
      resourceType: 'payment_terminal',
      resourceId: data.id,
      resourceName: input.terminal_name,
      changes: {
        after: {
          terminal_name: input.terminal_name,
          terminal_type: input.terminal_type,
          serial_number: normalizeSerial(input.serial_number),
          station_id: input.station_id || null,
          location_id: input.location_id,
        },
      },
      metadata: {
        register_id: input.register_id,
        serial_number: normalizeSerial(input.serial_number),
        created_by_admin: userId,
        source: 'adminCreateTerminal',
      },
    })

    return { success: true, data: maskedData as PaymentTerminal, error: null }
  } catch (error) {
    console.error('[adminCreateTerminal] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// ============================================================================
// UPDATE Operations
// ============================================================================

/**
 * Update a payment terminal (admin access)
 */
export async function adminUpdateTerminal(
  terminalId: string,
  input: UpdatePaymentTerminalInput
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()
    const { data: beforeTerminal } = await supabase
      .from('payment_terminals')
      .select('id, merchant_id, location_id, terminal_name, terminal_model, serial_number, station_id, api_environment, connection_type, is_active')
      .eq('id', terminalId)
      .single()

    // Identity guard: never silently overwrite a terminal's serial_number with a
    // DIFFERENT non-null serial. The serial is the physical-device identity and
    // settlement_batches are keyed to it — a different serial means a different
    // device, which must be registered as its own row. Filling a null serial or
    // clearing it is still allowed; only a non-null → different-non-null change
    // is blocked unless the caller passes confirmSerialChange.
    if (input.serial_number !== undefined) {
      const incoming = normalizeSerial(input.serial_number)
      const existing = normalizeSerial(beforeTerminal?.serial_number)
      if (existing && incoming && existing !== incoming && !input.confirmSerialChange) {
        return {
          success: false,
          error:
            `This looks like a different device (registered S/N ${existing} ≠ ${incoming}). ` +
            `A terminal's serial is its physical identity and its settlement batches are keyed to it. ` +
            `Register the replacement as a NEW terminal instead of editing this one.`,
          code: 'SERIAL_IDENTITY_MISMATCH',
          data: null,
        }
      }
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (input.terminal_name !== undefined) updateData.terminal_name = input.terminal_name
    if (input.terminal_model !== undefined) updateData.terminal_model = input.terminal_model
    if (input.serial_number !== undefined) updateData.serial_number = normalizeSerial(input.serial_number)
    if (input.auth_key !== undefined) updateData.auth_key = input.auth_key
    if (input.register_id !== undefined) updateData.register_id = input.register_id
    if (input.api_environment !== undefined) updateData.api_environment = input.api_environment
    if (input.api_base_url !== undefined) updateData.api_base_url = input.api_base_url
    if (input.spin_proxy_timeout !== undefined) updateData.spin_proxy_timeout = input.spin_proxy_timeout
    if (input.connection_type !== undefined) updateData.connection_type = input.connection_type
    if (input.local_ip_address !== undefined) updateData.local_ip_address = input.local_ip_address
    if (input.local_port !== undefined) updateData.local_port = input.local_port
    if (input.auto_settle !== undefined) updateData.auto_settle = input.auto_settle
    if (input.settle_time !== undefined) updateData.settle_time = input.settle_time
    if (input.valor_epi !== undefined) updateData.valor_epi = input.valor_epi?.trim() || null
    if (input.print_merchant_receipt !== undefined) updateData.print_merchant_receipt = input.print_merchant_receipt
    if (input.print_customer_receipt !== undefined) updateData.print_customer_receipt = input.print_customer_receipt
    if (input.signature_threshold !== undefined) updateData.signature_threshold = input.signature_threshold
    if (input.supports_contactless !== undefined) updateData.supports_contactless = input.supports_contactless
    if (input.supports_emv !== undefined) updateData.supports_emv = input.supports_emv
    if (input.supports_manual_entry !== undefined) updateData.supports_manual_entry = input.supports_manual_entry
    if (input.supports_ebt !== undefined) updateData.supports_ebt = input.supports_ebt
    if (input.supports_debit !== undefined) updateData.supports_debit = input.supports_debit
    if (input.supports_tip_adjust !== undefined) updateData.supports_tip_adjust = input.supports_tip_adjust
    if (input.is_active !== undefined) updateData.is_active = input.is_active

    const { data, error } = await supabase
      .from('payment_terminals')
      .update(updateData)
      .eq('id', terminalId)
      .select()
      .single()

    if (error) {
      console.error('[adminUpdateTerminal] Error:', error)
      if (isDuplicateSerialError(error)) {
        return {
          success: false,
          error: `A terminal with serial "${normalizeSerial(input.serial_number)}" already exists at this location.`,
          data: null,
        }
      }
      return { success: false, error: error.message, data: null }
    }

    // Re-vault auth_key if it was updated
    if (input.auth_key !== undefined) {
      const { error: vaultErr } = await supabase.rpc('upsert_terminal_vault_secret', {
        p_terminal_id: terminalId,
        p_auth_key: input.auth_key,
      })
      if (vaultErr) {
        console.error('[adminUpdateTerminal] Vault error:', vaultErr)
      }
    }

    // Mask auth_key in response
    const maskedData = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
    }

    await logAdminAction('DEVICE_CONFIG_CHANGED', {
      merchantId: data.merchant_id,
      locationId: data.location_id,
      resourceType: 'payment_terminal',
      resourceId: terminalId,
      resourceName: data.terminal_name,
      changes: {
        before: beforeTerminal as unknown as Record<string, unknown>,
        after: updateData,
      },
      metadata: {
        updated_by_admin: userId,
        source: 'adminUpdateTerminal',
      },
    })

    return { success: true, data: maskedData as PaymentTerminal, error: null }
  } catch (error) {
    console.error('[adminUpdateTerminal] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * Link a terminal to a station (admin access)
 */
export async function adminLinkTerminalToStation(
  terminalId: string,
  stationId: string
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Check if station already has a terminal
    const { data: existingTerminal } = await supabase
      .from('payment_terminals')
      .select('id, terminal_name')
      .eq('station_id', stationId)
      .single()

    if (existingTerminal) {
      return {
        success: false,
        error: `Station already has terminal "${existingTerminal.terminal_name}" assigned`,
        data: null,
      }
    }

    const { data, error } = await supabase
      .from('payment_terminals')
      .update({
        station_id: stationId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', terminalId)
      .select()
      .single()

    if (error) {
      console.error('[adminLinkTerminalToStation] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Mask auth_key in response
    const maskedData = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
    }

    // Fetch station name for audit
    const { data: station } = await supabase
      .from('stations')
      .select('station_name')
      .eq('id', stationId)
      .single()

    await logAdminAction('TERMINAL_PAIRED', {
      merchantId: data.merchant_id,
      locationId: data.location_id,
      resourceType: 'payment_terminal',
      resourceId: terminalId,
      resourceName: data.terminal_name,
      changes: {
        station_id: {
          old: null,
          new: stationId,
        },
      },
      metadata: {
        station_id: stationId,
        station_name: station?.station_name,
        linked_by_admin: userId,
        source: 'adminLinkTerminalToStation',
      },
    })

    return { success: true, data: maskedData as PaymentTerminal, error: null }
  } catch (error) {
    console.error('[adminLinkTerminalToStation] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * Unlink a terminal from its station (admin access)
 */
export async function adminUnlinkTerminalFromStation(terminalId: string) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()
    const { data: beforeTerminal } = await supabase
      .from('payment_terminals')
      .select('station_id')
      .eq('id', terminalId)
      .single()

    const { data, error } = await supabase
      .from('payment_terminals')
      .update({
        station_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', terminalId)
      .select()
      .single()

    if (error) {
      console.error('[adminUnlinkTerminalFromStation] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Mask auth_key in response
    const maskedData = {
      ...data,
      auth_key: maskAuthKey(data.auth_key),
    }

    await logAdminAction('TERMINAL_UNPAIRED', {
      merchantId: data.merchant_id,
      locationId: data.location_id,
      resourceType: 'payment_terminal',
      resourceId: terminalId,
      resourceName: data.terminal_name,
      changes: {
        station_id: {
          old: beforeTerminal?.station_id || null,
          new: null,
        },
      },
      metadata: {
        unlinked_by_admin: userId,
        source: 'adminUnlinkTerminalFromStation',
      },
    })

    return { success: true, data: maskedData as PaymentTerminal, error: null }
  } catch (error) {
    console.error('[adminUnlinkTerminalFromStation] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// ============================================================================
// DELETE Operations
// ============================================================================

/**
 * Delete a payment terminal (admin access)
 */
export async function adminDeleteTerminal(terminalId: string) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Fetch details before delete
    const { data: terminal } = await supabase
      .from('payment_terminals')
      .select('terminal_name, merchant_id, location_id, register_id')
      .eq('id', terminalId)
      .single()

    const { error } = await supabase
      .from('payment_terminals')
      .delete()
      .eq('id', terminalId)

    if (error) {
      console.error('[adminDeleteTerminal] Error:', error)
      return { success: false, error: error.message }
    }

    // Log audit event
    if (terminal) {
      await logAdminAction('TERMINAL_UNPAIRED', {
        merchantId: terminal.merchant_id,
        locationId: terminal.location_id,
        resourceType: 'payment_terminal',
        resourceId: terminalId,
        resourceName: terminal.terminal_name,
        changes: {
          before: {
            terminal_name: terminal.terminal_name,
            register_id: terminal.register_id,
            deleted: false,
          },
          after: {
            deleted: true,
          },
        },
        metadata: {
          register_id: terminal.register_id,
          deleted_by_admin: userId,
          source: 'adminDeleteTerminal',
        },
      })
    }

    return { success: true, error: null }
  } catch (error) {
    console.error('[adminDeleteTerminal] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// Terminal Actions
// ============================================================================

/**
 * Test terminal connection (admin access)
 */
export async function adminTestTerminalConnection(terminalId: string) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    // Get terminal details
    const { data: terminal, error: fetchError } = await supabase
      .from('payment_terminals')
      .select('*')
      .eq('id', terminalId)
      .single()

    if (fetchError || !terminal) {
      return {
        success: false,
        error: 'Terminal not found',
        status: 'NotFound',
      }
    }

    // Call Dejavoo SPIN API
    const myHeaders = new Headers()
    myHeaders.append('Content-Type', 'application/json')

    const requestOptions = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow' as RequestRedirect,
    }

    let isOnline = false
    let status = 'Offline'

    // Determine online_since
    let onlineSince = (terminal.metadata as any)?.online_since

    // Retrieve the real auth_key from vault — never read plaintext from the row
    const { data: authKey, error: vaultErr } = await supabase.rpc(
      'get_payment_terminal_credentials',
      { p_terminal_id: terminalId },
    )
    if (vaultErr || !authKey) {
      console.error('[adminTestTerminalConnection] Vault error:', vaultErr)
      return { success: false, status: 'Error', error: 'Could not retrieve terminal credentials' }
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_DEJAVOO_SPIN_API}/spin/v2/Common/TerminalStatus?request.registerId=${terminal.register_id}&request.authkey=${authKey}`,
        requestOptions
      )
      const result = await response.json()

      if (result.TerminalStatus === 'Online') {
        isOnline = true
        status = 'Online'
      }
    } catch (apiError) {
      console.error('[adminTestTerminalConnection] API Error:', apiError)
    }

    if (isOnline) {
      if (terminal.last_connection_status !== 'Online' || !onlineSince) {
        onlineSince = new Date().toISOString()
      }
    } else {
      onlineSince = null
    }

    const updatedMetadata = {
      ...terminal.metadata,
      online_since: onlineSince,
    }

    // Update terminal status
    await supabase
      .from('payment_terminals')
      .update({
        is_connected: isOnline,
        last_connection_test_at: new Date().toISOString(),
        last_connection_status: status,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', terminalId)

    return {
      success: true,
      status,
      error: isOnline ? null : 'Terminal not responding',
    }
  } catch (error) {
    console.error('[adminTestTerminalConnection] Exception:', error)
    return {
      success: false,
      status: 'Error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
