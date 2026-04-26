'use server'

// ============================================================================
// HQ Admin: Cash Drawers Management
// ============================================================================
// Lets HQ admins create / edit / deactivate cash drawers on a merchant's
// behalf. Open/close session is intentionally NOT exposed here — `opened_by`
// must be a real merchant staff_profile, so merchants do that themselves on
// /dashboard/cash-drawers.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import { revalidatePath } from 'next/cache'

const DRAWER_NAME_MAX = 100

export interface AdminCashDrawerListItem {
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
}

// ============================================================================
// LIST
// ============================================================================

export async function adminListCashDrawers(
  merchantId: string,
  locationId: string | 'all' = 'all'
): Promise<
  | { success: true; data: AdminCashDrawerListItem[] }
  | { success: false; error: string }
> {
  try {
    await assertHQPermission('hq.merchant.view')

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
      .eq('merchant_id', merchantId)
      .order('drawer_number', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (locationId && locationId !== 'all') {
      query = query.eq('location_id', locationId)
    }

    const { data, error } = await query
    if (error) {
      console.error('[adminListCashDrawers] Query error:', error)
      return { success: false, error: error.message }
    }

    const mapped: AdminCashDrawerListItem[] = (data ?? []).map((row: any) => {
      const location = Array.isArray(row.location) ? row.location[0] : row.location
      const station = Array.isArray(row.station) ? row.station[0] : row.station
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
      }
    })

    return { success: true, data: mapped }
  } catch (error) {
    console.error('[adminListCashDrawers] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// CREATE
// ============================================================================

export async function adminCreateCashDrawer(
  merchantId: string,
  input: {
    locationId: string
    name: string
    drawer_number?: number | null
    station_id?: string | null
  }
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const name = input.name?.trim() ?? ''
    if (!name) return { success: false, error: 'Drawer name is required' }
    if (name.length > DRAWER_NAME_MAX) {
      return { success: false, error: `Drawer name must be ≤ ${DRAWER_NAME_MAX} characters` }
    }
    if (!input.locationId) return { success: false, error: 'Location is required' }

    const supabase = createServiceRoleClient()

    // Verify the location actually belongs to this merchant — prevents an
    // HQ admin from accidentally attaching a drawer to a location they're
    // looking at in another merchant context.
    const { data: location } = await supabase
      .from('locations')
      .select('id, merchant_id')
      .eq('id', input.locationId)
      .single()

    if (!location || location.merchant_id !== merchantId) {
      return { success: false, error: 'Location does not belong to this merchant' }
    }

    const { data, error } = await supabase
      .from('cash_drawers')
      .insert({
        merchant_id: merchantId,
        location_id: input.locationId,
        name,
        drawer_number: input.drawer_number ?? null,
        station_id: input.station_id || null,
        is_active: true,
        is_open: false,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[adminCreateCashDrawer] Insert error:', error)
      return { success: false, error: error?.message ?? 'Failed to create drawer' }
    }

    await LogAuditEvent({
      merchantId,
      locationId: input.locationId,
      action: 'HQ Admin: Cash Drawer Created',
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
      metadata: { created_by_admin: userId, source: 'hq_admin' },
    })

    revalidatePath(`/manage/merchants/${merchantId}`)
    return { success: true, id: data.id }
  } catch (error) {
    console.error('[adminCreateCashDrawer] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// UPDATE / DEACTIVATE
// ============================================================================

export async function adminUpdateCashDrawer(
  merchantId: string,
  drawerId: string,
  input: {
    name?: string
    drawer_number?: number | null
    station_id?: string | null
    is_active?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServiceRoleClient()
    const { data: before, error: readError } = await supabase
      .from('cash_drawers')
      .select(
        'id, merchant_id, location_id, name, drawer_number, station_id, is_active, is_open, current_session_id'
      )
      .eq('id', drawerId)
      .eq('merchant_id', merchantId)
      .single()

    if (readError || !before) return { success: false, error: 'Cash drawer not found' }

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
      console.error('[adminUpdateCashDrawer] Update error:', updateError)
      return { success: false, error: updateError.message }
    }

    await LogAuditEvent({
      merchantId,
      locationId: before.location_id,
      action:
        input.is_active === false
          ? 'HQ Admin: Cash Drawer Deactivated'
          : 'HQ Admin: Cash Drawer Updated',
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
      metadata: { updated_by_admin: userId, source: 'hq_admin' },
    })

    revalidatePath(`/manage/merchants/${merchantId}`)
    return { success: true }
  } catch (error) {
    console.error('[adminUpdateCashDrawer] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function adminDeactivateCashDrawer(
  merchantId: string,
  drawerId: string
): Promise<{ success: boolean; error?: string }> {
  return adminUpdateCashDrawer(merchantId, drawerId, { is_active: false })
}
