'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  MerchantFilters,
  MerchantSummary,
  MerchantDetails,
  LocationSummary,
  MerchantSettingsUpdate,
  UpdateMerchantResult,
  ToggleLocationResult,
} from '@/types/merchant'

// ============================================================================
// GET MERCHANTS (Paginated with filters)
// ============================================================================

export async function getMerchants(
  filters: MerchantFilters,
  page: number = 1,
  pageSize: number = 20,
  accessibleMerchantIds?: string[] // Optional: filter to only these merchant IDs (for non-super-admins)
): Promise<{ merchants: MerchantSummary[]; total: number }> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const offset = (page - 1) * pageSize

  // Build query on the summary view
  let query = supabase
    .from('admin_merchant_summary')
    .select('*', { count: 'exact' })

  // Filter by accessible merchant IDs (for non-super-admins)
  if (accessibleMerchantIds !== undefined) {
    if (accessibleMerchantIds.length === 0) {
      // User has no merchant access - return empty result
      return { merchants: [], total: 0 }
    }
    query = query.in('id', accessibleMerchantIds)
  }

  // Apply search filter
  if (filters.search && filters.search.trim() !== '') {
    query = query.ilike('name', `%${filters.search.trim()}%`)
  }

  // Apply status filter
  if (filters.status !== 'all') {
    query = query.eq('derived_status', filters.status)
  }

  // Apply sorting
  const ascending = filters.sortOrder === 'asc'
  query = query.order(filters.sortBy, { ascending })

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getMerchants] Error:', error)
    throw new Error('Failed to fetch merchants')
  }

  return {
    merchants: (data as MerchantSummary[]) || [],
    total: count || 0,
  }
}

// ============================================================================
// GET MERCHANT DETAILS (with locations)
// ============================================================================

export async function getMerchantDetails(
  merchantId: string
): Promise<MerchantDetails | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Get merchant summary
  const { data: merchant, error: merchantError } = await supabase
    .from('admin_merchant_summary')
    .select('*')
    .eq('id', merchantId)
    .single()

  if (merchantError || !merchant) {
    console.error('[getMerchantDetails] Merchant error:', merchantError)
    return null
  }

  // Get locations
  const { data: locations, error: locationsError } = await supabase
    .from('locations')
    .select(`
      id,
      name,
      address_line1,
      city,
      state,
      postal_code,
      is_active,
      is_accepting_orders,
      timezone
    `)
    .eq('merchant_id', merchantId)
    .order('name')

  if (locationsError) {
    console.error('[getMerchantDetails] Locations error:', locationsError)
  }

  // Get today's start for metrics
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get orders for each location today
  const locationsWithMetrics: LocationSummary[] = await Promise.all(
    (locations || []).map(async (location) => {
      const { data: orderData } = await supabase
        .from('orders')
        .select('total_amount, status')
        .eq('location_id', location.id)
        .gte('created_at', today.toISOString())
        .not('status', 'in', '("cancelled","draft")')

      const orders = orderData || []
      const completedOrders = orders.filter((o) => o.status === 'completed')

      return {
        ...location,
        orders_today: orders.length,
        revenue_today: completedOrders.reduce(
          (sum, o) => sum + Number(o.total_amount || 0),
          0
        ),
      }
    })
  )

  return {
    ...(merchant as MerchantSummary),
    locations: locationsWithMetrics,
  }
}

// ============================================================================
// UPDATE MERCHANT SETTINGS
// ============================================================================

export async function updateMerchantSettings(
  merchantId: string,
  updates: MerchantSettingsUpdate
): Promise<UpdateMerchantResult> {
  const { userId } = await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('merchants')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', merchantId)

  if (error) {
    console.error('[updateMerchantSettings] Error:', error)
    return { success: false, error: error.message }
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    actor_user_id: userId,
    actor_role: 'hq.admin',
    action: 'ADMIN_UPDATE_MERCHANT',
    action_category: 'settings',
    severity: 'info',
    resource_type: 'merchant',
    resource_id: merchantId,
    merchant_id: merchantId,
    changes: { after: updates },
  })

  revalidatePath(`/manage/merchants/${merchantId}`)
  revalidatePath('/manage/merchants')

  return { success: true }
}

// ============================================================================
// TOGGLE LOCATION STATUS
// ============================================================================

export async function toggleLocationStatus(
  merchantId: string,
  locationId: string,
  isActive: boolean
): Promise<ToggleLocationResult> {
  const { userId } = await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // First verify the location belongs to this merchant
  const { data: location } = await supabase
    .from('locations')
    .select('id, name')
    .eq('id', locationId)
    .eq('merchant_id', merchantId)
    .single()

  if (!location) {
    return { success: false, error: 'Location not found or does not belong to this merchant' }
  }

  const { error } = await supabase
    .from('locations')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', locationId)
    .eq('merchant_id', merchantId)

  if (error) {
    console.error('[toggleLocationStatus] Error:', error)
    return { success: false, error: error.message }
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    actor_user_id: userId,
    actor_role: 'hq.admin',
    action: isActive ? 'ADMIN_ACTIVATE_LOCATION' : 'ADMIN_DEACTIVATE_LOCATION',
    action_category: 'settings',
    severity: 'warning',
    resource_type: 'location',
    resource_id: locationId,
    resource_name: location.name,
    merchant_id: merchantId,
    location_id: locationId,
    changes: { before: { is_active: !isActive }, after: { is_active: isActive } },
  })

  revalidatePath(`/manage/merchants/${merchantId}`)

  return { success: true }
}

// ============================================================================
// GET MERCHANT STATS (for dashboard cards)
// ============================================================================

export async function getMerchantStats(): Promise<{
  total: number
  active: number
  inactive: number
  onboarding: number
}> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('admin_merchant_summary')
    .select('derived_status')

  if (error) {
    console.error('[getMerchantStats] Error:', error)
    return { total: 0, active: 0, inactive: 0, onboarding: 0 }
  }

  const stats = {
    total: data?.length || 0,
    active: data?.filter((m) => m.derived_status === 'active').length || 0,
    inactive: data?.filter((m) => m.derived_status === 'inactive').length || 0,
    onboarding: data?.filter((m) => m.derived_status === 'onboarding').length || 0,
  }

  return stats
}
