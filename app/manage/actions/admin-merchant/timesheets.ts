'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { StaffShift } from '@/types/staff'
import { startOfDay, endOfDay } from 'date-fns'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

// ============================================================================
// TYPES
// ============================================================================

type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

interface TimesheetFilters {
  dateFrom: string // ISO date string
  dateTo: string // ISO date string
  locationIds?: string[]
  employeeIds?: string[]
}

interface TimesheetResources {
  staff: {
    id: string
    first_name: string
    last_name: string
    avatar_url: string | null
  }[]
  locations: { id: string; name: string }[]
}

// ============================================================================
// GET TIMESHEETS
// ============================================================================

export async function getAdminTimesheets(
  merchantId: string,
  filters: TimesheetFilters
): Promise<MutationResult<StaffShift[]>> {
  await assertHQPermission('hq.merchant.view')

  try {
    const supabase = createServiceRoleClient()

    const from = startOfDay(new Date(filters.dateFrom)).toISOString()
    const to = endOfDay(new Date(filters.dateTo)).toISOString()

    let query = supabase
      .from('staff_shifts')
      .select(
        `
        id, 
        status, 
        clock_in_time, 
        clock_out_time, 
        break_logs, 
        hourly_rate_snapshot, 
        created_at,
        merchant_id,
        location_id,
        staff_profile_id,
        staff_profile:staff_profiles(first_name, last_name, avatar_url),
        location:locations(name)
      `
      )
      .eq('merchant_id', merchantId)
      .gte('clock_in_time', from)
      .lte('clock_in_time', to)
      .order('clock_in_time', { ascending: false })

    if (filters.locationIds && filters.locationIds.length > 0) {
      query = query.in('location_id', filters.locationIds)
    }

    if (filters.employeeIds && filters.employeeIds.length > 0) {
      query = query.in('staff_profile_id', filters.employeeIds)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return { success: true, data: (data || []) as unknown as StaffShift[] }
  } catch (error) {
    console.error('[getAdminTimesheets] error', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch timesheets',
    }
  }
}

// ============================================================================
// GET TIMESHEET RESOURCES
// ============================================================================

export async function getAdminTimesheetResources(
  merchantId: string
): Promise<MutationResult<TimesheetResources>> {
  await assertHQPermission('hq.merchant.view')

  try {
    const supabase = createServerSupabaseClient()

    const [staffRes, locRes] = await Promise.all([
      supabase
        .from('staff_profiles')
        .select('id, first_name, last_name, avatar_url')
        .eq('merchant_id', merchantId)
        .order('first_name', { ascending: true }),
      supabase
        .from('locations')
        .select('id, name')
        .eq('merchant_id', merchantId)
        .order('name', { ascending: true }),
    ])

    if (staffRes.error) throw staffRes.error
    if (locRes.error) throw locRes.error

    return {
      success: true,
      data: {
        staff: staffRes.data || [],
        locations: locRes.data || [],
      },
    }
  } catch (error) {
    console.error('[getAdminTimesheetResources] error', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch resources',
    }
  }
}

// ============================================================================
// UPDATE SHIFT STATUS
// ============================================================================

export async function updateAdminShiftStatus(
  merchantId: string,
  shiftId: string,
  status: 'active' | 'completed' | 'approved' | 'rejected'
): Promise<MutationResult<StaffShift>> {
  await assertHQPermission('hq.merchant.update')

  try {
    const supabase = createServiceRoleClient()

    const { data: updatedData, error } = await supabase
      .from('staff_shifts')
      .update({
        status,
        updated_at: new Date().toISOString(),
        is_verified: status === 'approved' ? true : undefined,
      })
      .eq('id', shiftId)
      .eq('merchant_id', merchantId)
      .select(
        `
        id,
        status,
        clock_in_time,
        clock_out_time,
        break_logs,
        hourly_rate_snapshot,
        created_at,
        merchant_id,
        location_id,
        staff_profile_id,
        staff_profile:staff_profiles(first_name, last_name, avatar_url),
        location:locations(name)
      `
      )
      .single()

    if (error || !updatedData) {
      throw error || new Error('Failed to update shift')
    }

    // Log to Audit
    const staffProfile = (updatedData as any).staff_profile
    const staffName = staffProfile
      ? `${staffProfile.first_name} ${staffProfile.last_name}`
      : 'Unknown Staff'

    // We can reuse the existing LogAuditEvent, it takes merchantId.
    // However, LogAuditEvent is in dashboard actions, which is fine to reuse if exported as server action/function.
    // It is `export async function LogAuditEvent`.

    await LogAuditEvent({
      merchantId: updatedData.merchant_id,
      action: `Admin Shift ${status}: ${staffName}`,
      actionCategory: 'staff_shifts',
      resourceType: 'staff_shift',
      resourceId: shiftId,
      resourceName: staffName,
      locationId: updatedData.location_id,
      changes: {
        after: { status, is_verified: status === 'approved' },
      },
    })

    return { success: true, data: updatedData as unknown as StaffShift }
  } catch (error) {
    console.error('[updateAdminShiftStatus] error', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update shift status',
    }
  }
}

// ============================================================================
// ADJUST SHIFT TIMES
// ============================================================================

export async function adjustAdminShiftTimes(
  merchantId: string,
  shiftId: string,
  clockInTime: string,
  clockOutTime: string | null
): Promise<MutationResult<StaffShift>> {
  await assertHQPermission('hq.merchant.update')

  try {
    const supabase = createServiceRoleClient()

    // Fetch before state
    const { data: beforeShift } = await supabase
      .from('staff_shifts')
      .select('*')
      .eq('id', shiftId)
      .single()

    const { data: updatedData, error } = await supabase
      .from('staff_shifts')
      .update({
        clock_in_time: clockInTime,
        clock_out_time: clockOutTime,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shiftId)
      .eq('merchant_id', merchantId)
      .select(
        `
        id,
        status,
        clock_in_time,
        clock_out_time,
        break_logs,
        hourly_rate_snapshot,
        created_at,
        merchant_id,
        location_id,
        staff_profile_id,
        staff_profile:staff_profiles(first_name, last_name, avatar_url),
        location:locations(name)
      `
      )
      .single()

    if (error || !updatedData) {
      throw error || new Error('Failed to adjust shift times')
    }

    if (beforeShift) {
      const staffProfile = (updatedData as any).staff_profile
      const staffName = staffProfile
        ? `${staffProfile.first_name} ${staffProfile.last_name}`
        : 'Unknown Staff'

      await LogAuditEvent({
        merchantId: updatedData.merchant_id,
        action: `Admin Adjusted Shift Times: ${staffName}`,
        actionCategory: 'staff_shifts',
        resourceType: 'staff_shift',
        resourceId: shiftId,
        resourceName: staffName,
        locationId: updatedData.location_id,
        changes: {
          before: {
            clock_in_time: beforeShift.clock_in_time,
            clock_out_time: beforeShift.clock_out_time,
          },
          after: {
            clock_in_time: clockInTime,
            clock_out_time: clockOutTime,
          },
        },
      })
    }

    return { success: true, data: updatedData as unknown as StaffShift }
  } catch (error) {
    console.error('[adjustAdminShiftTimes] error', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to adjust shift times',
    }
  }
}

// ============================================================================
// DELETE SHIFT
// ============================================================================

export async function deleteAdminShift(
  merchantId: string,
  shiftId: string
): Promise<MutationResult<null>> {
  await assertHQPermission('hq.merchant.update')

  try {
    const supabase = createServiceRoleClient()

    const { data: shiftToDelete } = await supabase
      .from('staff_shifts')
      .select(
        `
        *,
        staff_profile:staff_profiles(first_name, last_name)
      `
      )
      .eq('id', shiftId)
      .single()

    const { error: deleteError } = await supabase
      .from('staff_shifts')
      .delete()
      .eq('id', shiftId)
      .eq('merchant_id', merchantId)

    if (deleteError) throw deleteError

    if (shiftToDelete) {
      const staffName = shiftToDelete.staff_profile
        ? `${shiftToDelete.staff_profile.first_name} ${shiftToDelete.staff_profile.last_name}`
        : 'Unknown Staff'
      await LogAuditEvent({
        merchantId: shiftToDelete.merchant_id,
        action: `Admin Deleted Shift: ${staffName}`,
        actionCategory: 'staff_shifts',
        resourceType: 'staff_shift',
        resourceId: shiftId,
        resourceName: staffName,
        locationId: shiftToDelete.location_id,
      })
    }

    return { success: true, data: null }
  } catch (error) {
    console.error('[deleteAdminShift] error', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete shift',
    }
  }
}

// ============================================================================
// BULK APPROVE
// ============================================================================

export async function bulkApproveAdminShifts(
  merchantId: string,
  shiftIds: string[]
): Promise<MutationResult<number>> {
  await assertHQPermission('hq.merchant.update')

  try {
    if (!shiftIds.length) return { success: true, data: 0 }

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('staff_shifts')
      .update({
        status: 'approved',
        is_verified: true,
        updated_at: new Date().toISOString(),
      })
      .in('id', shiftIds)
      .eq('merchant_id', merchantId)
      .select()

    if (error) throw error

    const count = data?.length || 0

    await LogAuditEvent({
      merchantId: merchantId,
      action: `Admin Bulk Approved ${count} Shifts`,
      actionCategory: 'staff_shifts',
      resourceType: 'staff_shift',
      resourceId: undefined,
      resourceName: `${count} Shifts`,
      metadata: {
        count,
        shift_ids: shiftIds,
      },
    })

    return { success: true, data: count }
  } catch (error) {
    console.error('[bulkApproveAdminShifts] error', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve shifts',
    }
  }
}
