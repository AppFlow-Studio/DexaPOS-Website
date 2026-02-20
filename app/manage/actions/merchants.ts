'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import type {
  MerchantFilters,
  MerchantSummary,
  MerchantDetails,
  LocationSummary,
  MerchantSettingsUpdate,
  UpdateMerchantResult,
  ToggleLocationResult,
  MerchantHealthSummary,
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

  // Determine if we're querying by internal ID or Clerk Org ID
  const isClerkId = merchantId.startsWith('org_')
  const idField = isClerkId ? 'clerk_org_id' : 'id'

  // Get merchant summary
  const { data: merchant, error: merchantError } = await supabase
    .from('admin_merchant_summary')
    .select('*')
    .eq(idField, merchantId)
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
      timezone,
      pricing_strategy,
      dual_pricing_percentage
    `)
    .eq('merchant_id', merchant.id)
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

  // Prepare the update object
  let finalUpdates: any = {
      ...updates,
      updated_at: new Date().toISOString(),
  }

  // If public_metadata is provided, merge it with existing metadata to avoid overwriting everything
  if (updates.public_metadata) {
      const { data: existing } = await supabase
          .from('merchants')
          .select('public_metadata')
          .eq('id', merchantId)
          .single()
      
      finalUpdates.public_metadata = {
          ...(existing?.public_metadata || {}),
          ...updates.public_metadata
      }
  }

  const { error } = await supabase
    .from('merchants')
    .update(finalUpdates)
    .eq('id', merchantId)

  if (error) {
    console.error('[updateMerchantSettings] Error:', error)
    return { success: false, error: error.message }
  }

  // Audit log
  await LogAuditEvent({
    merchantId,
    action: 'ADMIN_UPDATE_MERCHANT',
    actionCategory: 'settings',
    resourceType: 'merchant',
    resourceId: merchantId,
    changes: { after: updates as unknown as Record<string, unknown> },
    metadata: {
      admin_action: true,
    },
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
  await LogAuditEvent({
    merchantId,
    action: isActive ? 'Activated Location' : 'Deactivated Location',
    actionCategory: 'settings',
    resourceType: 'location',
    resourceId: locationId,
    resourceName: location.name,
    locationId,
    changes: { before: { is_active: !isActive }, after: { is_active: isActive } },
    severity: 'warning',
    metadata: {
      location_name: location.name,
      admin_action: true,
    },
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

// ============================================================================
// GET MERCHANT HEALTH GRID (with computed health scores)
// ============================================================================

const CURRENT_APP_VERSION = '2.4.1'

export async function getMerchantHealthGrid(
  accessibleMerchantIds?: string[]
): Promise<MerchantHealthSummary[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // 1. Fetch all merchants
  let merchantQuery = supabase
    .from('admin_merchant_summary')
    .select('*')

  if (accessibleMerchantIds !== undefined) {
    if (accessibleMerchantIds.length === 0) {
      return []
    }
    merchantQuery = merchantQuery.in('id', accessibleMerchantIds)
  }

  const { data: merchants, error: merchantsError } = await merchantQuery

  if (merchantsError || !merchants) {
    console.error('[getMerchantHealthGrid] Merchants error:', merchantsError)
    return []
  }

  // 2. Fetch station data grouped by merchant
  const { data: stationsData, error: stationsError } = await supabase
    .from('stations')
    .select(`
      id,
      merchant_id,
      is_online,
      is_active,
      last_heartbeat_at,
      app_version
    `)
    .eq('is_active', true)

  if (stationsError) {
    console.error('[getMerchantHealthGrid] Stations error:', stationsError)
  }

  // Group stations by merchant
  const stationsByMerchant = new Map<
    string,
    Array<{
      id: string
      is_online: boolean
      last_heartbeat_at: string | null
      app_version: string | null
    }>
  >()

  stationsData?.forEach((station: any) => {
    if (!stationsByMerchant.has(station.merchant_id)) {
      stationsByMerchant.set(station.merchant_id, [])
    }
    stationsByMerchant.get(station.merchant_id)!.push({
      id: station.id,
      is_online: station.is_online,
      last_heartbeat_at: station.last_heartbeat_at,
      app_version: station.app_version,
    })
  })

  // 3. Fetch payment data for today
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const { data: paymentsData, error: paymentsError } = await supabase
    .from('order_payments')
    .select('id, status, orders(merchant_id)')
    .gte('created_at', today.toISOString())
    .lt('created_at', tomorrow.toISOString())

  if (paymentsError) {
    console.error('[getMerchantHealthGrid] Payments error:', paymentsError)
  }

  // Group payment success rates by merchant
  const paymentsByMerchant = new Map<
    string,
    { total: number; successful: number }
  >()

  paymentsData?.forEach((payment: any) => {
    const merchantId = payment.orders?.merchant_id
    if (!merchantId) return

    if (!paymentsByMerchant.has(merchantId)) {
      paymentsByMerchant.set(merchantId, { total: 0, successful: 0 })
    }

    const stats = paymentsByMerchant.get(merchantId)!
    stats.total++
    if (payment.status === 'captured' || payment.status === 'succeeded') {
      stats.successful++
    }
  })

  // 4. Compute health scores
  const healthData: MerchantHealthSummary[] = merchants
    .map((merchant: MerchantSummary) => {
      const stationsList = stationsByMerchant.get(merchant.id) || []
      const totalStations = stationsList.length
      const onlineStations = stationsList.filter((s) => s.is_online).length

      // Station heartbeat check (within last 15 minutes is good)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      const healthyStations = stationsList.filter((s) => {
        if (!s.is_online) return false
        if (!s.last_heartbeat_at) return false
        const heartbeatTime = new Date(s.last_heartbeat_at)
        return heartbeatTime > fiveMinutesAgo
      }).length

      // Calculate individual signals (0-100)
      const orderActivity = Math.min(100, merchant.orders_today * 5)

      const deviceHealth =
        totalStations > 0 ? (healthyStations / totalStations) * 100 : 100

      const setupCompleteness =
        ((merchant.active_staff_count > 0 ? 25 : 0) +
          (totalStations > 0 ? 25 : 0) +
          50) /
        100 // Menu + payment terminal hardcoded to 50

      const paymentStats = paymentsByMerchant.get(merchant.id)
      const paymentHealth =
        paymentStats && paymentStats.total > 0
          ? (paymentStats.successful / paymentStats.total) * 100
          : 100

      const issueVolume = 80 // Hardcoded: no void table yet
      const supportActivity = 100 // Hardcoded: no support tickets yet

      const appCurrency =
        totalStations > 0
          ? (stationsList.filter((s) => s.app_version === CURRENT_APP_VERSION)
              .length /
              totalStations) *
            100
          : 100

      // Compute weighted health score
      const healthScore = Math.round(
        orderActivity * 0.25 +
          deviceHealth * 0.2 +
          setupCompleteness * 0.15 +
          paymentHealth * 0.15 +
          issueVolume * 0.1 +
          supportActivity * 0.1 +
          appCurrency * 0.05
      )

      // Determine health tier
      const healthTier: 'green' | 'yellow' | 'red' =
        healthScore >= 80 ? 'green' : healthScore >= 60 ? 'yellow' : 'red'

      // Generate alerts
      const alerts: string[] = []
      const offlineCount = totalStations - healthyStations
      if (offlineCount > 0) {
        alerts.push(`${offlineCount} station${offlineCount !== 1 ? 's' : ''} offline`)
      }

      const outdatedStations = stationsList.filter(
        (s) => s.app_version && s.app_version !== CURRENT_APP_VERSION
      ).length
      if (outdatedStations > 0) {
        alerts.push(
          `App version outdated on ${outdatedStations} station${outdatedStations !== 1 ? 's' : ''}`
        )
      }

      if (merchant.orders_today === 0 && merchant.active_locations > 0) {
        alerts.push('No orders today')
      }

      return {
        ...merchant,
        healthScore,
        healthTier,
        alerts,
        totalStations,
        onlineStations,
      }
    })
    .sort((a, b) => a.healthScore - b.healthScore) // Sort by health score ascending (worst first)

  return healthData
}
