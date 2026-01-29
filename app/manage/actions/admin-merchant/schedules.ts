'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

// ============================================================================
// TYPES
// ============================================================================

export type AdminSchedule = {
  id: string
  name: string
  description: string | null
  is_active: boolean
  merchant_id: string
  location_id: string | null
  created_at: string
  schedule_time_slots: AdminTimeSlot[]
  assigned_menus?: { id: string; name: string }[]
}

export type AdminTimeSlot = {
  id: string
  schedule_id: string
  day_of_week: number // 0=Sunday, 6=Saturday
  start_time: string // HH:MM format
  end_time: string // HH:MM format
  is_active: boolean
}

// ============================================================================
// GET OPERATIONS
// ============================================================================

export async function getAdminSchedules(
  merchantId: string,
  locationId: string | null
): Promise<AdminSchedule[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Build query based on location context
  let query = supabase
    .from('schedules')
    .select(
      `*,
      schedule_time_slots(*)
    `
    )
    .eq('merchant_id', merchantId)

  if (locationId === 'all' || !locationId) {
    // All Locations view: return all schedules (global + all location-specific)
    // No additional filtering needed
  } else {
    // Specific Location view: return global schedules + this location's specific schedules
    query = query.or(`location_id.is.null,location_id.eq.${locationId}`)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('Error getting admin schedules:', error)
    return []
  }

  return data as AdminSchedule[]
}

export async function getAdminScheduleWithMenus(
  merchantId: string,
  scheduleId: string
): Promise<AdminSchedule | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data: schedule, error } = await supabase
    .from('schedules')
    .select(
      `
      *,
      schedule_time_slots(*),
      menu_schedules(
        id,
        menu:menus(
          id,
          name
        )
      )
    `
    )
    .eq('id', scheduleId)
    .eq('merchant_id', merchantId)
    .single()

  if (error || !schedule) {
    console.error('Error getting admin schedule with menus:', error)
    return null
  }

  // Transform the menu_schedules to assigned_menus format
  const assignedMenus = (schedule.menu_schedules || [])
    .map((ms: any) => ms.menu)
    .filter((m: any) => m !== null)
    .map((m: any) => ({ id: m.id, name: m.name }))

  return {
    ...schedule,
    assigned_menus: assignedMenus,
  } as AdminSchedule
}

export async function getMenuSchedules(
  merchantId: string,
  menuId: string
): Promise<AdminSchedule[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('menu_schedules')
    .select(
      `
      id,
      schedule:schedules(
        *,
        schedule_time_slots(*)
      )
    `
    )
    .eq('menu_id', menuId)
    .eq('merchant_id', merchantId)

  if (error) {
    console.error('Error getting menu schedules:', error)
    return []
  }

  // Flatten to just return the schedules with time slots
  return (data || [])
    .map((item: any) => item.schedule)
    .filter((s: any): s is AdminSchedule => s !== null) as AdminSchedule[]
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function createAdminSchedule(
  merchantId: string,
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
): Promise<{ data?: AdminSchedule; error?: string }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Create schedule
  const { data: schedule, error: scheduleError } = await supabase
    .from('schedules')
    .insert({
      merchant_id: merchantId,
      name: data.name,
      description: data.description || null,
      is_active: data.is_active ?? true,
      location_id: data.location_id || null,
    })
    .select()
    .single()

  if (scheduleError || !schedule) {
    console.error('Error creating admin schedule:', scheduleError)
    return { error: scheduleError?.message || 'Failed to create schedule' }
  }

  // Create time slots if provided
  if (data.time_slots && data.time_slots.length > 0) {
    const timeSlots = data.time_slots.map((slot) => ({
      schedule_id: schedule.id,
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
      is_active: slot.is_active ?? true,
      merchant_id: merchantId,
    }))

    const { error: slotsError } = await supabase
      .from('schedule_time_slots')
      .insert(timeSlots)

    if (slotsError) {
      console.error('Error creating admin time slots:', slotsError)
      // Schedule was created but slots failed - return partial success
      return {
        error: 'Schedule created but failed to add time slots',
        data: schedule as AdminSchedule,
      }
    }
  }

  // Fetch the created schedule with time slots
  const { data: completeSchedule } = await supabase
    .from('schedules')
    .select(
      `
      *,
      schedule_time_slots(*)
    `
    )
    .eq('id', schedule.id)
    .single()

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Created Schedule: ${data.name}`,
    actionCategory: 'settings',
    resourceType: 'schedule',
    resourceId: schedule.id,
    resourceName: data.name,
    locationId: data.location_id || undefined,
    metadata: {
      admin_action: true,
      slots_count: data.time_slots?.length || 0,
    },
  })

  return { data: completeSchedule as AdminSchedule }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

export async function updateAdminSchedule(
  merchantId: string,
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
): Promise<{ data?: AdminSchedule; error?: string }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

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
      .eq('merchant_id', merchantId)

    if (error) {
      console.error('Error updating admin schedule:', error)
      return { error: error.message }
    }
  }

  // Update time slots if provided
  if (data.time_slots !== undefined) {
    // Use service role client to bypass RLS for delete operation
    const serviceClient = createServiceRoleClient()

    // Delete existing time slots
    const { error: deleteError } = await serviceClient
      .from('schedule_time_slots')
      .delete()
      .eq('schedule_id', scheduleId)

    if (deleteError) {
      console.error('Error deleting old time slots:', deleteError)
      return { error: 'Failed to update time slots' }
    }

    // Insert new time slots
    if (data.time_slots.length > 0) {
      const timeSlots = data.time_slots.map((slot) => ({
        schedule_id: scheduleId,
        merchant_id: merchantId,
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
    .select(
      `
      *,
      schedule_time_slots(*)
    `
    )
    .eq('id', scheduleId)
    .eq('merchant_id', merchantId)
    .single()

  if (fetchError) {
    console.error('Error fetching updated schedule:', fetchError)
    return { error: 'Schedule updated but failed to fetch' }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Updated Schedule: ${updatedSchedule.name}`,
    actionCategory: 'settings',
    resourceType: 'schedule',
    resourceId: scheduleId,
    resourceName: updatedSchedule.name,
    changes: { after: data as any },
    metadata: {
      admin_action: true,
    },
  })

  return { data: updatedSchedule as AdminSchedule }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function deleteAdminSchedule(
  merchantId: string,
  scheduleId: string
): Promise<{ success?: boolean; error?: string }> {
  await assertHQPermission('hq.merchant.update')

  // Use service role client to bypass RLS
  const supabase = createServiceRoleClient()

  // 1. Delete all menu_schedules assignments
  const { error: menuError } = await supabase
    .from('menu_schedules')
    .delete()
    .eq('schedule_id', scheduleId)
    .eq('merchant_id', merchantId)

  if (menuError) {
    console.error('Error removing schedule from menus:', menuError)
    return { error: 'Failed to remove schedule from menus' }
  }

  // 2. Delete all category_schedules assignments
  const { error: categoryError } = await supabase
    .from('category_schedules')
    .delete()
    .eq('schedule_id', scheduleId)

  if (categoryError) {
    console.error('Error removing schedule from categories:', categoryError)
    return { error: 'Failed to remove schedule from categories' }
  }

  // 3. Delete all schedule_time_slots
  const { error: slotsError } = await supabase
    .from('schedule_time_slots')
    .delete()
    .eq('schedule_id', scheduleId)

  if (slotsError) {
    console.error('Error deleting time slots:', slotsError)
    return { error: 'Failed to delete time slots' }
  }

  // Fetch schedule details for logging
  const { data: schedule } = await supabase
    .from('schedules')
    .select('name, location_id')
    .eq('id', scheduleId)
    .single()

  // 4. Finally delete the schedule itself
  const { error } = await supabase
    .from('schedules')
    .delete()
    .eq('id', scheduleId)
    .eq('merchant_id', merchantId)

  if (error) {
    console.error('Error deleting admin schedule:', error)
    return { error: error.message }
  }

  // Log Audit Event
  if (schedule) {
    await LogAuditEvent({
      merchantId,
      action: `Deleted Schedule: ${schedule.name}`,
      actionCategory: 'settings',
      resourceType: 'schedule',
      resourceId: scheduleId,
      resourceName: schedule.name,
      severity: 'info',
      metadata: {
        admin_action: true,
      },
    })
  }

  return { success: true }
}

// ============================================================================
// ASSIGNMENT OPERATIONS
// ============================================================================

export async function assignScheduleToMenu(
  merchantId: string,
  menuId: string,
  scheduleId: string
): Promise<{ success?: boolean; error?: string }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Check if assignment already exists
  const { data: existing } = await supabase
    .from('menu_schedules')
    .select('id')
    .eq('menu_id', menuId)
    .eq('schedule_id', scheduleId)
    .eq('merchant_id', merchantId)
    .single()

  if (existing) {
    return { success: true }
  }

  // Create new assignment
  const { error } = await supabase
    .from('menu_schedules')
    .insert({
      menu_id: menuId,
      schedule_id: scheduleId,
      merchant_id: merchantId,
    })

  if (error) {
    console.error('Error assigning schedule to menu:', error)
    return { error: error.message }
  }

  return { success: true }
}

export async function removeScheduleFromMenu(
  merchantId: string,
  menuId: string,
  scheduleId: string
): Promise<{ success?: boolean; error?: string }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('menu_schedules')
    .delete()
    .eq('menu_id', menuId)
    .eq('schedule_id', scheduleId)
    .eq('merchant_id', merchantId)

  if (error) {
    console.error('Error removing schedule from menu:', error)
    return { error: error.message }
  }

  return { success: true }
}

export async function getCategorySchedules(
  merchantId: string,
  categoryId: string
): Promise<AdminSchedule[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('category_schedules')
    .select(
      `
      id,
      schedule:schedules(
        *,
        schedule_time_slots(*)
      )
    `
    )
    .eq('category_id', categoryId)

  if (error) {
    console.error('Error getting category schedules:', error)
    return []
  }

  return (data || [])
    .map((item: any) => item.schedule)
    .filter((s: any): s is AdminSchedule => s !== null) as AdminSchedule[]
}

export async function assignScheduleToCategory(
  merchantId: string,
  categoryId: string,
  scheduleId: string
): Promise<{ success?: boolean; error?: string }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Check if assignment already exists
  const { data: existing } = await supabase
    .from('category_schedules')
    .select('id')
    .eq('category_id', categoryId)
    .eq('schedule_id', scheduleId)
    .single()

  if (existing) {
    return { success: true }
  }

  // Create new assignment
  const { error } = await supabase
    .from('category_schedules')
    .insert({
      category_id: categoryId,
      schedule_id: scheduleId,
      merchant_id: merchantId,
    })

  if (error) {
    console.error('Error assigning schedule to category:', error)
    return { error: error.message }
  }

  return { success: true }
}

export async function removeScheduleFromCategory(
  merchantId: string,
  categoryId: string,
  scheduleId: string
): Promise<{ success?: boolean; error?: string }> {
  await assertHQPermission('hq.merchant.update')

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
