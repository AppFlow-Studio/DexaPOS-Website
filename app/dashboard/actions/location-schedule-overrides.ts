'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

export interface LocationScheduleOverride {
    id: string
    location_id: string
    schedule_id: string
    merchant_id: string
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface ScheduleOverrideData {
    is_active?: boolean
}

// ============================================================================
// SCHEDULE OVERRIDES - GET OPERATIONS
// ============================================================================

/**
 * Get a single location override for a schedule
 */
export async function GetLocationScheduleOverride(
    locationId: string,
    scheduleId: string
): Promise<LocationScheduleOverride | null> {
    if (!locationId || !scheduleId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('location_schedule_overrides')
        .select('*')
        .eq('location_id', locationId)
        .eq('schedule_id', scheduleId)
        .single()

    if (error) {
        // No override exists - this is normal
        if (error.code === 'PGRST116') {
            return null
        }
        console.error('Error getting location schedule override:', error)
        return null
    }

    return data as LocationScheduleOverride
}

/**
 * Get all schedule overrides for a location
 */
export async function GetLocationScheduleOverrides(
    locationId: string
): Promise<LocationScheduleOverride[]> {
    if (!locationId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('location_schedule_overrides')
        .select('*')
        .eq('location_id', locationId)

    if (error) {
        console.error('Error getting location schedule overrides:', error)
        return []
    }

    return data as LocationScheduleOverride[]
}

// ============================================================================
// SCHEDULE OVERRIDES - UPSERT OPERATIONS
// ============================================================================

/**
 * Upsert location override for a schedule (hide/show at location)
 */
export async function UpsertLocationScheduleOverride(
    locationId: string,
    scheduleId: string,
    merchantId: string,
    data: ScheduleOverrideData
) {
    if (!locationId || !scheduleId || !merchantId) {
        return { error: 'Missing required parameters' }
    }

    const supabase = createServerSupabaseClient()

    const { data: override, error } = await supabase
        .from('location_schedule_overrides')
        .upsert({
            location_id: locationId,
            schedule_id: scheduleId,
            merchant_id: merchantId,
            is_active: data.is_active ?? true,
        }, {
            onConflict: 'location_id,schedule_id',
        })
        .select()
        .single()

    if (error) {
        console.error('Error upserting schedule override:', error)
        return { error: error.message }
    }

    return { data: override as LocationScheduleOverride }
}

// ============================================================================
// SCHEDULE OVERRIDES - DELETE OPERATIONS
// ============================================================================

/**
 * Delete location override for a schedule (revert to global visibility)
 */
export async function DeleteLocationScheduleOverride(
    locationId: string,
    scheduleId: string
) {
    if (!locationId || !scheduleId) {
        return { error: 'Missing required parameters' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('location_schedule_overrides')
        .delete()
        .eq('location_id', locationId)
        .eq('schedule_id', scheduleId)

    if (error) {
        console.error('Error deleting schedule override:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// EFFECTIVE VALUE CALCULATION
// ============================================================================

/**
 * Get schedule with location-aware data
 * Returns global schedule with effective is_active based on location override
 */
export async function GetScheduleWithLocationContext(
    scheduleId: string,
    locationId: string | null
) {
    if (!scheduleId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    // Get base schedule
    const { data: schedule, error: scheduleError } = await supabase
        .from('schedules')
        .select(`
            *,
            schedule_time_slots(*)
        `)
        .eq('id', scheduleId)
        .single()

    if (scheduleError || !schedule) {
        console.error('Error getting schedule:', scheduleError)
        return null
    }

    // If no location context, return as-is
    if (!locationId || locationId === 'all') {
        return {
            ...schedule,
            has_location_override: false,
            effective_is_active: schedule.is_active,
            location_override: null,
        }
    }

    // Get location override if it exists
    const override = await GetLocationScheduleOverride(locationId, scheduleId)

    const effective_is_active = override ? override.is_active : schedule.is_active

    return {
        ...schedule,
        has_location_override: !!override,
        effective_is_active,
        location_override: override,
    }
}
