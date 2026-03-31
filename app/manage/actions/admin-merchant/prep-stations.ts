'use server'

import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface AdminPrepStation {
  id: string
  merchant_id: string
  location_id: string
  name: string
  color: string
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AdminPrepStationWithCount extends AdminPrepStation {
  item_count: number
}

export interface AdminCategoryPrepDefault {
  id: string
  location_id: string
  category_id: string
  prep_station_id: string
  merchant_id: string
  created_at: string
  updated_at: string
  prep_station_name?: string
  prep_station_color?: string
  category_name?: string
}

export async function getAdminPrepStationsForLocation(locationId: string) {
  await assertHQPermission('hq.merchant.view')

  if (!locationId || locationId === 'all') {
    return []
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('prep_stations')
    .select('*')
    .eq('location_id', locationId)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.error('[getAdminPrepStationsForLocation] Error:', error)
    return []
  }

  const stationIds = (data || []).map((station) => station.id)
  let itemCounts: Record<string, number> = {}

  if (stationIds.length > 0) {
    const { data: counts, error: countError } = await supabase
      .from('location_item_overrides')
      .select('prep_station_id')
      .in('prep_station_id', stationIds)
      .not('prep_station_id', 'is', null)

    if (!countError && counts) {
      for (const row of counts) {
        if (row.prep_station_id) {
          itemCounts[row.prep_station_id] =
            (itemCounts[row.prep_station_id] || 0) + 1
        }
      }
    }
  }

  return (data || []).map((station) => ({
    ...station,
    item_count: itemCounts[station.id] || 0,
  })) as AdminPrepStationWithCount[]
}

export async function getAdminCategoryPrepDefaults(locationId: string) {
  await assertHQPermission('hq.merchant.view')

  if (!locationId || locationId === 'all') {
    return []
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('location_category_prep_defaults')
    .select(
      `
      *,
      prep_stations (name, color),
      categories (name)
    `,
    )
    .eq('location_id', locationId)

  if (error) {
    console.error('[getAdminCategoryPrepDefaults] Error:', error)
    return []
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    location_id: row.location_id,
    category_id: row.category_id,
    prep_station_id: row.prep_station_id,
    merchant_id: row.merchant_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    prep_station_name: row.prep_stations?.name,
    prep_station_color: row.prep_stations?.color,
    category_name: row.categories?.name,
  })) as AdminCategoryPrepDefault[]
}

export async function setAdminCategoryPrepDefault(
  locationId: string,
  categoryId: string,
  prepStationId: string,
  merchantId: string,
) {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('location_category_prep_defaults')
    .upsert(
      {
        location_id: locationId,
        category_id: categoryId,
        prep_station_id: prepStationId,
        merchant_id: merchantId,
      },
      {
        onConflict: 'location_id,category_id',
      },
    )
    .select(
      `
      *,
      prep_stations (name, color),
      categories (name)
    `,
    )
    .single()

  if (error) {
    console.error('[setAdminCategoryPrepDefault] Error:', error)
    return { success: false, error: error.message, data: null }
  }

  await LogAuditEvent({
    merchantId,
    locationId,
    action: `Set Category Prep Default: ${(data as any).categories?.name || categoryId} -> ${(data as any).prep_stations?.name || prepStationId}`,
    actionCategory: 'settings',
    resourceType: 'category_prep_default',
    resourceId: data.id,
    changes: {
      after: {
        category: (data as any).categories?.name || categoryId,
        prep_station: (data as any).prep_stations?.name || prepStationId,
      },
    },
    metadata: {
      admin_action: true,
    },
  })

  return { success: true, error: null, data }
}

export async function removeAdminCategoryPrepDefault(
  locationId: string,
  categoryId: string,
) {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const { data: before } = await supabase
    .from('location_category_prep_defaults')
    .select(
      `
      *,
      prep_stations (name),
      categories (name)
    `,
    )
    .eq('location_id', locationId)
    .eq('category_id', categoryId)
    .single()

  const { error } = await supabase
    .from('location_category_prep_defaults')
    .delete()
    .eq('location_id', locationId)
    .eq('category_id', categoryId)

  if (error) {
    console.error('[removeAdminCategoryPrepDefault] Error:', error)
    return { success: false, error: error.message }
  }

  if (before) {
    await LogAuditEvent({
      merchantId: before.merchant_id,
      locationId,
      action: `Removed Category Prep Default: ${(before as any).categories?.name || categoryId}`,
      actionCategory: 'settings',
      resourceType: 'category_prep_default',
      resourceId: before.id,
      changes: {
        before: {
          category: (before as any).categories?.name || categoryId,
          prep_station: (before as any).prep_stations?.name,
        },
      },
      metadata: {
        admin_action: true,
      },
    })
  }

  return { success: true, error: null }
}
