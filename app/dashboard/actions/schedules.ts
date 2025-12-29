'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'
import { GetLocationScheduleOverrides } from './location-schedule-overrides'

// ============================================================================
// GET OPERATIONS
// ============================================================================

export async function GetSchedules(clerkOrgId: string, locationId?: string) {
    if (!clerkOrgId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    // Get merchant ID
    const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id')
        .eq('clerk_org_id', clerkOrgId)
        .single()

    if (merchantError || !merchant) {
        console.error('Error getting merchant:', merchantError)
        return []
    }

    // Build query based on location context
    let query = supabase
        .from('schedules')
        .select(
            `*,
            schedule_time_slots(*)
        `
        )
        .eq('merchant_id', merchant.id)

    if (locationId === 'all' || !locationId) {
        // All Locations view: return all schedules (global + all location-specific)
        // No additional filtering needed
    } else {
        // Specific Location view: return global schedules + this location's specific schedules
        query = query.or(`location_id.is.null,location_id.eq.${locationId}`)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting schedules:', error)
        return []
    }

    // If viewing specific location, fetch overrides and merge
    if (locationId && locationId !== 'all') {
        const overrides = await GetLocationScheduleOverrides(locationId)
        const overrideMap = new Map(overrides.map(o => [o.schedule_id, o]))

        return data.map(schedule => ({
            ...schedule,
            has_location_override: overrideMap.has(schedule.id),
            effective_is_active: overrideMap.get(schedule.id)?.is_active ?? schedule.is_active,
            location_override: overrideMap.get(schedule.id) || null,
            is_location_specific: schedule.location_id !== null,
        }))
    }

    return data.map(schedule => ({
        ...schedule,
        has_location_override: false,
        effective_is_active: schedule.is_active,
        location_override: null,
        is_location_specific: schedule.location_id !== null,
    }))
}

export async function GetSchedule(scheduleId: string) {
    if (!scheduleId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    const { data: schedule, error } = await supabase
        .from('schedules')
        .select(`
            *,
            schedule_time_slots(*)
        `)
        .eq('id', scheduleId)
        .single()

    if (error || !schedule) {
        console.error('Error getting schedule:', error)
        return null
    }

    return schedule as SchedulesModel & {
        schedule_time_slots: ScheduleTimeSlotsModel[]
    }
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function CreateSchedule(
    clerkOrgId: string,
    data: {
        name: string
        description?: string
        is_active?: boolean
        location_id?: string | null
        time_slots?: Array<{
            day_of_week: number
            start_time: string
            end_time: string
            is_active?: boolean
        }>
    }
) {
    if (!clerkOrgId) {
        return { error: 'Organization ID is required' }
    }

    const supabase = createServerSupabaseClient()

    // Get merchant ID
    const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id')
        .eq('clerk_org_id', clerkOrgId)
        .single()

    if (merchantError || !merchant) {
        console.error('Error getting merchant:', merchantError)
        return { error: 'Merchant not found' }
    }

    // Create schedule
    const { data: schedule, error: scheduleError } = await supabase
        .from('schedules')
        .insert({
            merchant_id: merchant.id,
            name: data.name,
            description: data.description || null,
            is_active: data.is_active ?? true,
            location_id: data.location_id || null,
        })
        .select()
        .single()

    if (scheduleError || !schedule) {
        console.error('Error creating schedule:', scheduleError)
        return { error: scheduleError?.message || 'Failed to create schedule' }
    }

    // Create time slots if provided
    if (data.time_slots && data.time_slots.length > 0) {
        const timeSlots = data.time_slots.map(slot => ({
            schedule_id: schedule.id,
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
            is_active: slot.is_active ?? true,
            merchant_id: merchant.id,
        }))

        const { error: slotsError } = await supabase
            .from('schedule_time_slots')
            .insert(timeSlots)

        if (slotsError) {
            console.error('Error creating time slots:', slotsError)
            // Schedule was created but slots failed - return partial success
            return { error: 'Schedule created but failed to add time slots', data: schedule }
        }
    }

    return { data: schedule as SchedulesModel }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

export async function UpdateSchedule(
    scheduleId: string,
    data: {
        name?: string
        description?: string
        is_active?: boolean
    }
) {
    if (!scheduleId) {
        return { error: 'Schedule ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.is_active !== undefined) updateData.is_active = data.is_active

    const { data: schedule, error } = await supabase
        .from('schedules')
        .update(updateData)
        .eq('id', scheduleId)
        .select()
        .single()

    if (error) {
        console.error('Error updating schedule:', error)
        return { error: error.message }
    }

    return { data: schedule as SchedulesModel }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function DeleteSchedule(scheduleId: string) {
    if (!scheduleId) {
        return { error: 'Schedule ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', scheduleId)

    if (error) {
        console.error('Error deleting schedule:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// ASSIGNMENT OPERATIONS
// ============================================================================

/**
 * Get schedules assigned to a category with location context
 */
export async function GetCategorySchedules(
    categoryId: string,
    locationId?: string
) {
    if (!categoryId) {
        return []
    }


    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('category_schedules')
        .select(`
            id,
            schedule:schedules(
                *,
                schedule_time_slots(*)
            )
        `)
        .eq('category_id', categoryId)

    if (error) {
        console.error('Error getting category schedules:', error)
        return []
    }

    const schedules = data
        .map(item => item.schedule)
        .filter(Boolean)

    // If viewing specific location, fetch overrides and merge
    if (locationId && locationId !== 'all') {
        const overrides = await GetLocationScheduleOverrides(locationId)
        const overrideMap = new Map(overrides.map(o => [o.schedule_id, o]))

        return schedules.map(schedule => ({
            ...schedule,
            has_location_override: overrideMap.has(schedule.id),
            effective_is_active: overrideMap.get(schedule.id)?.is_active ?? schedule.is_active,
            location_override: overrideMap.get(schedule.id) || null,
        }))
    }

    return schedules
}

export async function AssignScheduleToMenu(menuId: string, scheduleId: string, clerkOrgId: string) {
    if (!menuId || !scheduleId) {
        return { error: 'Menu ID and Schedule ID are required' }
    }


    console.log('clerkOrgId', clerkOrgId)
    const supabase = createServerSupabaseClient()
    // First, get the merchant ID from the clerk_org_id
    const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id')
        .eq('clerk_org_id', clerkOrgId)
        .single()

    if (merchantError || !merchant) {
        console.error('Error getting merchant:', merchantError)
        return { error: 'Merchant not found' }
    }

    // Check if assignment already exists
    const { data: existing } = await supabase
        .from('menu_schedules')
        .select('id')
        .eq('menu_id', menuId)
        .eq('schedule_id', scheduleId)
        .single()

    if (existing) {
        return { success: true, data: existing }
    }

    // Create new assignment
    const { data, error } = await supabase
        .from('menu_schedules')
        .insert({
            menu_id: menuId,
            schedule_id: scheduleId,
            merchant_id: merchant.id,
        })
        .select()
        .single()

    if (error) {
        console.error('Error assigning schedule to menu:', error)
        return { error: error.message }
    }

    return { success: true, data }
}

export async function AssignScheduleToCategory(categoryId: string, scheduleId: string) {
    if (!categoryId || !scheduleId) {
        return { error: 'Category ID and Schedule ID are required' }
    }

    const supabase = createServerSupabaseClient()

    // Check if assignment already exists
    const { data: existing } = await supabase
        .from('category_schedules')
        .select('id')
        .eq('category_id', categoryId)
        .eq('schedule_id', scheduleId)
        .single()

    if (existing) {
        return { success: true, data: existing }
    }

    // Create new assignment
    const { data, error } = await supabase
        .from('category_schedules')
        .insert({
            category_id: categoryId,
            schedule_id: scheduleId,
        })
        .select()
        .single()

    if (error) {
        console.error('Error assigning schedule to category:', error)
        return { error: error.message }
    }

    return { success: true, data }
}

export async function RemoveScheduleFromMenu(menuId: string, scheduleId: string) {
    if (!menuId || !scheduleId) {
        return { error: 'Menu ID and Schedule ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('menu_schedules')
        .delete()
        .eq('menu_id', menuId)
        .eq('schedule_id', scheduleId)

    if (error) {
        console.error('Error removing schedule from menu:', error)
        return { error: error.message }
    }

    return { success: true }
}

export async function RemoveScheduleFromCategory(categoryId: string, scheduleId: string) {
    if (!categoryId || !scheduleId) {
        return { error: 'Category ID and Schedule ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('category_schedules')
        .delete()
        .eq('category_id', categoryId)
        .eq('schedule_id', scheduleId)

    if (error) {
        console.error('Error removing schedule from category:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// MENU SCHEDULE QUERIES
// ============================================================================

export async function GetMenuSchedules(menuId: string) {
    if (!menuId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('menu_schedules')
        .select(`
            id,
            schedule:schedules(
                *,
                schedule_time_slots(*)
            )
        `)
        .eq('menu_id', menuId)

    if (error) {
        console.error('Error getting menu schedules:', error)
        return []
    }

    // Flatten to just return the schedules with time slots
    return data
        .map(item => item.schedule)
        .filter(Boolean) as Array<SchedulesModel & {
            schedule_time_slots: ScheduleTimeSlotsModel[]
        }>
}

export async function GetSchedulesWithTimeSlots(clerkOrgId: string) {
    if (!clerkOrgId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    // Get merchant ID
    const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id')
        .eq('clerk_org_id', clerkOrgId)
        .single()

    if (merchantError || !merchant) {
        console.error('Error getting merchant:', merchantError)
        return []
    }

    const { data, error } = await supabase
        .from('schedules')
        .select(`
            *,
            schedule_time_slots(*)
        `)
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting schedules with time slots:', error)
        return []
    }

    return data as Array<SchedulesModel & {
        schedule_time_slots: ScheduleTimeSlotsModel[]
    }>
}

// Get schedules with their associated menus and time slots
export async function GetSchedulesWithMenus(clerkOrgId: string) {
    if (!clerkOrgId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    // Get merchant ID
    const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id')
        .eq('clerk_org_id', clerkOrgId)
        .single()

    if (merchantError || !merchant) {
        console.error('Error getting merchant:', merchantError)
        return []
    }

    const { data, error } = await supabase
        .from('schedules')
        .select(`
            *,
            schedule_time_slots(*),
            menu_schedules(
                id,
                menu:menus(
                    id,
                    name,
                    is_active
                )
            )
        `)
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting schedules with menus:', error)
        return []
    }

    return data as Array<SchedulesModel & {
        schedule_time_slots: ScheduleTimeSlotsModel[]
        menu_schedules: Array<{
            id: string
            menu: {
                id: string
                name: string
                is_active: boolean
            } | null
        }>
    }>
}

// Get a single schedule with full details including menus
export async function GetScheduleWithDetails(scheduleId: string) {
    if (!scheduleId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    const { data: schedule, error } = await supabase
        .from('schedules')
        .select(`
            *,
            schedule_time_slots(*),
            menu_schedules(
                id,
                menu:menus(
                    id,
                    name,
                    is_active
                )
            )
        `)
        .eq('id', scheduleId)
        .single()

    if (error || !schedule) {
        console.error('Error getting schedule with details:', error)
        return null
    }

    return schedule as SchedulesModel & {
        schedule_time_slots: ScheduleTimeSlotsModel[]
        menu_schedules: Array<{
            id: string
            menu: {
                id: string
                name: string
                is_active: boolean
            } | null
        }>
    }
}

// Toggle schedule active status
export async function ToggleScheduleActive(scheduleId: string) {
    if (!scheduleId) {
        return { error: 'Schedule ID is required' }
    }

    const supabase = createServerSupabaseClient()

    // Get current status
    const { data: schedule, error: fetchError } = await supabase
        .from('schedules')
        .select('is_active')
        .eq('id', scheduleId)
        .single()

    if (fetchError || !schedule) {
        console.error('Error fetching schedule:', fetchError)
        return { error: 'Schedule not found' }
    }

    // Toggle status
    const { data: updatedSchedule, error } = await supabase
        .from('schedules')
        .update({ is_active: !schedule.is_active })
        .eq('id', scheduleId)
        .select()
        .single()

    if (error) {
        console.error('Error toggling schedule status:', error)
        return { error: error.message }
    }

    return { data: updatedSchedule as SchedulesModel }
}

// ============================================================================
// TIME SLOT OPERATIONS
// ============================================================================

export async function CreateTimeSlot(
    scheduleId: string,
    data: {
        day_of_week: number
        start_time: string
        end_time: string
        is_active?: boolean
    }
) {
    if (!scheduleId) {
        return { error: 'Schedule ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { data: timeSlot, error } = await supabase
        .from('schedule_time_slots')
        .insert({
            schedule_id: scheduleId,
            day_of_week: data.day_of_week,
            start_time: data.start_time,
            end_time: data.end_time,
            is_active: data.is_active ?? true,
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating time slot:', error)
        return { error: error.message }
    }

    return { data: timeSlot as ScheduleTimeSlotsModel }
}

export async function UpdateTimeSlot(
    timeSlotId: string,
    data: {
        day_of_week?: number
        start_time?: string
        end_time?: string
        is_active?: boolean
    }
) {
    if (!timeSlotId) {
        return { error: 'Time Slot ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const updateData: Record<string, unknown> = {}
    if (data.day_of_week !== undefined) updateData.day_of_week = data.day_of_week
    if (data.start_time !== undefined) updateData.start_time = data.start_time
    if (data.end_time !== undefined) updateData.end_time = data.end_time
    if (data.is_active !== undefined) updateData.is_active = data.is_active

    const { data: timeSlot, error } = await supabase
        .from('schedule_time_slots')
        .update(updateData)
        .eq('id', timeSlotId)
        .select()
        .single()

    if (error) {
        console.error('Error updating time slot:', error)
        return { error: error.message }
    }

    return { data: timeSlot as ScheduleTimeSlotsModel }
}

export async function DeleteTimeSlot(timeSlotId: string) {
    if (!timeSlotId) {
        return { error: 'Time Slot ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('schedule_time_slots')
        .delete()
        .eq('id', timeSlotId)

    if (error) {
        console.error('Error deleting time slot:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Update schedule with time slots (replaces all time slots)
 * This is used when editing a schedule - it removes old slots and creates new ones
 */
export async function UpdateScheduleWithTimeSlots(
    scheduleId: string,
    data: {
        name?: string
        description?: string
        is_active?: boolean
        time_slots?: Array<{
            day_of_week: number
            start_time: string
            end_time: string
            is_active?: boolean
        }>
    }
) {
    if (!scheduleId) {
        return { error: 'Schedule ID is required' }
    }

    const supabase = createServerSupabaseClient()

    // Get merchant_id from schedule
    const { data: schedule, error: scheduleError } = await supabase
        .from('schedules')
        .select('merchant_id')
        .eq('id', scheduleId)
        .single()

    if (scheduleError || !schedule) {
        console.error('Error getting schedule:', scheduleError)
        return { error: 'Schedule not found' }
    }

    // Update schedule details
    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.is_active !== undefined) updateData.is_active = data.is_active

    if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
            .from('schedules')
            .update(updateData)
            .eq('id', scheduleId)

        if (error) {
            console.error('Error updating schedule:', error)
            return { error: error.message }
        }
    }

    // Update time slots if provided
    if (data.time_slots !== undefined) {
        // Delete existing time slots
        const { error: deleteError } = await supabase
            .from('schedule_time_slots')
            .delete()
            .eq('schedule_id', scheduleId)

        if (deleteError) {
            console.error('Error deleting old time slots:', deleteError)
            return { error: 'Failed to update time slots' }
        }

        // Insert new time slots
        if (data.time_slots.length > 0) {
            const timeSlots = data.time_slots.map(slot => ({
                schedule_id: scheduleId,
                merchant_id: schedule.merchant_id,
                day_of_week: slot.day_of_week,
                start_time: slot.start_time,
                end_time: slot.end_time,
                is_active: slot.is_active ?? true,
            }))

            const { error: insertError } = await supabase
                .from('schedule_time_slots')
                .insert(timeSlots)

            if (insertError) {
                console.error('Error creating new time slots:', insertError)
                return { error: 'Failed to create time slots' }
            }
        }
    }

    // Fetch updated schedule with slots
    const { data: updatedSchedule, error: fetchError } = await supabase
        .from('schedules')
        .select(`
            *,
            schedule_time_slots(*)
        `)
        .eq('id', scheduleId)
        .single()

    if (fetchError) {
        console.error('Error fetching updated schedule:', fetchError)
        return { error: 'Schedule updated but failed to fetch' }
    }

    return { data: updatedSchedule as SchedulesModel & { schedule_time_slots: ScheduleTimeSlotsModel[] } }
}

