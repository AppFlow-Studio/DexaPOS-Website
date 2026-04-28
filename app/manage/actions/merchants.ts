'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { revalidatePath } from 'next/cache'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import type {
  MerchantFilters,
  MerchantSummary,
  MerchantDetails,
  MerchantOnboardingChecklist,
  MerchantOnboardingStatus,
  LocationSummary,
  MerchantSettingsUpdate,
  UpdateMerchantResult,
  UpdateMerchantStatusResult,
  ToggleLocationResult,
  MerchantHealthSummary,
} from '@/types/merchant'

async function getManagerScopedMerchantIds(
  userId: string,
  roleCode: string | null | undefined
): Promise<string[] | undefined> {
  if (roleCode !== 'hq.manager') {
    return undefined
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('admin_merchant_access')
    .select('merchant_id')
    .eq('admin_user_id', userId)
    .eq('is_active', true)

  if (error) {
    console.error('[getManagerScopedMerchantIds] Error:', error)
    return []
  }

  return Array.from(
    new Set(
      (data || [])
        .map((row) => row.merchant_id)
        .filter((merchantId): merchantId is string => typeof merchantId === 'string' && merchantId.length > 0)
    )
  )
}

// ============================================================================
// GET MERCHANTS (Paginated with filters)
// ============================================================================

export async function getMerchants(
  filters: MerchantFilters,
  page: number = 1,
  pageSize: number = 20,
  accessibleMerchantIds?: string[] // Optional: filter to only these merchant IDs (for non-super-admins)
): Promise<{ merchants: MerchantSummary[]; total: number }> {
  const { userId, role } = await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const offset = (page - 1) * pageSize

  const managerScopedIds = await getManagerScopedMerchantIds(userId, role?.role_code)

  let effectiveMerchantIds = managerScopedIds
  if (accessibleMerchantIds !== undefined) {
    if (effectiveMerchantIds === undefined) {
      effectiveMerchantIds = accessibleMerchantIds
    } else {
      const requestedSet = new Set(accessibleMerchantIds)
      effectiveMerchantIds = effectiveMerchantIds.filter((merchantId) => requestedSet.has(merchantId))
    }
  }

  // Build query on the summary view
  let query = supabase
    .from('admin_merchant_summary')
    .select('*', { count: 'exact' })

  // Apply effective merchant scope (manager scope + optional caller filter).
  if (effectiveMerchantIds !== undefined) {
    if (effectiveMerchantIds.length === 0) {
      // User has no merchant access - return empty result
      return { merchants: [], total: 0 }
    }
    query = query.in('id', effectiveMerchantIds)
  }

  // Apply search filter
  if (filters.search && filters.search.trim() !== '') {
    query = query.ilike('name', `%${filters.search.trim()}%`)
  }

  // Apply status filter
  if (filters.status !== 'all') {
    if (filters.status === 'inactive') {
      query = query.eq('derived_status', 'inactive')
    } else {
      let statusScopeQuery = supabase
        .from('merchants')
        .select('id')
        .eq('onboarding_status', filters.status)

      if (effectiveMerchantIds !== undefined) {
        if (effectiveMerchantIds.length === 0) {
          return { merchants: [], total: 0 }
        }
        statusScopeQuery = statusScopeQuery.in('id', effectiveMerchantIds)
      }

      const { data: statusScopedRows, error: statusScopedError } = await statusScopeQuery

      if (statusScopedError) {
        console.error('[getMerchants] Status scope error:', statusScopedError)
        throw new Error('Failed to filter merchants by onboarding status')
      }

      const statusScopedMerchantIds = Array.from(
        new Set(
          (statusScopedRows || [])
            .map((row) => row.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      )

      if (statusScopedMerchantIds.length === 0) {
        return { merchants: [], total: 0 }
      }

      query = query.in('id', statusScopedMerchantIds)
    }
  }

  // Apply sorting
  const ascending = filters.sortOrder === 'asc'
  const sortColumn = filters.sortBy === 'status' ? 'derived_status' : filters.sortBy
  query = query.order(sortColumn, { ascending })

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getMerchants] Error:', error)
    throw new Error('Failed to fetch merchants')
  }

  let merchants = (data as MerchantSummary[]) || []

  if (merchants.length > 0) {
    const merchantIds = merchants.map((merchant) => merchant.id)
    const [{ data: noteRows, error: notesError }, { data: merchantRows, error: merchantRowsError }] =
      await Promise.all([
        supabase.from('merchant_notes').select('merchant_id').in('merchant_id', merchantIds),
        supabase
          .from('merchants')
          .select(
            `
              id,
              onboarding_status,
              onboarding_completed_at,
              activated_at,
              owner_first_name,
              owner_last_name,
              owner_email,
              owner_phone
            `
          )
          .in('id', merchantIds),
      ])

    // Gracefully handle environments that have not applied migration 032 yet.
    if (notesError && notesError.code !== '42P01') {
      console.error('[getMerchants] Notes count error:', notesError)
    }

    if (merchantRowsError) {
      console.error('[getMerchants] Merchant lifecycle fields error:', merchantRowsError)
    }

    const noteCountMap = (noteRows || []).reduce<Record<string, number>>((acc, row) => {
      if (!row.merchant_id) return acc
      acc[row.merchant_id] = (acc[row.merchant_id] || 0) + 1
      return acc
    }, {})

    const merchantLifecycleMap = new Map(
      (merchantRows || []).map((row) => [
        row.id,
        {
          onboarding_status: row.onboarding_status as MerchantOnboardingStatus | undefined,
          onboarding_completed_at: row.onboarding_completed_at,
          activated_at: row.activated_at,
          owner_first_name: row.owner_first_name,
          owner_last_name: row.owner_last_name,
          owner_email: row.owner_email,
          owner_phone: row.owner_phone,
        },
      ])
    )

    merchants = merchants.map((merchant) => ({
      ...merchant,
      ...(merchantLifecycleMap.get(merchant.id) || {}),
      notes_count: noteCountMap[merchant.id] || 0,
    }))
  }

  return {
    merchants,
    total: count || 0,
  }
}

// ============================================================================
// GET MERCHANT DETAILS (with locations)
// ============================================================================

export async function getMerchantDetails(
  merchantId: string
): Promise<MerchantDetails | null> {
  const { userId, role } = await assertHQPermission('hq.merchant.view')

  // HQ permission already asserted — use service-role to bypass RLS on the
  // `merchants` table. The clerk `org_id` claim doesn't always match the HQ org
  // (e.g. when the admin is acting inside another org context), which makes
  // `is_dexapos_admin()` return NULL and RLS block direct merchants reads.
  // Manager scoping is still enforced application-side via managerScopedIds below.
  const supabase = createServiceRoleClient()
  const managerScopedIds = await getManagerScopedMerchantIds(userId, role?.role_code)

  if (managerScopedIds && managerScopedIds.length === 0) {
    return null
  }

  // Determine if we're querying by internal ID or Clerk Org ID
  const isClerkId = merchantId.startsWith('org_')
  const idField = isClerkId ? 'clerk_org_id' : 'id'

  // Get merchant summary from view
  const { data: merchant, error: merchantError } = await supabase
    .from('admin_merchant_summary')
    .select('*')
    .eq(idField, merchantId)
    .single()

  if (merchantError || !merchant) {
    console.error('[getMerchantDetails] Merchant error:', merchantError)
    return null
  }

  if (managerScopedIds && !managerScopedIds.includes(merchant.id)) {
    return null
  }

  // Get today's start for metrics
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Parallelize all independent queries that depend on merchant.id
  const [
    { data: merchantPricing },
    { data: merchantLifecycle, error: merchantLifecycleError },
    { data: locations, error: locationsError },
    { count: billingProfileCount, error: billingProfileError },
    { count: capturedPaymentsCount, error: capturedPaymentsError },
  ] = await Promise.all([
    // Pricing columns (not in view)
    supabase
      .from('merchants')
      .select('pricing_strategy, dual_pricing_percentage')
      .eq('id', merchant.id)
      .single(),
    // Lifecycle / onboarding fields
    supabase
      .from('merchants')
      .select(
        `
          id,
          business_legal_name,
          dba_name,
          business_type,
          owner_first_name,
          owner_last_name,
          owner_email,
          owner_phone,
          ein_last_four,
          onboarding_status,
          onboarding_completed_at,
          activated_at,
          business_address_line1,
          business_address_line2,
          business_city,
          business_state,
          business_postal_code,
          business_country,
          external_merchant_id
        `
      )
      .eq('id', merchant.id)
      .single(),
    // Locations
    supabase
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
        dual_pricing_percentage,
        use_merchant_pricing_defaults
      `)
      .eq('merchant_id', merchant.id)
      .order('name'),
    // Billing profile count
    supabase
      .from('merchant_billing_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', merchant.id)
      .eq('is_active', true),
    // Captured payment count
    supabase
      .from('order_payments')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', merchant.id)
      .in('status', ['captured', 'paid']),
  ])

  if (merchantLifecycleError || !merchantLifecycle) {
    console.error('[getMerchantDetails] Merchant lifecycle error:', merchantLifecycleError)
    return null
  }

  if (locationsError) {
    console.error('[getMerchantDetails] Locations error:', locationsError)
  }

  if (billingProfileError && billingProfileError.code !== '42P01') {
    console.error('[getMerchantDetails] Billing profile count error:', billingProfileError)
  }

  if (capturedPaymentsError) {
    console.error('[getMerchantDetails] Captured payment count error:', capturedPaymentsError)
  }

  // Get orders for each location today (parallel per location)
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

  const onboardingStatus =
    (merchantLifecycle.onboarding_status as MerchantOnboardingStatus | null) ||
    (merchant.derived_status === 'active' ? 'active' : 'onboarding')

  const onboardingChecklist: MerchantOnboardingChecklist = {
    businessInfo: Boolean(merchantLifecycle.business_legal_name && merchantLifecycle.owner_email),
    ownerInvited: Boolean(merchant.clerk_org_id),
    billingAdded: (billingProfileCount || 0) > 0,
    firstLocation: (locationsWithMetrics || []).length > 0,
    firstPayment: onboardingStatus === 'active' || (capturedPaymentsCount || 0) > 0,
  }

  return {
    ...(merchant as MerchantSummary),
    pricing_strategy: merchantPricing?.pricing_strategy as 'manual' | 'dual' | undefined,
    dual_pricing_percentage: merchantPricing?.dual_pricing_percentage,
    business_legal_name: merchantLifecycle.business_legal_name,
    dba_name: merchantLifecycle.dba_name,
    business_type: merchantLifecycle.business_type,
    owner_first_name: merchantLifecycle.owner_first_name,
    owner_last_name: merchantLifecycle.owner_last_name,
    owner_email: merchantLifecycle.owner_email,
    owner_phone: merchantLifecycle.owner_phone,
    ein_last_four: merchantLifecycle.ein_last_four,
    onboarding_status: onboardingStatus,
    onboarding_completed_at: merchantLifecycle.onboarding_completed_at,
    activated_at: merchantLifecycle.activated_at,
    business_address_line1: merchantLifecycle.business_address_line1,
    business_address_line2: merchantLifecycle.business_address_line2,
    business_city: merchantLifecycle.business_city,
    business_state: merchantLifecycle.business_state,
    business_postal_code: merchantLifecycle.business_postal_code,
    business_country: merchantLifecycle.business_country,
    external_merchant_id: (merchantLifecycle as { external_merchant_id?: string | null })
      .external_merchant_id ?? null,
    onboarding_checklist: onboardingChecklist,
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
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()
  const { data: beforeMerchant } = await supabase
    .from('merchants')
    .select('id, name, public_metadata, pricing_strategy, dual_pricing_percentage')
    .eq('id', merchantId)
    .single()

  const beforeSnapshot: Record<string, unknown> = {}
  for (const key of Object.keys(updates)) {
    beforeSnapshot[key] = (beforeMerchant as Record<string, unknown> | null)?.[key]
  }

  // Prepare the update object
  let finalUpdates: any = {
      ...updates,
      updated_at: new Date().toISOString(),
  }

  // If public_metadata is provided, merge it with existing metadata to avoid overwriting everything
  if (updates.public_metadata) {
      finalUpdates.public_metadata = {
          ...(beforeMerchant?.public_metadata || {}),
          ...updates.public_metadata
      }

      beforeSnapshot.public_metadata = beforeMerchant?.public_metadata || {}
  }

  const { error } = await supabase
    .from('merchants')
    .update(finalUpdates)
    .eq('id', merchantId)

  if (error) {
    console.error('[updateMerchantSettings] Error:', error)
    return { success: false, error: error.message }
  }

  await logAdminAction('MERCHANT_SETTINGS_CHANGED', {
    merchantId,
    resourceType: 'merchant',
    resourceId: merchantId,
    resourceName: beforeMerchant?.name || merchantId,
    changes: {
      before: beforeSnapshot,
      after: finalUpdates as Record<string, unknown>,
    },
    metadata: {
      source: 'updateMerchantSettings',
    },
  })

  revalidatePath(`/manage/merchants/${merchantId}`)
  revalidatePath('/manage/merchants')

  return { success: true }
}

// ============================================================================
// UPDATE MERCHANT ONBOARDING STATUS
// ============================================================================

export async function updateMerchantOnboardingStatus(params: {
  merchantId: string
  newStatus: 'active' | 'suspended' | 'cancelled'
  reason?: string
}): Promise<UpdateMerchantStatusResult> {
  const { userId } = await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select(
      `
        id,
        clerk_org_id,
        name,
        onboarding_status,
        onboarding_completed_at,
        activated_at
      `
    )
    .eq('id', params.merchantId)
    .single()

  if (merchantError || !merchant) {
    console.error('[updateMerchantOnboardingStatus] Merchant lookup error:', merchantError)
    return { success: false, error: 'Merchant not found.' }
  }

  if (merchant.onboarding_status === params.newStatus) {
    return { success: true }
  }

  const nowIso = new Date().toISOString()
  const reason = params.reason?.trim()

  const updates: Record<string, unknown> = {
    onboarding_status: params.newStatus,
    updated_at: nowIso,
  }

  if (params.newStatus === 'active') {
    updates.activated_at = merchant.activated_at || nowIso
    updates.onboarding_completed_at = merchant.onboarding_completed_at || nowIso
  }

  const { error: updateError } = await supabase
    .from('merchants')
    .update(updates)
    .eq('id', params.merchantId)

  if (updateError) {
    console.error('[updateMerchantOnboardingStatus] Update error:', updateError)
    return { success: false, error: updateError.message }
  }

  await logAdminAction('MERCHANT_UPDATED', {
    merchantId: params.merchantId,
    clerkOrgId: merchant.clerk_org_id,
    resourceType: 'merchant',
    resourceId: params.merchantId,
    resourceName: merchant.name || params.merchantId,
    severity: params.newStatus === 'active' ? 'info' : 'warning',
    changes: {
      before: {
        onboarding_status: merchant.onboarding_status,
        activated_at: merchant.activated_at,
        onboarding_completed_at: merchant.onboarding_completed_at,
      },
      after: {
        onboarding_status: params.newStatus,
        activated_at: (updates.activated_at as string | undefined) || merchant.activated_at,
        onboarding_completed_at:
          (updates.onboarding_completed_at as string | undefined) || merchant.onboarding_completed_at,
      },
      reason,
    },
    metadata: {
      source: 'updateMerchantOnboardingStatus',
      changed_by_user_id: userId,
      reason: reason || null,
    },
  })

  revalidatePath('/manage/merchants')
  revalidatePath(`/manage/merchants/${params.merchantId}`)

  if (merchant.clerk_org_id) {
    revalidatePath(`/manage/merchants/${merchant.clerk_org_id}`)
  }

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
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // First verify the location belongs to this merchant
  const { data: location } = await supabase
    .from('locations')
    .select('id, name, is_active')
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

  await logAdminAction('MERCHANT_UPDATED', {
    merchantId,
    locationId,
    resourceType: 'location',
    resourceId: locationId,
    resourceName: location.name,
    changes: {
      is_active: {
        old: Boolean(location.is_active),
        new: isActive,
      },
    },
    severity: isActive ? 'info' : 'warning',
    metadata: {
      location_name: location.name,
      source: 'toggleLocationStatus',
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
  const { userId, role } = await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const managerScopedIds = await getManagerScopedMerchantIds(userId, role?.role_code)

  let query = supabase
    .from('admin_merchant_summary')
    .select('derived_status')

  if (managerScopedIds !== undefined) {
    if (managerScopedIds.length === 0) {
      return { total: 0, active: 0, inactive: 0, onboarding: 0 }
    }
    query = query.in('id', managerScopedIds)
  }

  const { data, error } = await query

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
    .gte('initiated_at', today.toISOString())
    .lt('initiated_at', tomorrow.toISOString())

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
