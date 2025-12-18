'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { FloorPlan, FloorPlanObject, TableWithSession, WaitlistEntry, Reservation } from '@/types/floor-plan'
import { TableStatus } from '@/types/floor-plan'

/**
 * Server actions for floor plan operations
 * These are called from the client-side store
 */

export async function InitializeFloorPlan(locationId: string) {
    const supabase = createServerSupabaseClient()

    const { data: floorPlans, error: fpError } = await supabase.rpc('get_location_floor_plans', {
        p_location_id: locationId,
    })

    if (fpError) {
        throw fpError
    }

    console.log('[InitializeFloorPlan] floorPlans', floorPlans)
    return floorPlans as FloorPlan[]
}

export async function LoadFloorPlanStatus(floorPlanId: string) {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase.rpc('get_floor_plan_status', {
        p_floor_plan_id: floorPlanId,
    })

    console.log('[LoadFloorPlanStatus] data', data)
    if (error) {
        throw error
    }

    return {
        tables: (data?.tables || []) as TableWithSession[],
    }
}

export async function CreateFloorPlanAction(locationId: string, name: string, description?: string) {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase.rpc('create_floor_plan', {
        p_location_id: locationId,
        p_name: name,
        p_description: description,
    })

    if (error) throw error

    // Reload floor plans
    const { data: floorPlans } = await supabase.rpc('get_location_floor_plans', {
        p_location_id: locationId,
    })

    return {
        floorPlanId: data.floor_plan_id,
        floorPlans: (floorPlans || []) as FloorPlan[],
    }
}

export async function AddTableAction(
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
        p_height: tableData.height ?? null,
    })

    if (error) throw error

    return { objectId: data.object_id }
}

export async function UpdateTablePositionAction(
    tableId: string,
    x: number,
    y: number,
    rotation?: number
) {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase.rpc('update_floor_plan_object_position', {
        p_object_id: tableId,
        p_x: x,
        p_y: y,
        p_rotation: rotation,
    })

    if (error) throw error
}

export async function UpdateTablePositionsBatchAction(
    updates: Array<{ id: string; x: number; y: number; rotation?: number }>
) {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase.rpc('update_floor_plan_objects_batch', {
        p_updates: updates,
    })

    if (error) throw error
}

export async function RemoveTableAction(tableId: string) {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase.from('floor_plan_objects').delete().eq('id', tableId)

    if (error) throw error
}

export async function UpdateTableRotationAction(tableId: string, rotation: number) {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('floor_plan_objects')
        .update({ rotation })
        .eq('id', tableId)

    if (error) throw error
}

export async function UpdateTableNameAction(tableId: string, name: string) {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('floor_plan_objects')
        .update({ name })
        .eq('id', tableId)

    if (error) throw error
}

export async function MergeTablesAction(tableIds: string[], primaryTableId: string) {
    // Note: Merging is a design-time feature for grouping tables visually.
    // Since the database schema doesn't have merged_with/is_primary columns in floor_plan_objects,
    // we'll handle this client-side. The merge state will be stored in the component state
    // and can be persisted later if needed via a metadata JSONB field or separate table.
    // For now, this action is a no-op - merging is handled entirely client-side.
    return { success: true }
}

export async function UnmergeTablesAction(tableId: string) {
    // Note: Unmerging is handled client-side (see MergeTablesAction comment)
    return { success: true }
}

export async function LoadWaitlistAction(locationId: string) {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase.rpc('get_waitlist', {
        p_location_id: locationId,

    })

    if (error) throw error

    return (data || []) as WaitlistEntry[]
}

export async function LoadReservationsAction(locationId: string, date?: string) {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase.rpc('get_reservations', {
        p_location_id: locationId,
        p_date: date,
    })

    if (error) throw error

    return (data || []) as Reservation[]
}

