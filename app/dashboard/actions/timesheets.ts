'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { StaffShift } from '@/types/staff'
import { startOfDay, endOfDay } from 'date-fns'

// ============================================================================
// TYPES
// ============================================================================

type MutationResult<T> = { success: true; data: T } | { success: false; error: string }

interface TimesheetFilters {
    dateFrom: string // ISO date string
    dateTo: string // ISO date string
    locationIds?: string[]
    employeeIds?: string[]
}

interface TimesheetResources {
    staff: { id: string; first_name: string; last_name: string; avatar_url: string | null }[]
    locations: { id: string; name: string }[]
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getMerchantIdFromSession() {
    const { userId, sessionClaims } = await auth()
    if (!userId) {
        throw new Error('Unauthorized')
    }

    const user = await currentUser()
    const publicMetadata = (user?.publicMetadata || {}) as Record<string, unknown>
    const merchantId =
        (publicMetadata.merchantId as string | undefined) ||
        ((sessionClaims as Record<string, any> | null)?.merchantId as string | undefined) ||
        ((sessionClaims as Record<string, any> | null)?.metadata?.merchantId as string | undefined)

    if (!merchantId) {
        throw new Error('Missing merchant_id on session')
    }

    return merchantId
}

// ============================================================================
// GET TIMESHEETS
// ============================================================================

export async function GetTimesheets(filters: TimesheetFilters): Promise<MutationResult<StaffShift[]>> {
    try {
        const supabase = createServerSupabaseClient()
        const merchantId = await getMerchantIdFromSession()

        const from = startOfDay(new Date(filters.dateFrom)).toISOString()
        const to = endOfDay(new Date(filters.dateTo)).toISOString()

        let query = supabase
            .from('staff_shifts')
            .select(`
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
            `)
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
        console.error('[GetTimesheets] error', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch timesheets' }
    }
}

// ============================================================================
// GET TIMESHEET RESOURCES (staff and locations for filters)
// ============================================================================

export async function GetTimesheetResources(): Promise<MutationResult<TimesheetResources>> {
    try {
        const supabase = createServerSupabaseClient()
        const merchantId = await getMerchantIdFromSession()

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
        console.error('[GetTimesheetResources] error', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch resources' }
    }
}

// ============================================================================
// GET SINGLE SHIFT
// ============================================================================

export async function GetShiftById(shiftId: string): Promise<MutationResult<StaffShift>> {
    try {
        const supabase = createServerSupabaseClient()
        const merchantId = await getMerchantIdFromSession()

        const { data, error } = await supabase
            .from('staff_shifts')
            .select(`
                id, 
                status, 
                clock_in_time, 
                clock_out_time, 
                break_logs, 
                hourly_rate_snapshot, 
                notes,
                is_verified,
                created_at,
                updated_at,
                merchant_id,
                location_id,
                staff_profile_id,
                staff_profile:staff_profiles(first_name, last_name, avatar_url),
                location:locations(name)
            `)
            .eq('id', shiftId)
            .eq('merchant_id', merchantId)
            .single()

        if (error || !data) {
            throw error || new Error('Shift not found')
        }

        return { success: true, data: data as unknown as StaffShift }
    } catch (error) {
        console.error('[GetShiftById] error', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch shift' }
    }
}

// ============================================================================
// UPDATE SHIFT STATUS
// ============================================================================

export async function UpdateShiftStatus(
    shiftId: string,
    status: 'active' | 'completed' | 'approved' | 'rejected'
): Promise<MutationResult<StaffShift>> {
    try {
        const supabase = createServerSupabaseClient()
        const merchantId = await getMerchantIdFromSession()

        const { data, error } = await supabase
            .from('staff_shifts')
            .update({ 
                status, 
                updated_at: new Date().toISOString(),
                is_verified: status === 'approved' ? true : undefined 
            })
            .eq('id', shiftId)
            .eq('merchant_id', merchantId)
            .select(`
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
            `)
            .single()

        if (error || !data) {
            throw error || new Error('Failed to update shift')
        }

        return { success: true, data: data as unknown as StaffShift }
    } catch (error) {
        console.error('[UpdateShiftStatus] error', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update shift status' }
    }
}

// ============================================================================
// ADJUST SHIFT TIMES (Manual correction)
// ============================================================================

export async function AdjustShiftTimes(
    shiftId: string,
    clockInTime: string,
    clockOutTime: string | null
): Promise<MutationResult<StaffShift>> {
    try {
        const supabase = createServerSupabaseClient()
        const merchantId = await getMerchantIdFromSession()

        const { data, error } = await supabase
            .from('staff_shifts')
            .update({ 
                clock_in_time: clockInTime,
                clock_out_time: clockOutTime,
                updated_at: new Date().toISOString() 
            })
            .eq('id', shiftId)
            .eq('merchant_id', merchantId)
            .select(`
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
            `)
            .single()

        if (error || !data) {
            throw error || new Error('Failed to adjust shift times')
        }

        return { success: true, data: data as unknown as StaffShift }
    } catch (error) {
        console.error('[AdjustShiftTimes] error', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to adjust shift times' }
    }
}

// ============================================================================
// DELETE SHIFT
// ============================================================================

export async function DeleteShift(shiftId: string): Promise<MutationResult<null>> {
    try {
        const supabase = createServerSupabaseClient()
        const merchantId = await getMerchantIdFromSession()

        const { error } = await supabase
            .from('staff_shifts')
            .delete()
            .eq('id', shiftId)
            .eq('merchant_id', merchantId)

        if (error) throw error

        return { success: true, data: null }
    } catch (error) {
        console.error('[DeleteShift] error', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete shift' }
    }
}

// ============================================================================
// BULK APPROVE SHIFTS
// ============================================================================

export async function BulkApproveShifts(shiftIds: string[]): Promise<MutationResult<number>> {
    try {
        if (!shiftIds.length) return { success: true, data: 0 }

        const supabase = createServerSupabaseClient()
        const merchantId = await getMerchantIdFromSession()

        const { error, count } = await supabase
            .from('staff_shifts')
            .update({ 
                status: 'approved', 
                is_verified: true,
                updated_at: new Date().toISOString() 
            })
            .in('id', shiftIds)
            .eq('merchant_id', merchantId)
            .select('*', { count: 'exact', head: true })

        if (error) throw error

        return { success: true, data: count || 0 }
    } catch (error) {
        console.error('[BulkApproveShifts] error', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to approve shifts' }
    }
}

