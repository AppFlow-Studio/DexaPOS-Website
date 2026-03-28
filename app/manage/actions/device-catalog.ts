'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'

export type DeviceCategory =
  | 'pos_tablet'
  | 'cfd'
  | 'kds'
  | 'payment_terminal'
  | 'receipt_printer'
  | 'kitchen_printer'
  | 'cash_drawer'

export interface DeviceCatalogItem {
  id: string
  device_category: DeviceCategory
  manufacturer: string
  model_name: string
  model_sku: string | null
  hardware_revision: string | null
  specs: Record<string, unknown>
  unit_cost_cents: number | null
  monthly_fee_cents: number | null
  is_active: boolean
  discontinued_at: string | null
  image_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CreateDeviceCatalogInput {
  device_category: DeviceCategory
  manufacturer: string
  model_name: string
  model_sku?: string | null
  hardware_revision?: string | null
  specs?: Record<string, unknown>
  unit_cost_cents?: number | null
  monthly_fee_cents?: number | null
  is_active?: boolean
  image_url?: string | null
  notes?: string | null
}

export interface UpdateDeviceCatalogInput {
  device_category?: DeviceCategory
  manufacturer?: string
  model_name?: string
  model_sku?: string | null
  hardware_revision?: string | null
  specs?: Record<string, unknown>
  unit_cost_cents?: number | null
  monthly_fee_cents?: number | null
  is_active?: boolean
  image_url?: string | null
  notes?: string | null
}

export interface DeviceCatalogFilters {
  category?: DeviceCategory | null
  manufacturer?: string | null
  isActive?: boolean | null
  search?: string | null
}

// ============================================================================
// READ
// ============================================================================

export async function getDeviceCatalog(filters?: DeviceCatalogFilters) {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('device_catalog')
      .select('*')
      .order('device_category')
      .order('manufacturer')
      .order('model_name')

    if (filters?.category) {
      query = query.eq('device_category', filters.category)
    }
    if (filters?.manufacturer) {
      query = query.eq('manufacturer', filters.manufacturer)
    }
    if (filters?.isActive !== null && filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive)
    }
    if (filters?.search) {
      const term = `%${filters.search}%`
      query = query.or(
        `model_name.ilike.${term},manufacturer.ilike.${term},model_sku.ilike.${term}`
      )
    }

    const { data, error } = await query

    if (error) {
      console.error('[getDeviceCatalog] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    return { success: true, data: data as DeviceCatalogItem[], error: null }
  } catch (error) {
    console.error('[getDeviceCatalog] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

export async function getDeviceCatalogItem(id: string) {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('device_catalog')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('[getDeviceCatalogItem] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    return { success: true, data: data as DeviceCatalogItem, error: null }
  } catch (error) {
    console.error('[getDeviceCatalogItem] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// ============================================================================
// CREATE
// ============================================================================

export async function createDeviceCatalogItem(input: CreateDeviceCatalogInput) {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient()

    if (input.model_sku) {
      const { data: existing } = await supabase
        .from('device_catalog')
        .select('id')
        .eq('model_sku', input.model_sku)
        .maybeSingle()

      if (existing) {
        return {
          success: false,
          error: `SKU "${input.model_sku}" already exists`,
          data: null,
        }
      }
    }

    const { data, error } = await supabase
      .from('device_catalog')
      .insert({
        device_category: input.device_category,
        manufacturer: input.manufacturer,
        model_name: input.model_name,
        model_sku: input.model_sku || null,
        hardware_revision: input.hardware_revision || null,
        specs: input.specs || {},
        unit_cost_cents: input.unit_cost_cents ?? null,
        monthly_fee_cents: input.monthly_fee_cents ?? null,
        is_active: input.is_active ?? true,
        image_url: input.image_url || null,
        notes: input.notes || null,
      })
      .select()
      .single()

    if (error) {
      console.error('[createDeviceCatalogItem] Error:', error)
      if (error.code === '23505') {
        return { success: false, error: 'A device with that SKU already exists', data: null }
      }
      return { success: false, error: error.message, data: null }
    }

    return { success: true, data: data as DeviceCatalogItem, error: null }
  } catch (error) {
    console.error('[createDeviceCatalogItem] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// ============================================================================
// UPDATE
// ============================================================================

export async function updateDeviceCatalogItem(
  id: string,
  input: UpdateDeviceCatalogInput
) {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient()

    const { data: current, error: fetchError } = await supabase
      .from('device_catalog')
      .select('model_sku')
      .eq('id', id)
      .single()

    if (fetchError || !current) {
      return { success: false, error: 'Device not found', data: null }
    }

    if (
      input.model_sku !== undefined &&
      input.model_sku !== current.model_sku &&
      input.model_sku
    ) {
      const { data: existing } = await supabase
        .from('device_catalog')
        .select('id')
        .eq('model_sku', input.model_sku)
        .neq('id', id)
        .maybeSingle()

      if (existing) {
        return {
          success: false,
          error: `SKU "${input.model_sku}" already exists`,
          data: null,
        }
      }
    }

    const updateData: Record<string, unknown> = {}
    if (input.device_category !== undefined) updateData.device_category = input.device_category
    if (input.manufacturer !== undefined) updateData.manufacturer = input.manufacturer
    if (input.model_name !== undefined) updateData.model_name = input.model_name
    if (input.model_sku !== undefined) updateData.model_sku = input.model_sku || null
    if (input.hardware_revision !== undefined) updateData.hardware_revision = input.hardware_revision || null
    if (input.specs !== undefined) updateData.specs = input.specs
    if (input.unit_cost_cents !== undefined) updateData.unit_cost_cents = input.unit_cost_cents
    if (input.monthly_fee_cents !== undefined) updateData.monthly_fee_cents = input.monthly_fee_cents
    if (input.is_active !== undefined) updateData.is_active = input.is_active
    if (input.image_url !== undefined) updateData.image_url = input.image_url || null
    if (input.notes !== undefined) updateData.notes = input.notes || null

    const { data, error } = await supabase
      .from('device_catalog')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[updateDeviceCatalogItem] Error:', error)
      if (error.code === '23505') {
        return { success: false, error: 'A device with that SKU already exists', data: null }
      }
      return { success: false, error: error.message, data: null }
    }

    return { success: true, data: data as DeviceCatalogItem, error: null }
  } catch (error) {
    console.error('[updateDeviceCatalogItem] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// ============================================================================
// TOGGLE STATUS
// ============================================================================

export async function toggleDeviceCatalogItemStatus(id: string) {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient()

    const { data: current, error: fetchError } = await supabase
      .from('device_catalog')
      .select('is_active')
      .eq('id', id)
      .single()

    if (fetchError || !current) {
      return { success: false, error: 'Device not found', data: null }
    }

    const newActive = !current.is_active
    const updateData: Record<string, unknown> = {
      is_active: newActive,
      discontinued_at: newActive ? null : new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('device_catalog')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[toggleDeviceCatalogItemStatus] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    return { success: true, data: data as DeviceCatalogItem, error: null }
  } catch (error) {
    console.error('[toggleDeviceCatalogItemStatus] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// ============================================================================
// DELETE
// ============================================================================

export async function deleteDeviceCatalogItem(id: string) {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('device_catalog')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[deleteDeviceCatalogItem] Error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (error) {
    console.error('[deleteDeviceCatalogItem] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
