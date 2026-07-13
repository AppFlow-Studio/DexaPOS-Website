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
  unit_cost: number | null
  monthly_fee: number | null
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
  unit_cost?: number | null
  monthly_fee?: number | null
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
  unit_cost?: number | null
  monthly_fee?: number | null
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
    const supabase = createServerSupabaseClient() as any

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

    const unitCost =
      input.unit_cost ?? (input.unit_cost_cents !== undefined && input.unit_cost_cents !== null
        ? input.unit_cost_cents / 100
        : null)
    const monthlyFee =
      input.monthly_fee ?? (input.monthly_fee_cents !== undefined && input.monthly_fee_cents !== null
        ? input.monthly_fee_cents / 100
        : null)

    const { data: createdId, error } = await supabase.rpc('upsert_device_catalog', {
      p_device_id: null,
      p_device_category: input.device_category,
      p_manufacturer: input.manufacturer,
      p_model_name: input.model_name,
      p_model_sku: input.model_sku || null,
      p_hardware_revision: input.hardware_revision || null,
      p_specs: input.specs || {},
      p_unit_cost: unitCost,
      p_monthly_fee: monthlyFee,
      p_is_active: input.is_active ?? true,
      p_image_url: input.image_url || null,
      p_notes: input.notes || null,
    })

    if (error) {
      console.error('[createDeviceCatalogItem] Error:', error)
      if (error.code === '23505') {
        return { success: false, error: 'A device with that SKU already exists', data: null }
      }
      return { success: false, error: error.message, data: null }
    }

    const { data, error: fetchError } = await supabase
      .from('device_catalog')
      .select('*')
      .eq('id', createdId)
      .single()

    if (fetchError) {
      console.error('[createDeviceCatalogItem] Fetch error:', fetchError)
      if (fetchError.code === '23505') {
        return { success: false, error: 'A device with that SKU already exists', data: null }
      }
      return { success: false, error: fetchError.message, data: null }
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
    const supabase = createServerSupabaseClient() as any

    const { data: current, error: fetchError } = await supabase
      .from('device_catalog')
      .select('*')
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

    const currentDevice = current as DeviceCatalogItem
    const unitCost =
      input.unit_cost !== undefined
        ? input.unit_cost
        : input.unit_cost_cents !== undefined && input.unit_cost_cents !== null
          ? input.unit_cost_cents / 100
          : currentDevice.unit_cost
    const monthlyFee =
      input.monthly_fee !== undefined
        ? input.monthly_fee
        : input.monthly_fee_cents !== undefined && input.monthly_fee_cents !== null
          ? input.monthly_fee_cents / 100
          : currentDevice.monthly_fee

    const { data: updatedId, error } = await supabase.rpc('upsert_device_catalog', {
      p_device_id: id,
      p_device_category: input.device_category ?? currentDevice.device_category,
      p_manufacturer: input.manufacturer ?? currentDevice.manufacturer,
      p_model_name: input.model_name ?? currentDevice.model_name,
      p_model_sku: input.model_sku !== undefined ? input.model_sku || null : currentDevice.model_sku,
      p_hardware_revision:
        input.hardware_revision !== undefined
          ? input.hardware_revision || null
          : currentDevice.hardware_revision,
      p_specs: input.specs ?? currentDevice.specs ?? {},
      p_unit_cost: unitCost,
      p_monthly_fee: monthlyFee,
      p_is_active: input.is_active ?? currentDevice.is_active,
      p_image_url: input.image_url !== undefined ? input.image_url || null : currentDevice.image_url,
      p_notes: input.notes !== undefined ? input.notes || null : currentDevice.notes,
    })

    if (error) {
      console.error('[updateDeviceCatalogItem] Error:', error)
      if (error.code === '23505') {
        return { success: false, error: 'A device with that SKU already exists', data: null }
      }
      return { success: false, error: error.message, data: null }
    }

    const { data, error: refetchError } = await supabase
      .from('device_catalog')
      .select('*')
      .eq('id', updatedId)
      .single()

    if (refetchError) {
      console.error('[updateDeviceCatalogItem] Refetch error:', refetchError)
      if (refetchError.code === '23505') {
        return { success: false, error: 'A device with that SKU already exists', data: null }
      }
      return { success: false, error: refetchError.message, data: null }
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
    const supabase = createServerSupabaseClient() as any

    const { data: current, error: fetchError } = await supabase
      .from('device_catalog')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !current) {
      return { success: false, error: 'Device not found', data: null }
    }

    const currentDevice = current as DeviceCatalogItem
    const newActive = !currentDevice.is_active

    const { data: updatedId, error } = await supabase.rpc('upsert_device_catalog', {
      p_device_id: id,
      p_device_category: currentDevice.device_category,
      p_manufacturer: currentDevice.manufacturer,
      p_model_name: currentDevice.model_name,
      p_model_sku: currentDevice.model_sku,
      p_hardware_revision: currentDevice.hardware_revision,
      p_specs: currentDevice.specs ?? {},
      p_unit_cost: currentDevice.unit_cost,
      p_monthly_fee: currentDevice.monthly_fee,
      p_is_active: newActive,
      p_image_url: currentDevice.image_url,
      p_notes: currentDevice.notes,
    })

    if (error) {
      console.error('[toggleDeviceCatalogItemStatus] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    const { data, error: refetchError } = await supabase
      .from('device_catalog')
      .select('*')
      .eq('id', updatedId)
      .single()

    if (refetchError) {
      console.error('[toggleDeviceCatalogItemStatus] Refetch error:', refetchError)
      return { success: false, error: refetchError.message, data: null }
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
    const supabase = createServerSupabaseClient() as any

    const { data: current, error: fetchError } = await supabase
      .from('device_catalog')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !current) {
      console.error('[deleteDeviceCatalogItem] Fetch error:', fetchError)
      return { success: false, error: fetchError?.message || 'Device catalog item not found' }
    }

    const currentDevice = current as DeviceCatalogItem
    const { error } = await supabase.rpc('upsert_device_catalog', {
      p_device_id: id,
      p_device_category: currentDevice.device_category,
      p_manufacturer: currentDevice.manufacturer,
      p_model_name: currentDevice.model_name,
      p_model_sku: currentDevice.model_sku,
      p_hardware_revision: currentDevice.hardware_revision,
      p_specs: currentDevice.specs ?? {},
      p_unit_cost: currentDevice.unit_cost,
      p_monthly_fee: currentDevice.monthly_fee,
      p_is_active: false,
      p_image_url: currentDevice.image_url,
      p_notes: currentDevice.notes,
    })

    if (error) {
      console.error('[deleteDeviceCatalogItem] Deactivate error:', error)
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
