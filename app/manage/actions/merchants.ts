'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { applyReportablePredicate } from '@/lib/reporting/recognized-order'
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
  MerchantHealthTier,
} from '@/types/merchant'

async function getScopedMerchantIds(
  userId: string,
  roleCode: string | null | undefined
): Promise<string[] | undefined> {
  // Super admin sees all merchants; everyone else (platform_admin, manager) is
  // scoped to their assigned merchants in admin_merchant_access.
  if (!roleCode || roleCode === 'hq.super_admin') {
    return undefined
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('admin_merchant_access')
    .select('merchant_id')
    .eq('admin_user_id', userId)
    .eq('is_active', true)

  if (error) {
    console.error('[getScopedMerchantIds] Error:', error)
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

  const managerScopedIds = await getScopedMerchantIds(userId, role?.role_code)

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

  // Apply status filter — always via derived_status on the view.
  // onboarding_status is a separate lifecycle field with different semantics;
  // using it here caused the wrong merchants to appear for 'active'/'onboarding'.
  if (filters.status !== 'all') {
    query = query.eq('derived_status', filters.status)
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
  const managerScopedIds = await getScopedMerchantIds(userId, role?.role_code)

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
          external_merchant_id,
          billing_exempt,
          billing_exempt_reason,
          billing_exempt_expires_at,
          billing_exempt_granted_at,
          billing_exempt_granted_by
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
      // Recognized orders only — payment collected and not
      // draft/cancelled/void/refunded. One gate drives BOTH order count and
      // revenue so the two figures agree (previously orders_today counted
      // unpaid/void while revenue_today gated on the manual 'completed' tap).
      const { data: orderData } = await applyReportablePredicate(
        supabase
          .from('orders')
          .select('total_amount')
          .eq('location_id', location.id)
      ).gte('created_at', today.toISOString())

      const orders = orderData || []

      return {
        ...location,
        orders_today: orders.length,
        revenue_today: orders.reduce(
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
    billing_exempt: Boolean((merchantLifecycle as any).billing_exempt),
    billing_exempt_reason: (merchantLifecycle as any).billing_exempt_reason ?? null,
    billing_exempt_expires_at: (merchantLifecycle as any).billing_exempt_expires_at ?? null,
    billing_exempt_granted_at: (merchantLifecycle as any).billing_exempt_granted_at ?? null,
    billing_exempt_granted_by: (merchantLifecycle as any).billing_exempt_granted_by ?? null,
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
// GRACEFUL SUSPENSION (A7)
// ============================================================================

export interface MerchantDrainStatus {
  merchant_id: string
  status: string
  open_orders: number
  open_drawer_sessions: number
  fully_drained: boolean
  suspension_initiated_at: string | null
}

export interface SuspensionResult {
  success: boolean
  error?: string
  status?: string
  open_orders?: number
  open_drawer_sessions?: number
  fully_drained?: boolean
  forced?: boolean
}

export async function requestMerchantSuspension(params: {
  merchantId: string
  force?: boolean
  reason?: string
}): Promise<SuspensionResult> {
  const { userId } = await assertHQPermission('hq.merchant.update')
  const supabase = createServerSupabaseClient()

  const { data: merchant } = await supabase
    .from('merchants')
    .select('id, name, clerk_org_id, onboarding_status')
    .eq('id', params.merchantId)
    .single()

  if (!merchant) return { success: false, error: 'Merchant not found.' }

  const { data, error } = await supabase.rpc('request_merchant_suspension', {
    p_merchant_id: params.merchantId,
    p_force: params.force ?? false,
    p_reason: params.reason ?? null,
    p_initiated_by: userId,
  })

  if (error) {
    console.error('[requestMerchantSuspension] RPC error:', error)
    return { success: false, error: error.message }
  }

  const result = data as Record<string, unknown> | null
  const finalStatus = (result?.status as string) || 'unknown'
  const openOrders = (result?.open_orders as number) ?? 0
  const openDrawers = (result?.open_drawer_sessions as number) ?? 0

  await logAdminAction(
    params.force && (openOrders > 0 || openDrawers > 0)
      ? 'MERCHANT_SUSPENSION_FORCED'
      : 'MERCHANT_SUSPENSION_REQUESTED',
    {
      merchantId: params.merchantId,
      clerkOrgId: merchant.clerk_org_id ?? undefined,
      resourceType: 'merchant',
      resourceId: params.merchantId,
      resourceName: merchant.name || params.merchantId,
      changes: {
        before: { onboarding_status: merchant.onboarding_status },
        after: { onboarding_status: finalStatus },
        reason: params.reason,
      },
      metadata: {
        source: 'requestMerchantSuspension',
        initiated_by_user_id: userId,
        forced: params.force ?? false,
        open_orders: openOrders,
        open_drawer_sessions: openDrawers,
      },
    }
  )

  revalidatePath('/manage/merchants')
  revalidatePath(`/manage/merchants/${params.merchantId}`)

  return {
    success: true,
    status: finalStatus,
    open_orders: openOrders,
    open_drawer_sessions: openDrawers,
    fully_drained: Boolean(result?.fully_drained),
    forced: params.force ?? false,
  }
}

export async function cancelMerchantSuspension(merchantId: string): Promise<SuspensionResult> {
  const { userId } = await assertHQPermission('hq.merchant.update')
  const supabase = createServerSupabaseClient()

  const { data: merchant } = await supabase
    .from('merchants')
    .select('id, name, clerk_org_id, onboarding_status')
    .eq('id', merchantId)
    .single()

  if (!merchant) return { success: false, error: 'Merchant not found.' }

  const { data, error } = await supabase.rpc('cancel_merchant_suspension', {
    p_merchant_id: merchantId,
    p_initiated_by: userId,
  })

  if (error) {
    console.error('[cancelMerchantSuspension] RPC error:', error)
    return { success: false, error: error.message }
  }

  const result = data as Record<string, unknown> | null
  const finalStatus = (result?.status as string) || 'active'

  await logAdminAction('MERCHANT_SUSPENSION_CANCELLED', {
    merchantId,
    clerkOrgId: merchant.clerk_org_id ?? undefined,
    resourceType: 'merchant',
    resourceId: merchantId,
    resourceName: merchant.name || merchantId,
    changes: {
      before: { onboarding_status: merchant.onboarding_status },
      after: { onboarding_status: finalStatus },
    },
    metadata: { source: 'cancelMerchantSuspension', initiated_by_user_id: userId },
  })

  revalidatePath('/manage/merchants')
  revalidatePath(`/manage/merchants/${merchantId}`)

  return { success: true, status: finalStatus }
}

export async function getMerchantDrainStatus(
  merchantId: string
): Promise<MerchantDrainStatus | null> {
  await assertHQPermission('hq.merchant.view')
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_merchant_drain_status', {
    p_merchant_id: merchantId,
  })

  if (error) {
    console.error('[getMerchantDrainStatus] RPC error:', error)
    return null
  }

  return data as unknown as MerchantDrainStatus
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
  const managerScopedIds = await getScopedMerchantIds(userId, role?.role_code)

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

  // 3b. Fetch each merchant's own recent order volume, to judge today against.
  //
  // `orderActivity` used to be `min(100, orders_today * 5)`, an absolute scale
  // that silently encoded "20 orders a day is healthy". A quiet neighbourhood
  // cafe doing its normal 6 orders scored 30 on a quarter of the total weight
  // and sat permanently in amber, while a high-volume merchant that crashed
  // from 400 orders to 25 still scored a perfect 100. The signal was measuring
  // merchant size, not merchant health.
  //
  // Comparing a merchant to its own 28-day median instead makes it a real
  // anomaly detector: "quiet for you" is what an admin wants flagged. The
  // window skips today so an in-progress day cannot drag its own baseline
  // down. Volume is counted the same way `admin_merchant_summary.orders_today`
  // counts it (excluding only cancelled/draft) so today's numerator and the
  // historical denominator are on the same footing.
  const BASELINE_DAYS = 28
  const baselineStart = new Date(today)
  baselineStart.setDate(baselineStart.getDate() - BASELINE_DAYS)

  const { data: historyData, error: historyError } = await supabase
    .from('orders')
    .select('merchant_id, created_at')
    .gte('created_at', baselineStart.toISOString())
    .lt('created_at', today.toISOString())
    .not('status', 'in', '(cancelled,draft)')

  if (historyError) {
    console.error('[getMerchantHealthGrid] Order history error:', historyError)
  }

  // merchant -> (YYYY-MM-DD -> order count), so each trading day is one sample.
  const dailyCountsByMerchant = new Map<string, Map<string, number>>()
  // Orders per hour-of-day across the window, used to judge how much of a
  // normal trading day has elapsed.
  const ordersByHour = new Array<number>(24).fill(0)

  historyData?.forEach((order: any) => {
    if (!order.merchant_id || !order.created_at) return
    const day = order.created_at.slice(0, 10)
    let days = dailyCountsByMerchant.get(order.merchant_id)
    if (!days) {
      days = new Map<string, number>()
      dailyCountsByMerchant.set(order.merchant_id, days)
    }
    days.set(day, (days.get(day) ?? 0) + 1)

    const hour = new Date(order.created_at).getHours()
    if (hour >= 0 && hour < 24) ordersByHour[hour]++
  })

  /**
   * Share of a normal trading day that has already happened, 0-1.
   *
   * Derived from when orders actually land across the platform rather than a
   * hardcoded "9 to 5", so it reflects real trading hours — including late
   * dinner services — and shifts with the business rather than needing
   * maintenance.
   *
   * Platform-wide rather than per-merchant on purpose: a per-merchant curve
   * would need far more history to be stable, and the pro-rating only has to
   * be roughly right to remove the morning cliff. Falls back to 1 (treat today
   * as complete) when there is no history to learn from, which is the
   * conservative choice — it cannot manufacture a false alarm.
   */
  const totalHistoricalOrders = ordersByHour.reduce((sum, n) => sum + n, 0)
  const currentHour = new Date().getHours()
  const elapsedShare =
    totalHistoricalOrders === 0
      ? 1
      : ordersByHour.slice(0, currentHour + 1).reduce((sum, n) => sum + n, 0) /
        totalHistoricalOrders

  /**
   * Below this share of the trading day, order volume is not yet evidence of
   * anything.
   *
   * Early morning is genuinely uninformative: a merchant that normally does
   * 100 orders might have 1 by 7am, and whether it has 1 or 3 says nothing
   * about its health. Clamping `dayProgress` to a floor did not fix this — it
   * still divided a near-zero numerator by a small expectation and produced
   * "activity 7" for a perfectly healthy merchant, i.e. a false alarm at
   * exactly the hour an admin checks first.
   *
   * So below the threshold the signal is withheld rather than guessed: see
   * `orderActivityIsMeaningful`.
   */
  const MIN_INFORMATIVE_DAY_SHARE = 0.25
  const orderActivityIsMeaningful = elapsedShare >= MIN_INFORMATIVE_DAY_SHARE
  const dayProgress = elapsedShare

  /**
   * Typical orders on a day this merchant actually traded.
   *
   * The median, not the mean: a single catering blowout or a one-off festival
   * day would drag a mean upward and then mark every ordinary day afterwards
   * as a shortfall. Closed days are excluded rather than counted as zero —
   * a merchant shut on Sundays should not have its weekday baseline halved.
   *
   * Returns null when there are too few trading days to say anything; the
   * caller falls back rather than inventing a baseline from one sample.
   */
  const MIN_BASELINE_DAYS = 5
  function baselineOrdersFor(merchantId: string): number | null {
    const days = dailyCountsByMerchant.get(merchantId)
    if (!days || days.size < MIN_BASELINE_DAYS) return null
    const counts = [...days.values()].sort((a, b) => a - b)
    const mid = Math.floor(counts.length / 2)
    const median =
      counts.length % 2 === 0 ? (counts[mid - 1] + counts[mid]) / 2 : counts[mid]
    return median > 0 ? median : null
  }

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
      // Today measured against this merchant's own normal, pro-rated for how
      // much of the trading day has actually happened.
      //
      // Comparing a partial day against a full-day median would mark *every*
      // merchant Critical each morning — at 9am a merchant trading exactly its
      // normal pace has maybe 40% of its daily orders in, and would score 40.
      // That is a worse signal than the absolute scale it replaces, so the
      // baseline is scaled by the share of a typical trading day elapsed.
      //
      // Merchants too new or too sporadic for a baseline keep the old absolute
      // scale. It is a poor signal, but inventing a baseline from one or two
      // samples is worse, and a brand-new merchant should not be marked
      // Critical for having no history yet.
      const baselineOrders = baselineOrdersFor(merchant.id)
      const expectedByNow =
        baselineOrders === null ? null : baselineOrders * dayProgress

      const orderActivity =
        expectedByNow === null || expectedByNow <= 0
          ? Math.min(100, merchant.orders_today * 5)
          : Math.max(
              0,
              Math.min(100, (merchant.orders_today / expectedByNow) * 100)
            )

      const deviceHealth =
        totalStations > 0 ? (healthyStations / totalStations) * 100 : 100

      // Every signal here is on a 0-100 scale so the weights below sum to a
      // 0-100 score. This one used to end in `/ 100`, which put it on 0-1 and
      // made its 15% weight contribute at most 0.15 points instead of 15 —
      // silently capping every merchant on the platform at ~85 and making a
      // green "Optimal" score unreachable. The other 50 is menu + payment
      // terminal, still hardcoded pending real setup signals.
      const setupCompleteness =
        (merchant.active_staff_count > 0 ? 25 : 0) +
        (totalStations > 0 ? 25 : 0) +
        50

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

      // A merchant with nothing provisioned has not failed a health check —
      // there is nothing to check. Three of the signals above (deviceHealth,
      // paymentHealth, appCurrency) default to a perfect 100 when their data
      // is absent, so such a merchant scored as if healthy on those while
      // orderActivity's 25% weight pulled it into the red. The result was a
      // "Critical" card reading "All systems optimal". Gate it out instead of
      // dressing up the number.
      const isUnconfigured =
        totalStations === 0 &&
        merchant.active_locations === 0 &&
        merchant.active_staff_count === 0

      // Compute weighted health score.
      //
      // Signals are weighted then renormalised by the weight actually present,
      // so a withheld signal drops out rather than scoring zero. Early in the
      // trading day `orderActivity` carries no information (see
      // `orderActivityIsMeaningful`); fixing its weight at 0.25 regardless
      // would deduct up to 25 points from every merchant on the platform each
      // morning — the same class of bug as scoring an unconfigured merchant.
      const signals: Array<{ value: number; weight: number }> = [
        { value: deviceHealth, weight: 0.2 },
        { value: setupCompleteness, weight: 0.15 },
        { value: paymentHealth, weight: 0.15 },
        { value: issueVolume, weight: 0.1 },
        { value: supportActivity, weight: 0.1 },
        { value: appCurrency, weight: 0.05 },
      ]

      if (orderActivityIsMeaningful) {
        signals.push({ value: orderActivity, weight: 0.25 })
      }

      const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0)

      const healthScore = isUnconfigured
        ? null
        : Math.round(
            signals.reduce((sum, s) => sum + s.value * s.weight, 0) / totalWeight
          )

      // Determine health tier
      const healthTier: MerchantHealthTier =
        healthScore === null
          ? 'unscored'
          : healthScore >= 80
            ? 'green'
            : healthScore >= 60
              ? 'yellow'
              : 'red'

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

      // Gated on the day being informative: at 7am "No orders today" is true
      // of nearly every merchant on the platform and means nothing. Firing it
      // then trains admins to ignore the alert by the time it does matter.
      if (
        orderActivityIsMeaningful &&
        merchant.orders_today === 0 &&
        merchant.active_locations > 0
      ) {
        alerts.push('No orders today')
      } else if (
        orderActivityIsMeaningful &&
        expectedByNow !== null &&
        merchant.orders_today > 0 &&
        merchant.orders_today < expectedByNow * 0.5
      ) {
        // A busy merchant collapsing to a fraction of its normal volume is the
        // case the old absolute scale could not see at all: 25 orders still
        // scored a perfect 100 whether the merchant normally did 20 or 400.
        // Stated with both numbers so the admin can judge it without leaving
        // the row.
        // Quotes the pro-rated expectation, not the full-day median, because
        // that is the number actually being compared against — "12 vs ~40 by
        // now" is checkable at 2pm, whereas "12 vs ~80 typical" invites the
        // admin to dismiss it as "the day isn't over yet".
        alerts.push(
          `Orders well below normal (${merchant.orders_today} so far vs ~${Math.round(expectedByNow)} expected by now)`
        )
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
    // Worst first, with unscored merchants last. Subtracting the scores
    // directly would yield NaN for a null, and an inconsistent comparator
    // leaves the whole list in an arbitrary order — not just the null rows.
    .sort((a, b) => {
      if (a.healthScore === null && b.healthScore === null) {
        return a.name.localeCompare(b.name)
      }
      if (a.healthScore === null) return 1
      if (b.healthScore === null) return -1
      return a.healthScore - b.healthScore
    })

  return healthData
}
