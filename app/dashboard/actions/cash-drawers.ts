'use server'

// ============================================================================
// Cash Drawers — Merchant Server Actions
// ============================================================================
// CRUD on public.cash_drawers and lifecycle (open/close) on
// public.cash_drawer_sessions for the merchant dashboard.
//
// Operation recording (cash_sale, paid_in/out, no_sale, drops) is NOT done
// here — that's POS-tablet-only via the record_cash_operation RPC. This file
// covers the stopgap web flow until the device registry + billing rollout.
// ============================================================================

import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LogAuditEvent } from './audit-logs'
import { revalidatePath } from 'next/cache'

const DRAWER_NAME_MAX = 100

export interface CashDrawerListItem {
  id: string
  merchant_id: string
  location_id: string
  location_name: string | null
  name: string
  drawer_number: number | null
  station_id: string | null
  station_name: string | null
  is_active: boolean
  is_open: boolean
  current_session_id: string | null
  host_printer_id: string | null
  host_printer_name: string | null
  current_session?: {
    id: string
    opening_amount: number
    opened_at: string
    business_date: string
    opened_by: string
    opened_by_name: string | null
  } | null
}

interface ResolvedMerchant {
  merchantId: string
}

async function resolveMerchantId(clerkOrgId: string): Promise<ResolvedMerchant | null> {
  if (!clerkOrgId) return null
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('merchants')
    .select('id')
    .eq('clerk_org_id', clerkOrgId)
    .single()

  if (error || !data) {
    console.error('[cash-drawers] Failed to resolve merchant for org', clerkOrgId, error)
    return null
  }
  return { merchantId: data.id }
}

async function resolveStaffProfileId(): Promise<{ userId: string; staffProfileId: string } | null> {
  const { userId } = await auth()
  if (!userId) return null

  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('staff_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data?.id) return null
  return { userId, staffProfileId: data.id }
}

// ============================================================================
// LIST
// ============================================================================

export async function listCashDrawers(
  clerkOrgId: string,
  locationId: string | 'all'
): Promise<{ success: true; data: CashDrawerListItem[] } | { success: false; error: string }> {
  try {
    const resolved = await resolveMerchantId(clerkOrgId)
    if (!resolved) return { success: false, error: 'Merchant not found' }

    const supabase = createServiceRoleClient()
    let query = supabase
      .from('cash_drawers')
      .select(
        `
        id,
        merchant_id,
        location_id,
        name,
        drawer_number,
        station_id,
        is_active,
        is_open,
        current_session_id,
        location:locations!cash_drawers_location_id_fkey(name),
        station:stations!cash_drawers_station_id_fkey(station_name)
        `
      )
      .eq('merchant_id', resolved.merchantId)
      .order('drawer_number', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (locationId && locationId !== 'all') {
      query = query.eq('location_id', locationId)
    }

    const { data, error } = await query
    if (error) {
      console.error('[listCashDrawers] Query error:', error)
      return { success: false, error: error.message }
    }

    // Fetch the active sessions in a second query — no FK exists from
    // cash_drawers.current_session_id back to cash_drawer_sessions, so
    // PostgREST can't embed the relation inline.
    const sessionIds = (data ?? [])
      .map((row: any) => row.current_session_id)
      .filter((id: string | null): id is string => !!id)

    let sessionMap = new Map<
      string,
      {
        id: string
        opening_amount: number
        opened_at: string
        business_date: string
        opened_by: string
        opened_by_name: string | null
      }
    >()

    if (sessionIds.length > 0) {
      const { data: sessions, error: sessionsError } = await supabase
        .from('cash_drawer_sessions')
        .select(
          `
          id,
          opening_amount,
          opened_at,
          business_date,
          opened_by,
          opened_by_profile:staff_profiles!cash_drawer_sessions_opened_by_fkey(first_name, last_name, display_name)
          `
        )
        .in('id', sessionIds)

      if (sessionsError) {
        console.error('[listCashDrawers] Sessions query error:', sessionsError)
      } else {
        for (const s of sessions ?? []) {
          const row = s as any
          const profile = Array.isArray(row.opened_by_profile)
            ? row.opened_by_profile[0]
            : row.opened_by_profile
          const openedByName = profile
            ? profile.display_name ||
              [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
              null
            : null
          sessionMap.set(row.id, {
            id: row.id,
            opening_amount: Number(row.opening_amount),
            opened_at: row.opened_at,
            business_date: row.business_date,
            opened_by: row.opened_by,
            opened_by_name: openedByName,
          })
        }
      }
    }

    // Host-printer binding (cash_drawers.host_printer_id → printers) is fetched
    // in a separate, best-effort query so a DB that predates the host_printer_id
    // migration never breaks the whole list — it just yields no binding.
    const hostMap = new Map<string, { id: string | null; name: string | null }>()
    const drawerIds = (data ?? []).map((row: any) => row.id)
    if (drawerIds.length > 0) {
      const { data: bindings, error: bindingsError } = await supabase
        .from('cash_drawers')
        .select(
          `id, host_printer_id, host_printer:printers!cash_drawers_host_printer_id_fkey(printer_name)`
        )
        .in('id', drawerIds)
      if (bindingsError) {
        console.warn('[listCashDrawers] host_printer binding lookup skipped:', bindingsError.message)
      } else {
        for (const b of (bindings ?? []) as any[]) {
          const hp = Array.isArray(b.host_printer) ? b.host_printer[0] : b.host_printer
          hostMap.set(b.id, { id: b.host_printer_id ?? null, name: hp?.printer_name ?? null })
        }
      }
    }

    const mapped: CashDrawerListItem[] = (data ?? []).map((row: any) => {
      const location = Array.isArray(row.location) ? row.location[0] : row.location
      const station = Array.isArray(row.station) ? row.station[0] : row.station
      const host = hostMap.get(row.id) ?? { id: null, name: null }
      const session = row.current_session_id
        ? sessionMap.get(row.current_session_id) ?? null
        : null

      return {
        id: row.id,
        merchant_id: row.merchant_id,
        location_id: row.location_id,
        location_name: location?.name ?? null,
        name: row.name,
        drawer_number: row.drawer_number,
        station_id: row.station_id,
        station_name: station?.station_name ?? null,
        is_active: row.is_active,
        is_open: row.is_open,
        current_session_id: row.current_session_id,
        host_printer_id: host.id,
        host_printer_name: host.name,
        current_session: session,
      }
    })

    return { success: true, data: mapped }
  } catch (error) {
    console.error('[listCashDrawers] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// CREATE
// ============================================================================

export async function createCashDrawer(
  clerkOrgId: string,
  input: {
    locationId: string
    name: string
    drawer_number?: number | null
    station_id?: string | null
  }
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const resolved = await resolveMerchantId(clerkOrgId)
    if (!resolved) return { success: false, error: 'Merchant not found' }

    const name = input.name?.trim() ?? ''
    if (!name) return { success: false, error: 'Drawer name is required' }
    if (name.length > DRAWER_NAME_MAX) {
      return { success: false, error: `Drawer name must be ≤ ${DRAWER_NAME_MAX} characters` }
    }
    if (!input.locationId) return { success: false, error: 'Location is required' }

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('cash_drawers')
      .insert({
        merchant_id: resolved.merchantId,
        location_id: input.locationId,
        name,
        drawer_number: input.drawer_number ?? null,
        station_id: input.station_id || null,
        is_active: true,
        is_open: false,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[createCashDrawer] Insert error:', error)
      return { success: false, error: error.message }
    }

    await LogAuditEvent({
      merchantId: resolved.merchantId,
      locationId: input.locationId,
      action: 'Cash Drawer: Created',
      actionCategory: 'cash_drawer',
      severity: 'info',
      resourceType: 'cash_drawer',
      resourceId: data.id,
      resourceName: name,
      changes: {
        before: {},
        after: {
          name,
          drawer_number: input.drawer_number ?? null,
          station_id: input.station_id || null,
          location_id: input.locationId,
        },
      },
    })

    revalidatePath('/dashboard/cash-drawers')
    return { success: true, id: data.id }
  } catch (error) {
    console.error('[createCashDrawer] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// UPDATE
// ============================================================================

export async function updateCashDrawer(
  clerkOrgId: string,
  drawerId: string,
  input: {
    name?: string
    drawer_number?: number | null
    station_id?: string | null
    is_active?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const resolved = await resolveMerchantId(clerkOrgId)
    if (!resolved) return { success: false, error: 'Merchant not found' }

    const supabase = createServerSupabaseClient()
    const { data: before, error: readError } = await supabase
      .from('cash_drawers')
      .select('id, merchant_id, location_id, name, drawer_number, station_id, is_active, is_open, current_session_id')
      .eq('id', drawerId)
      .eq('merchant_id', resolved.merchantId)
      .single()

    if (readError || !before) {
      return { success: false, error: 'Cash drawer not found' }
    }

    const updates: Record<string, unknown> = {}
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) return { success: false, error: 'Drawer name is required' }
      if (name.length > DRAWER_NAME_MAX) {
        return { success: false, error: `Drawer name must be ≤ ${DRAWER_NAME_MAX} characters` }
      }
      updates.name = name
    }
    if (input.drawer_number !== undefined) updates.drawer_number = input.drawer_number ?? null
    if (input.station_id !== undefined) updates.station_id = input.station_id || null
    if (input.is_active !== undefined) {
      if (input.is_active === false && before.current_session_id) {
        return { success: false, error: 'Close the open session before deactivating this drawer' }
      }
      updates.is_active = input.is_active
    }

    if (Object.keys(updates).length === 0) return { success: true }

    updates.updated_at = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('cash_drawers')
      .update(updates)
      .eq('id', drawerId)

    if (updateError) {
      console.error('[updateCashDrawer] Update error:', updateError)
      return { success: false, error: updateError.message }
    }

    await LogAuditEvent({
      merchantId: resolved.merchantId,
      locationId: before.location_id,
      action: input.is_active === false ? 'Cash Drawer: Deactivated' : 'Cash Drawer: Updated',
      actionCategory: 'cash_drawer',
      severity: 'info',
      resourceType: 'cash_drawer',
      resourceId: drawerId,
      resourceName: (updates.name as string) ?? before.name,
      changes: {
        before: {
          name: before.name,
          drawer_number: before.drawer_number,
          station_id: before.station_id,
          is_active: before.is_active,
        },
        after: updates,
      },
    })

    revalidatePath('/dashboard/cash-drawers')
    return { success: true }
  } catch (error) {
    console.error('[updateCashDrawer] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// OPEN SESSION
// ============================================================================

export async function openCashDrawerSession(
  clerkOrgId: string,
  input: {
    cashDrawerId: string
    openingAmount: number
    openingCountDetails?: Record<string, unknown> | null
    isBlindCount?: boolean
    businessDate?: string // YYYY-MM-DD
  }
): Promise<{ success: true; sessionId: string } | { success: false; error: string }> {
  try {
    const resolved = await resolveMerchantId(clerkOrgId)
    if (!resolved) return { success: false, error: 'Merchant not found' }

    const staff = await resolveStaffProfileId()
    if (!staff) {
      return {
        success: false,
        error:
          'No staff profile is linked to your account. Have an admin add you as merchant staff before opening a cash drawer session.',
      }
    }

    if (!Number.isFinite(input.openingAmount) || input.openingAmount < 0) {
      return { success: false, error: 'Opening amount must be ≥ 0' }
    }

    const supabase = createServerSupabaseClient()
    const { data: drawer, error: drawerError } = await supabase
      .from('cash_drawers')
      .select('id, merchant_id, location_id, name, is_active, is_open, current_session_id')
      .eq('id', input.cashDrawerId)
      .eq('merchant_id', resolved.merchantId)
      .single()

    if (drawerError || !drawer) {
      return { success: false, error: 'Cash drawer not found' }
    }
    if (!drawer.is_active) {
      return { success: false, error: 'Cash drawer is deactivated' }
    }
    if (drawer.is_open || drawer.current_session_id) {
      return { success: false, error: 'A session is already open for this drawer' }
    }

    const businessDate = input.businessDate ?? new Date().toISOString().slice(0, 10)

    const { data: session, error: insertError } = await supabase
      .from('cash_drawer_sessions')
      .insert({
        cash_drawer_id: drawer.id,
        merchant_id: drawer.merchant_id,
        location_id: drawer.location_id,
        business_date: businessDate,
        opened_by: staff.staffProfileId,
        opening_amount: input.openingAmount,
        opening_count_verified: !!input.openingCountDetails,
        opening_count_details: input.openingCountDetails ?? null,
        expected_cash: input.openingAmount,
        is_blind_count: input.isBlindCount ?? true,
        status: 'open',
      })
      .select('id')
      .single()

    if (insertError || !session) {
      console.error('[openCashDrawerSession] Insert error:', insertError)
      return { success: false, error: insertError?.message ?? 'Failed to open session' }
    }

    const { error: drawerUpdateError } = await supabase
      .from('cash_drawers')
      .update({
        current_session_id: session.id,
        is_open: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', drawer.id)

    if (drawerUpdateError) {
      // Best-effort rollback: close the session we just opened so state stays consistent.
      await supabase.from('cash_drawer_sessions').delete().eq('id', session.id)
      console.error('[openCashDrawerSession] Drawer update error:', drawerUpdateError)
      return { success: false, error: drawerUpdateError.message }
    }

    await LogAuditEvent({
      merchantId: drawer.merchant_id,
      locationId: drawer.location_id,
      action: 'Cash Drawer: Session opened (web)',
      actionCategory: 'cash_drawer',
      severity: 'info',
      resourceType: 'cash_drawer_session',
      resourceId: session.id,
      resourceName: drawer.name,
      metadata: {
        opening_amount: input.openingAmount,
        is_blind_count: input.isBlindCount ?? true,
        business_date: businessDate,
        opened_by_staff_id: staff.staffProfileId,
        source: 'web',
      },
    })

    revalidatePath('/dashboard/cash-drawers')
    return { success: true, sessionId: session.id }
  } catch (error) {
    console.error('[openCashDrawerSession] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// CLOSE SESSION
// ============================================================================

export async function closeCashDrawerSession(
  clerkOrgId: string,
  input: {
    sessionId: string
    closingAmount: number
    closingCountDetails?: Record<string, unknown> | null
    varianceNotes?: string | null
  }
): Promise<
  | { success: true; expectedCash: number; variance: number }
  | { success: false; error: string }
> {
  try {
    const resolved = await resolveMerchantId(clerkOrgId)
    if (!resolved) return { success: false, error: 'Merchant not found' }

    const staff = await resolveStaffProfileId()
    if (!staff) {
      return {
        success: false,
        error:
          'No staff profile is linked to your account. Have an admin add you as merchant staff before closing a cash drawer session.',
      }
    }

    if (!Number.isFinite(input.closingAmount) || input.closingAmount < 0) {
      return { success: false, error: 'Closing amount must be ≥ 0' }
    }

    const supabase = createServerSupabaseClient()
    const { data: session, error: sessionError } = await supabase
      .from('cash_drawer_sessions')
      .select(
        'id, cash_drawer_id, merchant_id, location_id, status, opening_amount, expected_cash'
      )
      .eq('id', input.sessionId)
      .eq('merchant_id', resolved.merchantId)
      .single()

    if (sessionError || !session) {
      return { success: false, error: 'Session not found' }
    }
    if (session.status !== 'open') {
      return { success: false, error: 'Session is not open' }
    }

    // Recompute expected_cash from operations to defend against stale values.
    const { data: ops, error: opsError } = await supabase
      .from('cash_drawer_operations')
      .select('operation_type, amount')
      .eq('session_id', session.id)

    if (opsError) {
      console.error('[closeCashDrawerSession] Ops query error:', opsError)
      return { success: false, error: opsError.message }
    }

    const opsDelta = (ops ?? []).reduce((sum, op: any) => {
      const amt = Number(op.amount) || 0
      switch (op.operation_type) {
        case 'cash_sale':
        case 'pay_in':
          return sum + amt
        case 'cash_refund':
        case 'pay_out':
        case 'cash_drop':
        case 'tip_out':
          return sum - amt
        default:
          return sum
      }
    }, 0)

    const opening = Number(session.opening_amount) || 0
    const expected = Number((opening + opsDelta).toFixed(2))
    const variance = Number((input.closingAmount - expected).toFixed(2))

    const { error: closeError } = await supabase
      .from('cash_drawer_sessions')
      .update({
        closing_amount: input.closingAmount,
        closing_count_verified: !!input.closingCountDetails,
        closing_count_details: input.closingCountDetails ?? null,
        expected_cash: expected,
        variance,
        variance_notes: input.varianceNotes?.trim() || null,
        closed_by: staff.staffProfileId,
        closed_at: new Date().toISOString(),
        status: 'closed',
      })
      .eq('id', session.id)

    if (closeError) {
      console.error('[closeCashDrawerSession] Close error:', closeError)
      return { success: false, error: closeError.message }
    }

    const { error: drawerUpdateError } = await supabase
      .from('cash_drawers')
      .update({
        current_session_id: null,
        is_open: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.cash_drawer_id)

    if (drawerUpdateError) {
      // Session is already closed (immutable); best we can do is log loudly.
      console.error('[closeCashDrawerSession] Drawer flag update error:', drawerUpdateError)
    }

    await LogAuditEvent({
      merchantId: session.merchant_id,
      locationId: session.location_id,
      action: 'Cash Drawer: Session closed (web)',
      actionCategory: 'cash_drawer',
      severity: Math.abs(variance) > 0.01 ? 'warning' : 'info',
      resourceType: 'cash_drawer_session',
      resourceId: session.id,
      resourceName: 'Cash drawer session',
      changes: {
        before: { status: 'open', expected_cash: session.expected_cash },
        after: {
          status: 'closed',
          closing_amount: input.closingAmount,
          expected_cash: expected,
          variance,
        },
      },
      metadata: {
        closed_by_staff_id: staff.staffProfileId,
        source: 'web',
        variance_notes: input.varianceNotes?.trim() || null,
      },
    })

    revalidatePath('/dashboard/cash-drawers')
    return { success: true, expectedCash: expected, variance }
  } catch (error) {
    console.error('[closeCashDrawerSession] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
