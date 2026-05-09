'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'
import { auth } from '@clerk/nextjs/server'
import {
  FloorPlan,
  FloorPlanObject,
  TableWithSession,
  WaitlistEntry,
  Reservation
} from '@/types/floor-plan'
import { TableStatus } from '@/types/floor-plan'
import { LogAuditEvent } from './audit-logs'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveImpersonationFromCookies } from '@/lib/admin/impersonation'
import { notifyWaitlistAdded } from '@/app/actions/notifications/waitlist'
import {
  notifyReservationConfirmed,
  notifyReservationCancelled,
} from '@/app/actions/notifications/reservation'
import { normalizePhone } from '@/lib/phone'

/**
 * Resolves the active merchant id for the current request, honoring HQ
 * impersonation. Returns null when neither a real merchant org nor an
 * active impersonation session can be found — caller should treat that
 * as "not authenticated for merchant scope".
 */
async function resolveActiveMerchantId(
  serviceRole: ReturnType<typeof createServiceRoleClient>,
  orgId: string | null | undefined,
): Promise<string | null> {
  const impersonation = await resolveImpersonationFromCookies().catch(() => null)
  if (impersonation) return impersonation.merchantId

  if (!orgId) return null

  const { data: merchant } = await serviceRole
    .from('merchants')
    .select('id')
    .eq('clerk_org_id', orgId)
    .maybeSingle()

  return merchant?.id ?? null
}

/**
 * Server actions for floor plan operations
 * These are called from the client-side store
 */

export async function InitializeFloorPlan (locationId: string) {
  const supabase = createServerSupabaseClient()

  const { data: floorPlans, error: fpError } = await supabase.rpc(
    'get_location_floor_plans',
    {
      p_location_id: locationId
    }
  )

  if (!fpError && Array.isArray(floorPlans) && floorPlans.length > 0) {
    console.log('[InitializeFloorPlan] floorPlans', floorPlans)
    return floorPlans as FloorPlan[]
  }

  // Fallback 1: direct table reads with authenticated client.
  const { data: authBasePlans, error: authBasePlansError } = await supabase
    .from('floor_plans')
    .select(
      'id, name, description, is_active, is_default, display_order, canvas_width, canvas_height, grid_size, background_color'
    )
    .eq('location_id', locationId)
    .order('display_order', { ascending: true })

  if (!authBasePlansError && authBasePlans && authBasePlans.length > 0) {
    const floorPlanIds = authBasePlans.map(fp => fp.id)
    const { data: authObjects, error: authObjectsError } = await supabase
      .from('floor_plan_objects')
      .select('*')
      .in('floor_plan_id', floorPlanIds)

    if (!authObjectsError) {
      const objectsByFloorPlan = new Map<string, FloorPlanObject[]>()
      for (const obj of (authObjects || []) as FloorPlanObject[]) {
        const existing = objectsByFloorPlan.get(obj.floor_plan_id) || []
        existing.push(obj)
        objectsByFloorPlan.set(obj.floor_plan_id, existing)
      }

      return (authBasePlans as Array<Partial<FloorPlan> & { id: string }>).map(
        fp => ({
          id: fp.id,
          name: fp.name || 'Floor Plan',
          description: fp.description ?? null,
          is_active: fp.is_active ?? true,
          is_default: fp.is_default ?? false,
          display_order: fp.display_order ?? 0,
          table_count: 0,
          total_capacity: 0,
          canvas_width: fp.canvas_width,
          canvas_height: fp.canvas_height,
          grid_size: fp.grid_size,
          background_color: fp.background_color,
          objects: objectsByFloorPlan.get(fp.id) || []
        })
      )
    }
  }

  if (fpError && authBasePlansError) {
    throw fpError
  }

  return [] as FloorPlan[]
}

export async function LoadFloorPlanStatus (floorPlanId: string) {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_floor_plan_status', {
    p_floor_plan_id: floorPlanId
  })

  // console.log('[LoadFloorPlanStatus] data', data)
  if (error) {
    throw error
  }

  return {
    tables: (data?.tables || []) as TableWithSession[]
  }
}

export async function CreateFloorPlanAction (
  locationId: string,
  name: string,
  description?: string
) {
  const supabase = createServerSupabaseClient()
  const user = await currentUser()

  console.log('[CreateFloorPlanAction] Creating floor plan:', {
    locationId,
    name,
    description
  })

  // Get the location to find merchant_id
  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('merchant_id')
    .eq('id', locationId)
    .single()

  if (locationError || !location) {
    throw new Error('Location not found')
  }

  // Get current user's staff profile ID
  let createdBy: string | null = null
  if (user?.id) {
    const { data: staffProfile } = await supabase
      .from('staff_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()
    createdBy = staffProfile?.id || null
  }

  // Create floor plan directly
  const { data: floorPlan, error } = await supabase
    .from('floor_plans')
    .insert({
      merchant_id: location.merchant_id,
      location_id: locationId,
      name,
      description,
      canvas_width: 1200,
      canvas_height: 800,
      created_by: createdBy
    })
    .select()
    .single()

  if (error) {
    console.error('[CreateFloorPlanAction] Insert Error:', error)
    throw error
  }

  // Reload floor plans
  const { data: floorPlans } = await supabase
    .from('floor_plans')
    .select('*')
    .eq('location_id', locationId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  // Log Audit Event
  await LogAuditEvent({
    action: `Created Floor Plan: ${name}`,
    actionCategory: 'settings',
    resourceType: 'floor_plan',
    resourceId: floorPlan.id,
    resourceName: name,
    locationId: locationId,
    changes: { after: { name, description } }
  })

  return {
    floorPlanId: floorPlan.id,
    floorPlans: (floorPlans || []) as FloorPlan[]
  }
}

export async function AddTableAction (
  floorPlanId: string,
  tableData: {
    name?: string
    shape_id: string
    category?: string
    x: number
    y: number
    rotation?: number
    capacity?: number | null
    width?: number | null
    height?: number | null
  }
) {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('add_floor_plan_object', {
    p_floor_plan_id: floorPlanId,
    p_name: tableData.name || 'Table',
    p_shape_id: tableData.shape_id,
    p_category: tableData.category || 'table',
    p_x: tableData.x,
    p_y: tableData.y,
    p_rotation: tableData.rotation || 0,
    p_capacity: tableData.capacity ?? null,
    p_width: tableData.width ?? null,
    p_height: tableData.height ?? null
  })

  if (error) throw error

  // Log Audit Event
  await LogAuditEvent({
    action: `Added Table: ${tableData.name || 'Table'}`,
    actionCategory: 'settings',
    resourceType: 'table',
    resourceId: data.object_id,
    resourceName: tableData.name || 'Table',
    changes: { after: tableData as any }
  })

  return { objectId: data.object_id }
}

export async function UpdateTablePositionAction (
  tableId: string,
  x: number,
  y: number,
  rotation?: number
) {
  const supabase = createServerSupabaseClient()

  // Fetch context before update
  const { data: table } = await supabase
    .from('floor_plan_objects')
    .select('name, floor_plan:floor_plans(location_id, merchant_id)')
    .eq('id', tableId)
    .single()

  const { error } = await supabase.rpc('update_floor_plan_object_position', {
    p_object_id: tableId,
    p_x: x,
    p_y: y,
    p_rotation: rotation
  })

  if (error) throw error

  if (table) {
    const fp = (table as any).floor_plan
    await LogAuditEvent({
      merchantId: fp?.merchant_id,
      action: `Moved Table: ${table.name}`,
      actionCategory: 'settings',
      resourceType: 'table',
      resourceId: tableId,
      resourceName: table.name,
      locationId: fp?.location_id,
      changes: { after: { x, y, rotation } }
    })
  }
}

export async function UpdateTablePositionsBatchAction (
  updates: Array<{ id: string; x: number; y: number; rotation?: number }>
) {
  const supabase = createServerSupabaseClient()
  // console.log("[UpdateTablePositionsBatchAction] updates", updates);

  if (updates.length === 0) return

  const { error } = await supabase.rpc('update_floor_plan_objects_batch', {
    p_updates: updates
  })

  if (error) throw error

  // Log Audit Event (Batched)
  // Fetch context from the first table
  const firstId = updates[0].id
  const { data: tableContext } = await supabase
    .from('floor_plan_objects')
    .select('floor_plan:floor_plans(id, name, location_id, merchant_id)')
    .eq('id', firstId)
    .single()

  if (tableContext && (tableContext as any).floor_plan) {
    const fp = (tableContext as any).floor_plan
    await LogAuditEvent({
      merchantId: fp.merchant_id,
      action: `Updated Floor Plan Layout`,
      actionCategory: 'settings',
      resourceType: 'floor_plan',
      resourceId: fp.id,
      resourceName: fp.name,
      locationId: fp.location_id,
      metadata: {
        tables_updated_count: updates.length
      },
      changes: { after: { updates_count: updates.length } } // Simplified change log
    })
  }
}

export async function RemoveTableAction (tableId: string) {
  const supabase = createServerSupabaseClient()

  const { data: tableToDelete } = await supabase
    .from('floor_plan_objects')
    .select('name, floor_plan:floor_plans(location_id, merchant_id)')
    .eq('id', tableId)
    .single()

  const { error } = await supabase
    .from('floor_plan_objects')
    .delete()
    .eq('id', tableId)

  if (error) throw error

  // Log Audit Event
  if (tableToDelete) {
    // Cast because joined relationship might not be typed fully
    const locationId = (tableToDelete as any).floor_plan?.location_id
    const merchantId = (tableToDelete as any).floor_plan?.merchant_id

    await LogAuditEvent({
      merchantId: merchantId,
      action: `Removed Table: ${tableToDelete.name}`,
      actionCategory: 'settings',
      resourceType: 'table',
      resourceId: tableId,
      resourceName: tableToDelete.name,
      locationId: locationId,
      severity: 'warning'
    })
  }
}

export async function UpdateTableRotationAction (
  tableId: string,
  rotation: number
) {
  const supabase = createServerSupabaseClient()

  // Fetch context
  const { data: table } = await supabase
    .from('floor_plan_objects')
    .select('name, floor_plan:floor_plans(location_id, merchant_id)')
    .eq('id', tableId)
    .single()

  const { error } = await supabase
    .from('floor_plan_objects')
    .update({ rotation })
    .eq('id', tableId)

  if (error) throw error

  if (table) {
    const fp = (table as any).floor_plan
    await LogAuditEvent({
      merchantId: fp?.merchant_id,
      action: `Rotated Table: ${table.name}`,
      actionCategory: 'settings',
      resourceType: 'table',
      resourceId: tableId,
      resourceName: table.name,
      locationId: fp?.location_id,
      changes: { after: { rotation } }
    })
  }
}

export async function UpdateTableNameAction (tableId: string, name: string) {
  const supabase = createServerSupabaseClient()

  // Fetch table for context
  const { data: table } = await supabase
    .from('floor_plan_objects')
    .select('name, floor_plan:floor_plans(location_id, merchant_id)')
    .eq('id', tableId)
    .single()

  const { error } = await supabase
    .from('floor_plan_objects')
    .update({ name })
    .eq('id', tableId)

  if (error) throw error

  if (table) {
    const locationId = (table as any).floor_plan?.location_id
    const merchantId = (table as any).floor_plan?.merchant_id

    await LogAuditEvent({
      merchantId: merchantId,
      action: `Renamed Table: ${table.name} -> ${name}`,
      actionCategory: 'settings',
      resourceType: 'table',
      resourceId: tableId,
      resourceName: name,
      locationId: locationId,
      changes: {
        before: { name: table.name },
        after: { name }
      }
    })
  }
}

export async function UpdateFloorPlanAction (
  floorPlanId: string,
  updates: {
    name?: string
    description?: string
    is_default?: boolean
    canvas_width?: number
    canvas_height?: number
  }
) {
  const supabase = createServerSupabaseClient()

  const { data: fp } = await supabase
    .from('floor_plans')
    .select('name, location_id')
    .eq('id', floorPlanId)
    .single()

  // If setting as default, unset all others for this location first
  if (updates.is_default && fp?.location_id) {
    await supabase
      .from('floor_plans')
      .update({ is_default: false })
      .eq('location_id', fp.location_id)
  }

  const { error } = await supabase
    .from('floor_plans')
    .update(updates)
    .eq('id', floorPlanId)

  if (error) throw error

  if (fp) {
    await LogAuditEvent({
      action: `Updated Floor Plan: ${fp.name}`,
      actionCategory: 'settings',
      resourceType: 'floor_plan',
      resourceId: floorPlanId,
      resourceName: updates.name || fp.name,
      locationId: fp.location_id,
      changes: { after: updates }
    })
  }
}

export async function DeleteFloorPlanAction (floorPlanId: string) {
  const supabase = createServerSupabaseClient()

  const { data: fp } = await supabase
    .from('floor_plans')
    .select('name, location_id, is_default')
    .eq('id', floorPlanId)
    .single()

  if (fp?.is_default) throw new Error('Cannot delete the default floor plan.')

  const { error } = await supabase
    .from('floor_plans')
    .delete()
    .eq('id', floorPlanId)

  if (error) throw error

  if (fp) {
    await LogAuditEvent({
      action: `Deleted Floor Plan: ${fp.name}`,
      actionCategory: 'settings',
      resourceType: 'floor_plan',
      resourceId: floorPlanId,
      resourceName: fp.name,
      locationId: fp.location_id,
      changes: { before: { name: fp.name } }
    })
  }
}

export async function UpdateTablePropertiesAction (
  tableId: string,
  properties: {
    name?: string
    capacity?: number | null
    min_capacity?: number | null
    is_reservable?: boolean
    is_combinable?: boolean
    default_turn_time?: number | null
    section_id?: string | null
    zone_name?: string | null
    label_override?: string | null
    color_override?: string | null
  }
) {
  const supabase = createServerSupabaseClient()

  // Fetch context before update
  const { data: table } = await supabase
    .from('floor_plan_objects')
    .select('*, floor_plan:floor_plans(location_id, merchant_id)')
    .eq('id', tableId)
    .single()

  // Build update object, only including defined fields
  const updateData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) {
      updateData[key] = value
    }
  }

  if (Object.keys(updateData).length === 0) return

  const { error } = await supabase
    .from('floor_plan_objects')
    .update(updateData)
    .eq('id', tableId)

  if (error) throw error

  if (table) {
    const fp = (table as any).floor_plan
    await LogAuditEvent({
      merchantId: fp?.merchant_id,
      action: `Updated Table Properties: ${table.name}`,
      actionCategory: 'settings',
      resourceType: 'table',
      resourceId: tableId,
      resourceName: table.name,
      locationId: fp?.location_id,
      changes: {
        before: Object.fromEntries(
          Object.keys(updateData).map(k => [k, (table as any)[k]])
        ),
        after: updateData
      }
    })
  }
}

export async function MergeTablesAction (
  tableIds: string[],
  primaryTableId: string
) {
  // Note: Merging is a design-time feature for grouping tables visually.
  // Since the database schema doesn't have merged_with/is_primary columns in floor_plan_objects,
  // we'll handle this client-side. The merge state will be stored in the component state
  // and can be persisted later if needed via a metadata JSONB field or separate table.
  // For now, this action is a no-op - merging is handled entirely client-side.
  return { success: true }
}

export async function UnmergeTablesAction (tableId: string) {
  // Note: Unmerging is handled client-side (see MergeTablesAction comment)
  return { success: true }
}

export async function LoadWaitlistAction (locationId: string) {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_waitlist', {
    p_location_id: locationId
  })

  if (!error) {
    return {
      waitlist: (data?.waitlist || []) as WaitlistEntry[],
      summary: (data?.summary || {
        total_waiting: 0,
        total_notified: 0,
        avg_wait_time: 0
      }) as {
        total_waiting: number
        total_notified: number
        avg_wait_time: number
      }
    }
  }

  // Fallback with authenticated direct table reads when RPC auth context is unavailable.
  const { data: rows, error: rowsError } = await supabase
    .from('waitlist')
    .select(
      'id, party_name, party_size, phone, status, position_in_queue, quoted_wait_minutes, estimated_ready_at, actual_wait_minutes, preferred_section, seating_preference, notes, created_at, notified_at'
    )
    .eq('location_id', locationId)
    .in('status', ['waiting', 'notified', 'arrived'])
    .gte('created_at', new Date().toISOString().split('T')[0])
    .order('position_in_queue', { ascending: true })

  if (rowsError) throw rowsError

  const now = Date.now()
  const waitlist = (rows || []).map((row: any) => {
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : now
    return {
      id: row.id,
      party_name: row.party_name,
      party_size: row.party_size,
      phone: row.phone,
      status: row.status,
      position: row.position_in_queue,
      quoted_wait_minutes: row.quoted_wait_minutes,
      estimated_ready_at: row.estimated_ready_at,
      actual_wait_minutes: row.actual_wait_minutes,
      preferred_section: row.preferred_section,
      seating_preference: row.seating_preference,
      notes: row.notes,
      created_at: row.created_at,
      notified_at: row.notified_at,
      minutes_waiting: Math.floor((now - createdAt) / 60000)
    }
  }) as WaitlistEntry[]

  const totalWaiting = waitlist.filter(w => w.status === 'waiting').length
  const totalNotified = waitlist.filter(w => w.status === 'notified').length
  const waited = waitlist
    .map(w => w.actual_wait_minutes)
    .filter((v): v is number => typeof v === 'number')
  const avgWaitTime =
    waited.length > 0
      ? waited.reduce((acc, val) => acc + val, 0) / waited.length
      : 0

  return {
    waitlist,
    summary: {
      total_waiting: totalWaiting,
      total_notified: totalNotified,
      avg_wait_time: avgWaitTime
    } as {
      total_waiting: number
      total_notified: number
      avg_wait_time: number
    }
  }
}

export async function LoadReservationsAction (
  locationId: string,
  date?: string,
  includeCancelled = false
) {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_reservations', {
    p_location_id: locationId,
    p_date: date,
    p_include_cancelled: includeCancelled
  })

  if (error) throw error

  return (data?.reservations || []) as Reservation[]
}

export async function AddToWaitlistAction (
  locationId: string,
  params: {
    partyName: string
    partySize: number
    phone?: string
    notes?: string
    preferredSection?: string
    quotedWaitMinutes?: number
  }
) {
  const supabase = createServerSupabaseClient()

  const normalizedPhone = params.phone ? normalizePhone(params.phone) : null
  if (params.phone && !normalizedPhone) {
    throw new Error('Invalid phone number — please enter 10 digits')
  }

  const { data, error } = await supabase.rpc('add_to_waitlist', {
    p_location_id: locationId,
    p_party_name: params.partyName,
    p_party_size: params.partySize,
    p_phone: normalizedPhone,
    p_notes: params.notes || null,
    p_preferred_section: params.preferredSection || null,
    p_quoted_wait_minutes: params.quotedWaitMinutes || null
  })

  if (error) throw error

  const waitlistId = data.waitlist_id as string
  const position = data.position as number
  const quotedWait = (data.quoted_wait_minutes ?? null) as number | null

  // Log Audit Event
  await LogAuditEvent({
    action: `Added to Waitlist: ${params.partyName}`,
    actionCategory: 'waitlist',
    resourceType: 'waitlist_entry',
    resourceId: waitlistId,
    resourceName: params.partyName,
    locationId: locationId,
    metadata: {
      party_size: params.partySize,
      phone: params.phone,
      quoted_wait: params.quotedWaitMinutes,
      preferred_section: params.preferredSection
    },
    changes: { after: params as unknown as Record<string, unknown> }
  })

  // Best-effort welcome notification (SMS / email if available on the entry).
  if (params.phone) {
    notifyWaitlistAdded(waitlistId).catch((err) => {
      console.error('[notifyWaitlistAdded] failed:', err)
    })
  }

  return {
    waitlistId,
    position,
    quotedWait,
    success: true
  }
}

export async function UpdateWaitlistEntryAction (
  locationId: string,
  waitlistId: string,
  params: {
    partyName?: string
    partySize?: number
    phone?: string
    notes?: string
    preferredSection?: string
    seatingPreference?: string
    quotedWaitMinutes?: number
  }
) {
  const { userId, orgId } = await auth()

  if (!userId) {
    throw new Error('Not authenticated')
  }

  const serviceRole = createServiceRoleClient()

  const merchantId = await resolveActiveMerchantId(serviceRole, orgId)
  if (!merchantId) {
    throw new Error('Merchant not found for organization')
  }
  const merchant = { id: merchantId }

  const { data: location, error: locationError } = await serviceRole
    .from('locations')
    .select('id, merchant_id')
    .eq('id', locationId)
    .eq('merchant_id', merchant.id)
    .maybeSingle()

  if (locationError || !location) {
    throw locationError ?? new Error('Location not found')
  }

  const { data: existing, error: existingError } = await serviceRole
    .from('waitlist')
    .select(
      'id, status, party_name, party_size, phone, notes, preferred_section, seating_preference, quoted_wait_minutes, location_id, merchant_id'
    )
    .eq('id', waitlistId)
    .eq('location_id', location.id)
    .eq('merchant_id', merchant.id)
    .maybeSingle()

  if (existingError || !existing) {
    throw existingError ?? new Error('Waitlist entry not found')
  }

  if (['seated', 'cancelled', 'no_show', 'expired'].includes(existing.status)) {
    throw new Error('This waitlist entry can no longer be edited')
  }

  const updateData: Record<string, unknown> = {}
  if (params.partyName !== undefined) updateData.party_name = params.partyName
  if (params.partySize !== undefined) updateData.party_size = params.partySize
  if (params.phone !== undefined) {
    if (params.phone) {
      const normalized = normalizePhone(params.phone)
      if (!normalized) {
        throw new Error('Invalid phone number — please enter 10 digits')
      }
      updateData.phone = normalized
    } else {
      updateData.phone = null
    }
  }
  if (params.notes !== undefined) updateData.notes = params.notes || null
  if (params.preferredSection !== undefined) {
    updateData.preferred_section = params.preferredSection || null
  }
  if (params.seatingPreference !== undefined) {
    updateData.seating_preference = params.seatingPreference || null
  }
  if (params.quotedWaitMinutes !== undefined) {
    updateData.quoted_wait_minutes = params.quotedWaitMinutes
  }

  if (Object.keys(updateData).length === 0) {
    return existing as WaitlistEntry
  }

  const { data: updated, error: updateError } = await serviceRole
    .from('waitlist')
    .update(updateData)
    .eq('id', waitlistId)
    .eq('location_id', location.id)
    .eq('merchant_id', merchant.id)
    .neq('status', 'seated')
    .neq('status', 'cancelled')
    .neq('status', 'no_show')
    .neq('status', 'expired')
    .select(
      'id, status, party_name, party_size, phone, notes, preferred_section, seating_preference, quoted_wait_minutes, location_id, merchant_id'
    )
    .maybeSingle()

  if (updateError) throw updateError
  if (!updated) throw new Error('Failed to update waitlist entry')

  await LogAuditEvent({
    merchantId: merchant.id,
    locationId,
    action: `Updated Waitlist Entry: ${updated.party_name}`,
    actionCategory: 'waitlist',
    resourceType: 'waitlist_entry',
    resourceId: waitlistId,
    resourceName: updated.party_name,
    changes: {
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>
    }
  })

  return updated as WaitlistEntry
}

export async function DeleteWaitlistEntryAction (
  locationId: string,
  waitlistId: string
) {
  const { userId, orgId } = await auth()

  if (!userId) {
    throw new Error('Not authenticated')
  }

  const serviceRole = createServiceRoleClient()

  const merchantId = await resolveActiveMerchantId(serviceRole, orgId)
  if (!merchantId) {
    throw new Error('Merchant not found for organization')
  }
  const merchant = { id: merchantId }

  const { data: entry, error: entryError } = await serviceRole
    .from('waitlist')
    .select(
      'id, party_name, status, party_size, phone, notes, preferred_section, seating_preference, quoted_wait_minutes, location_id, merchant_id'
    )
    .eq('id', waitlistId)
    .eq('location_id', locationId)
    .eq('merchant_id', merchant.id)
    .maybeSingle()

  if (entryError || !entry) {
    throw entryError ?? new Error('Waitlist entry not found')
  }

  if (entry.status === 'seated') {
    throw new Error('Cannot delete a seated waitlist entry')
  }

  const { error: deleteError } = await serviceRole
    .from('waitlist')
    .delete()
    .eq('id', waitlistId)
    .eq('location_id', locationId)
    .eq('merchant_id', merchant.id)

  if (deleteError) throw deleteError

  await LogAuditEvent({
    merchantId: merchant.id,
    locationId,
    action: `Deleted Waitlist Entry: ${entry.party_name}`,
    actionCategory: 'waitlist',
    resourceType: 'waitlist_entry',
    resourceId: waitlistId,
    resourceName: entry.party_name,
    severity: 'warning',
    changes: {
      before: entry as unknown as Record<string, unknown>
    }
  })

  return { success: true }
}

export async function CreateReservationAction (
  clerkOrgId: string,
  locationId: string,
  params: {
    partyName: string
    partySize: number
    phone: string
    email?: string
    reservationDate: string
    reservationTime: string
    durationMinutes?: number
    isVip?: boolean
    notes?: string
    specialRequests?: string
    preferredSection?: string
    seatingPreference?: string
    assignedTableIds?: string[]
    source?: string
  }
) {
  const supabase = createServerSupabaseClient()

  const normalizedPhone = normalizePhone(params.phone)
  if (!normalizedPhone) {
    throw new Error('Invalid phone number — please enter 10 digits')
  }

  const { data, error } = await supabase.rpc('create_reservation', {
    p_location_id: locationId,
    p_party_name: params.partyName,
    p_party_size: params.partySize,
    p_phone: normalizedPhone,
    p_email: params.email ?? null,
    p_reservation_date: params.reservationDate,
    p_reservation_time: params.reservationTime,
    p_duration_minutes: params.durationMinutes ?? 90,
    p_is_vip: params.isVip ?? false,
    p_notes: params.notes ?? null,
    p_special_requests: params.specialRequests ?? null,
    p_preferred_section: params.preferredSection ?? null,
    p_seating_preference: params.seatingPreference ?? null,
    p_assigned_table_ids: params.assignedTableIds ?? null,
    p_source: params.source ?? 'web_dashboard'
  })
  if (error) throw error
  const reservationId = (data as any)?.reservation_id as string | undefined
  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: 'created_reservation',
    actionCategory: 'reservations',
    severity: 'info',
    resourceType: 'reservation',
    resourceId: reservationId,
    resourceName: params.partyName
  })
  if (reservationId && (params.phone || params.email)) {
    notifyReservationConfirmed(reservationId).catch((err) => {
      console.error('[notifyReservationConfirmed] failed:', err)
    })
  }
  return data as { reservation_id: string; confirmation_number: string }
}

export async function UpdateReservationStatusAction (
  clerkOrgId: string,
  locationId: string,
  reservationId: string,
  status: Reservation['status']
) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('update_reservation_status', {
    p_reservation_id: reservationId,
    p_status: status,
    p_cancellation_reason: null
  })
  if (error) throw error
  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: 'updated_reservation_status',
    actionCategory: 'reservations',
    severity: 'info',
    resourceType: 'reservation',
    resourceId: reservationId,
    resourceName: status
  })
  return data
}

export async function UpdateReservationAction (
  clerkOrgId: string,
  locationId: string,
  reservationId: string,
  params: {
    partyName?: string
    partySize?: number
    phone?: string
    email?: string
    reservationDate?: string
    reservationTime?: string
    durationMinutes?: number
    isVip?: boolean
    notes?: string
    specialRequests?: string
    preferredSection?: string
    seatingPreference?: string
  }
) {
  const supabase = createServerSupabaseClient()

  const { data: existing, error: existingError } = await supabase
    .from('reservations')
    .select(
      'id, party_name, party_size, phone, email, reservation_date, reservation_time, duration_minutes, is_vip, notes, special_requests, preferred_section, seating_preference'
    )
    .eq('id', reservationId)
    .eq('location_id', locationId)
    .single()

  if (existingError || !existing) {
    throw existingError ?? new Error('Reservation not found')
  }

  const updateData: Record<string, unknown> = {}

  if (params.partyName !== undefined) updateData.party_name = params.partyName
  if (params.partySize !== undefined) updateData.party_size = params.partySize
  if (params.phone !== undefined) {
    const normalized = normalizePhone(params.phone)
    if (!normalized) {
      throw new Error('Invalid phone number — please enter 10 digits')
    }
    updateData.phone = normalized
  }
  if (params.email !== undefined) updateData.email = params.email || null
  if (params.reservationDate !== undefined) {
    updateData.reservation_date = params.reservationDate
  }
  if (params.reservationTime !== undefined) {
    updateData.reservation_time = params.reservationTime
  }
  if (params.durationMinutes !== undefined) {
    updateData.duration_minutes = params.durationMinutes
  }
  if (params.isVip !== undefined) updateData.is_vip = params.isVip
  if (params.notes !== undefined) updateData.notes = params.notes || null
  if (params.specialRequests !== undefined) {
    updateData.special_requests = params.specialRequests || null
  }
  if (params.preferredSection !== undefined) {
    updateData.preferred_section = params.preferredSection || null
  }
  if (params.seatingPreference !== undefined) {
    updateData.seating_preference = params.seatingPreference || null
  }

  if (Object.keys(updateData).length === 0) {
    return existing as Reservation
  }

  const { data, error } = await supabase
    .from('reservations')
    .update(updateData)
    .eq('id', reservationId)
    .eq('location_id', locationId)
    .select('*')
    .single()

  if (error) throw error

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: 'updated_reservation',
    actionCategory: 'reservations',
    severity: 'info',
    resourceType: 'reservation',
    resourceId: reservationId,
    resourceName: data.party_name,
    changes: {
      before: existing as unknown as Record<string, unknown>,
      after: data as unknown as Record<string, unknown>
    }
  })

  return data as Reservation
}

export async function CancelReservationAction (
  clerkOrgId: string,
  locationId: string,
  reservationId: string,
  cancellationReason?: string
) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('update_reservation_status', {
    p_reservation_id: reservationId,
    p_status: 'cancelled',
    p_cancellation_reason: cancellationReason ?? null
  })
  if (error) throw error
  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: 'cancelled_reservation',
    actionCategory: 'reservations',
    severity: 'info',
    resourceType: 'reservation',
    resourceId: reservationId,
    resourceName: cancellationReason ?? 'no reason'
  })
  notifyReservationCancelled(reservationId, cancellationReason ?? null).catch(
    (err) => {
      console.error('[notifyReservationCancelled] failed:', err)
    }
  )
  return data
}

export async function AssignReservationTablesAction (
  clerkOrgId: string,
  locationId: string,
  reservationId: string,
  tableIds: string[]
) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('assign_reservation_tables', {
    p_reservation_id: reservationId,
    p_table_ids: tableIds
  })
  if (error) throw error
  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: 'assigned_reservation_tables',
    actionCategory: 'reservations',
    severity: 'info',
    resourceType: 'reservation',
    resourceId: reservationId,
    resourceName: tableIds.join(', ')
  })
  return data
}
