'use server'

// ============================================================================
// Admin OrderOut Server Actions
// Description: HQ admin actions for OrderOut onboarding and status
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import { extractConnectedPlatforms } from '@/lib/orderout/helpers'
import type {
  PushMenuToChannelsResult,
  PushChannelsHistoryEntry,
  PushChannelsLiveStatus,
} from '@/app/dashboard/actions/orderout'

// ============================================================================
// Types
// ============================================================================

export interface OrderOutAccountStatus {
  hasAccount: boolean
  ooAccountId: string | null
  accountManagerEmail: string | null
  status: string | null
}

export interface OrderOutRestaurantStatus {
  locationId: string
  locationName: string
  hasRestaurant: boolean
  ooAccountId: string | null
  ooRestaurantId: string | null
  status: string | null
  isAcceptingOrders: boolean
  prepTimeMinutes: number
  connectedChannels: unknown
  autoAcceptOrders: boolean
  channelsConfirmedByMerchant: string[]
  channelsConfirmedAt: string | null
}

export interface OrderOutStatus {
  account: OrderOutAccountStatus
  restaurants: OrderOutRestaurantStatus[]
}

export interface AdminOnboardOrderOutParams {
  merchantId: string
  locationId: string
  accountName: string
  restaurantName: string
  streetAddress: string
  city: string
  state: string
  zipcode: string
  country: string
  restaurantManagerEmail: string
  restaurantManagerFirstname: string
  restaurantManagerLastname: string
  restaurantManagerPhone: string
}

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get OrderOut status for a merchant — account + all location restaurant statuses
 */
export async function getAdminOrderOutStatus(
  merchantId: string
): Promise<{ success: boolean; data: OrderOutStatus | null; error: string | null }> {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    // Get account
    const { data: account } = await supabase
      .from('orderout_accounts')
      .select('id, oo_account_id, account_manager_email, status')
      .eq('merchant_id', merchantId)
      .single()

    // Get all locations for the merchant
    const { data: locations, error: locError } = await supabase
      .from('locations')
      .select('id, name')
      .eq('merchant_id', merchantId)
      .order('name')

    if (locError) {
      return { success: false, data: null, error: locError.message }
    }

    const locationIds = locations?.map((l) => l.id) || []

    // Get restaurants for these locations
    let restaurants: OrderOutRestaurantStatus[] = []
    if (locationIds.length > 0) {
      const { data: restData } = await supabase
        .from('orderout_restaurants')
        .select('location_id, oo_account_id, oo_restaurant_id, status, is_accepting_orders, prep_time_minutes, connected_channels, auto_accept_orders, channels_confirmed_by_merchant, channels_confirmed_at')
        .in('location_id', locationIds)

      const restMap = new Map(restData?.map((r) => [r.location_id, r]) || [])

      restaurants = locations!.map((loc) => {
        const rest = restMap.get(loc.id)
        return {
          locationId: loc.id,
          locationName: loc.name,
          hasRestaurant: !!rest,
          ooAccountId: rest?.oo_account_id || null,
          ooRestaurantId: rest?.oo_restaurant_id || null,
          status: rest?.status || null,
          isAcceptingOrders: rest?.is_accepting_orders ?? false,
          prepTimeMinutes: rest?.prep_time_minutes ?? 20,
          connectedChannels: rest?.connected_channels || null,
          autoAcceptOrders: rest?.auto_accept_orders ?? false,
          channelsConfirmedByMerchant: rest?.channels_confirmed_by_merchant ?? [],
          channelsConfirmedAt: rest?.channels_confirmed_at ?? null,
        }
      })
    }

    return {
      success: true,
      data: {
        account: {
          hasAccount: !!account,
          ooAccountId: account?.oo_account_id || null,
          accountManagerEmail: account?.account_manager_email || null,
          status: account?.status || null,
        },
        restaurants,
      },
      error: null,
    }
  } catch (error) {
    console.error('[getAdminOrderOutStatus] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// Menu Sync Operations
// ============================================================================

/**
 * Get OrderOut menu sync status for admin — mirrors getOrderOutMenuSyncStatus
 */
export async function getAdminOrderOutMenuSyncStatus(
  merchantId: string,
  locationId: string,
  menuId?: string
): Promise<{
  success: boolean
  data: import('@/app/dashboard/actions/orderout').OrderOutMenuSyncStatus | null
  error: string | null
}> {
  if (!merchantId || !locationId) {
    return { success: false, data: null, error: 'Missing required parameters' }
  }

  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    // Get restaurant for this location
    const { data: restaurant } = await supabase
      .from('orderout_restaurants')
      .select('id')
      .eq('location_id', locationId)
      .single()

    if (!restaurant) {
      return {
        success: true,
        data: { lastSync: null, totalSyncs: 0, ooMenuId: null, syncHistory: [] },
        error: null,
      }
    }

    // Query orderout_menu_links for the canonical oo_menu_id
    let ooMenuId: string | null = null
    if (menuId) {
      const { data: link } = await supabase
        .from('orderout_menu_links')
        .select('oo_menu_id')
        .eq('orderout_restaurant_id', restaurant.id)
        .eq('menu_id', menuId)
        .eq('is_active', true)
        .single()
      ooMenuId = link?.oo_menu_id || null
    }

    // Get all sync records for this restaurant
    const { data: allSyncs } = await supabase
      .from('orderout_menu_syncs')
      .select('id, sync_status, items_synced, items_failed, error_details, created_at, synced_at, oo_menu_id, menu_id, menu_payload_snapshot')
      .eq('orderout_restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })

    // Filter by menuId if provided
    let filteredSyncs = allSyncs || []
    if (menuId && filteredSyncs.length > 0) {
      const { data: menuRecord } = await supabase
        .from('menus')
        .select('name')
        .eq('id', menuId)
        .single()

      filteredSyncs = filteredSyncs.filter((sync) => {
        if (sync.menu_id === menuId) return true
        if (!sync.menu_id && menuRecord?.name) {
          const snapshot = sync.menu_payload_snapshot as Record<string, unknown> | null
          return snapshot?.name === menuRecord.name
        }
        return false
      })
    }

    const latestSync = filteredSyncs[0] || null

    // If no link found, fall back to scanning sync records (legacy)
    if (!ooMenuId) {
      const latestSuccessful = filteredSyncs.find(
        (s) => s.sync_status === 'success' && s.oo_menu_id
      )
      ooMenuId = latestSuccessful?.oo_menu_id || null
    }

    // Build sync history
    const syncHistory = filteredSyncs.map((sync) => {
      const snapshot = sync.menu_payload_snapshot as Record<string, unknown> | null
      return {
        id: sync.id,
        menuId: sync.menu_id || menuId || null,
        menuName: (snapshot?.name as string) || null,
        status: sync.sync_status,
        itemsSynced: sync.items_synced ?? 0,
        itemsFailed: sync.items_failed ?? 0,
        errorDetails: sync.error_details,
        createdAt: sync.created_at,
        completedAt: sync.synced_at,
        ooMenuId: sync.oo_menu_id || null,
      }
    })

    return {
      success: true,
      data: {
        lastSync: latestSync
          ? {
              id: latestSync.id,
              status: latestSync.sync_status,
              itemsSynced: latestSync.items_synced ?? 0,
              itemsFailed: latestSync.items_failed ?? 0,
              errorDetails: latestSync.error_details,
              createdAt: latestSync.created_at,
              completedAt: latestSync.synced_at,
            }
          : null,
        totalSyncs: filteredSyncs.length,
        ooMenuId,
        syncHistory,
      },
      error: null,
    }
  } catch (error) {
    console.error('[getAdminOrderOutMenuSyncStatus] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check menu payload diff for admin — mirrors checkMenuPayloadDiff
 */
export async function adminCheckMenuPayloadDiff(
  merchantId: string,
  locationId: string,
  menuId: string
): Promise<{
  success: boolean
  data: import('@/app/dashboard/actions/orderout').MenuPayloadDiffResult | null
  error: string | null
}> {
  if (!merchantId || !locationId || !menuId) {
    return { success: false, data: null, error: 'Missing required parameters' }
  }

  try {
    await assertHQPermission('hq.merchant.view')

    const { transformMenuToOrderOut, canonicalStringify } = await import('@/lib/orderout/transform-menu')
    type MenuWithCategories = import('@/types/menu').MenuWithCategories

    const supabase = createServerSupabaseClient()

    // Get restaurant for this location
    const { data: restaurant } = await supabase
      .from('orderout_restaurants')
      .select('id, oo_restaurant_id')
      .eq('location_id', locationId)
      .single()

    if (!restaurant?.oo_restaurant_id) {
      return {
        success: false,
        data: null,
        error: 'Location is not onboarded to OrderOut',
      }
    }

    // Fetch current menu data via RPC and transform
    const { data: menuData, error: menuError } = await supabase.rpc(
      'get_menu_with_categories',
      { p_menu_id: menuId, p_location_id: locationId }
    )

    if (menuError || !menuData) {
      return {
        success: false,
        data: null,
        error: menuError?.message || 'Failed to fetch menu data',
      }
    }

    const currentPayload = transformMenuToOrderOut(menuData as MenuWithCategories)
    const currentItemCount = currentPayload.items.length

    // Get last successful sync's payload snapshot
    const { data: lastSuccessSync } = await supabase
      .from('orderout_menu_syncs')
      .select('menu_payload_snapshot, items_synced')
      .eq('orderout_restaurant_id', restaurant.id)
      .eq('menu_id', menuId)
      .eq('sync_status', 'success')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single()

    // No previous sync = new menu
    if (!lastSuccessSync) {
      return {
        success: true,
        data: {
          hasChanges: true,
          isNewMenu: true,
          currentItemCount,
          lastSyncedItemCount: 0,
        },
        error: null,
      }
    }

    // Compare using canonical stringify
    const lastSnapshot = lastSuccessSync.menu_payload_snapshot
    const hasChanges = canonicalStringify(currentPayload) !== canonicalStringify(lastSnapshot)

    return {
      success: true,
      data: {
        hasChanges,
        isNewMenu: false,
        currentItemCount,
        lastSyncedItemCount: lastSuccessSync.items_synced ?? 0,
      },
      error: null,
    }
  } catch (error) {
    console.error('[adminCheckMenuPayloadDiff] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Push a menu to OrderOut for admin — mirrors pushMenuToOrderOut
 */
export async function adminPushMenuToOrderOut(
  params: { merchantId: string; menuId: string; locationId: string }
): Promise<{
  success: boolean
  data?: { syncId: string; itemsSynced: number; ooMenuId: string | null; isUpdate: boolean }
  error: string | null
}> {
  const { merchantId, menuId, locationId } = params

  if (!merchantId || !menuId || !locationId) {
    return { success: false, error: 'Missing required parameters' }
  }

  let syncRecord: { id: string } | null = null

  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const { transformMenuToOrderOut } = await import('@/lib/orderout/transform-menu')
    type MenuWithCategories = import('@/types/menu').MenuWithCategories

    const supabase = createServerSupabaseClient()

    // Get OrderOut restaurant for this location
    const { data: restaurant, error: restaurantError } = await supabase
      .from('orderout_restaurants')
      .select('id, oo_restaurant_id')
      .eq('location_id', locationId)
      .single()

    if (restaurantError || !restaurant?.oo_restaurant_id) {
      return {
        success: false,
        error: 'Location is not onboarded to OrderOut',
      }
    }

    // Fetch menu data via RPC
    const { data: menuData, error: menuError } = await supabase.rpc(
      'get_menu_with_categories',
      { p_menu_id: menuId, p_location_id: locationId }
    )

    if (menuError || !menuData) {
      return {
        success: false,
        error: menuError?.message || 'Failed to fetch menu data',
      }
    }

    // Transform menu to OrderOut format
    const menuPayload = transformMenuToOrderOut(menuData as MenuWithCategories)
    const itemCount = menuPayload.items.length

    // Check for existing link (determines if this is an update)
    const { data: existingLink } = await supabase
      .from('orderout_menu_links')
      .select('id, oo_menu_id')
      .eq('orderout_restaurant_id', restaurant.id)
      .eq('menu_id', menuId)
      .eq('is_active', true)
      .single()

    const isUpdate = !!existingLink?.oo_menu_id

    // Insert pending sync record
    const { data: syncData, error: syncInsertError } = await supabase
      .from('orderout_menu_syncs')
      .insert({
        orderout_restaurant_id: restaurant.id,
        menu_id: menuId,
        sync_direction: 'push',
        sync_status: 'pending',
        menu_payload_snapshot: menuPayload,
        items_synced: 0,
        items_failed: 0,
      })
      .select('id')
      .single()

    if (syncInsertError || !syncData) {
      console.error('[adminPushMenuToOrderOut] Failed to create sync record:', syncInsertError)
    } else {
      syncRecord = syncData
    }

    // Call OrderOut API directly to push menu
    const orderOutApiUrl = process.env.NEXT_PUBLIC_ORDEROUT_API_URL
    const orderOutApiKey = process.env.ORDEROUT_API_KEY

    if (!orderOutApiUrl || !orderOutApiKey) {
      return { success: false, error: 'OrderOut API configuration missing' }
    }

    const pushUrl =
      isUpdate && existingLink?.oo_menu_id
        ? `${orderOutApiUrl}/pos/restaurant/${restaurant.oo_restaurant_id}/menu/${existingLink.oo_menu_id}`
        : `${orderOutApiUrl}/pos/restaurant/${restaurant.oo_restaurant_id}/menu`
    const pushMethod = isUpdate && existingLink?.oo_menu_id ? 'PUT' : 'POST'

    const pushResponse = await fetch(pushUrl, {
      method: pushMethod,
      headers: {
        'Content-Type': 'application/json',
        'api-key': orderOutApiKey,
      },
      body: JSON.stringify(menuPayload),
    })

    let pushResult: Record<string, unknown> = {}
    try {
      pushResult = await pushResponse.json()
    } catch {
      // Response may not be JSON
    }

    // Extract oo_menu_id from response
    let ooMenuId: string | null = null
    if (pushResponse.ok && pushResult) {
      if (isUpdate && existingLink?.oo_menu_id) {
        ooMenuId = existingLink.oo_menu_id
      } else {
        const responseId = pushResult.id
        if (responseId) {
          ooMenuId = String(responseId)
        }
      }
    }

    // Fall back to GET to retrieve oo_menu_id for new pushes
    if (pushResponse.ok && !ooMenuId) {
      try {
        const getResponse = await fetch(
          `${orderOutApiUrl}/pos/restaurant/${restaurant.oo_restaurant_id}/menu`,
          {
            method: 'GET',
            headers: {
              'api-key': orderOutApiKey,
              accept: 'application/json',
            },
          }
        )

        if (getResponse.ok) {
          const menus = await getResponse.json()
          if (Array.isArray(menus) && menus.length > 0) {
            const matched = menus.find(
              (m: { name?: string }) => m.name === menuPayload.name
            )
            const target = matched || menus[menus.length - 1]
            ooMenuId = target?.id ? String(target.id) : null
          }
        }
      } catch (getErr) {
        console.warn('[adminPushMenuToOrderOut] Failed to retrieve oo_menu_id:', getErr)
      }
    }

    // Update sync record with result
    if (syncRecord?.id) {
      if (pushResponse.ok) {
        await supabase
          .from('orderout_menu_syncs')
          .update({
            sync_status: 'success',
            items_synced: itemCount,
            items_failed: 0,
            synced_at: new Date().toISOString(),
            ...(ooMenuId ? { oo_menu_id: ooMenuId } : {}),
          })
          .eq('id', syncRecord.id)
      } else {
        const errorMsg =
          (pushResult.error as string) ||
          (pushResult.message as string) ||
          `OrderOut API returned ${pushResponse.status}`
        await supabase
          .from('orderout_menu_syncs')
          .update({
            sync_status: 'failed',
            error_details: errorMsg,
            synced_at: new Date().toISOString(),
          })
          .eq('id', syncRecord.id)
      }
    }

    // Upsert orderout_menu_links after successful push
    if (pushResponse.ok && ooMenuId) {
      await supabase
        .from('orderout_menu_links')
        .upsert(
          {
            orderout_restaurant_id: restaurant.id,
            menu_id: menuId,
            oo_menu_id: ooMenuId,
            oo_menu_name: menuPayload.name,
            is_active: true,
            last_pushed_at: new Date().toISOString(),
            last_sync_id: syncRecord?.id || null,
          },
          { onConflict: 'orderout_restaurant_id,menu_id' }
        )
    }

    if (!pushResponse.ok) {
      const errorMsg =
        (pushResult.error as string) ||
        (pushResult.message as string) ||
        'Failed to push menu to OrderOut'
      return { success: false, error: errorMsg }
    }

    // Audit log
    const { data: menuInfo } = await supabase
      .from('menus')
      .select('name')
      .eq('id', menuId)
      .single()

    await LogAuditEvent({
      merchantId,
      locationId,
      action: 'pushed_menu_to_orderout',
      actionCategory: 'integrations',
      severity: 'info',
      resourceType: 'menu',
      resourceId: menuId,
      resourceName: menuInfo?.name || 'Menu',
      metadata: {
        admin_action: true,
        pushed_by_admin: userId,
        items_synced: itemCount,
        sync_id: syncRecord?.id,
        oo_restaurant_id: restaurant.oo_restaurant_id,
        oo_menu_id: ooMenuId,
      },
    })

    return {
      success: true,
      data: {
        syncId: syncRecord?.id || '',
        itemsSynced: itemCount,
        ooMenuId,
        isUpdate,
      },
      error: null,
    }
  } catch (error) {
    console.error('[adminPushMenuToOrderOut] Exception:', error)

    // Mark sync record as failed
    if (syncRecord?.id) {
      try {
        const supabase = createServerSupabaseClient()
        await supabase
          .from('orderout_menu_syncs')
          .update({
            sync_status: 'failed',
            error_details: error instanceof Error ? error.message : 'Unexpected error',
            synced_at: new Date().toISOString(),
          })
          .eq('id', syncRecord.id)
      } catch {
        console.error('[adminPushMenuToOrderOut] Failed to mark sync record as failed after exception')
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// WRITE Operations
// ============================================================================

/**
 * Onboard a location to OrderOut via the edge function
 */
export async function adminOnboardOrderOut(
  params: AdminOnboardOrderOutParams
): Promise<{ success: boolean; data?: { oo_account_id: string; oo_restaurant_id: string; dashboard_url: string }; error: string | null }> {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: 'Server configuration error' }
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/orderout-onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        merchant_id: params.merchantId,
        location_id: params.locationId,
        account_name: params.accountName,
        restaurant_name: params.restaurantName,
        street_address: params.streetAddress,
        city: params.city,
        state: params.state,
        zipcode: params.zipcode,
        country: params.country,
        restaurant_manager_email: params.restaurantManagerEmail,
        restaurant_manager_firstname: params.restaurantManagerFirstname,
        restaurant_manager_lastname: params.restaurantManagerLastname,
        restaurant_manager_phone: params.restaurantManagerPhone,
      }),
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      return { success: false, error: result.error || 'Failed to onboard location to OrderOut' }
    }

    // Fetch location name for audit log
    const supabase = createServerSupabaseClient()
    const { data: loc } = await supabase
      .from('locations')
      .select('name')
      .eq('id', params.locationId)
      .single()

    await LogAuditEvent({
      merchantId: params.merchantId,
      locationId: params.locationId,
      action: `HQ Admin Connected Location to OrderOut`,
      actionCategory: 'integrations',
      severity: 'info',
      resourceType: 'orderout_integration',
      resourceId: params.locationId,
      resourceName: loc?.name || 'Location',
      metadata: {
        location_name: loc?.name,
        connected_by_admin: userId,
        oo_account_id: result.data?.oo_account_id,
        oo_restaurant_id: result.data?.oo_restaurant_id,
      },
    })

    return { success: true, data: result.data, error: null }
  } catch (error) {
    console.error('[adminOnboardOrderOut] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// Admin: Push Menu to Connected Delivery Channels
// ============================================================================

const ADMIN_PUSH_CHANNELS_COOLDOWN_SECONDS = 30
const ADMIN_PUSH_CHANNELS_HOURLY_LIMIT = 5

export interface AdminPushMenuToChannelsParams {
  merchantId: string
  menuId: string
  locationId: string
}

/**
 * HQ admin variant of pushMenuToConnectedChannels. Same rate limits apply in v1.
 */
export async function adminPushMenuToConnectedChannels(
  params: AdminPushMenuToChannelsParams
): Promise<{
  success: boolean
  data?: PushMenuToChannelsResult
  error: string | null
}> {
  const { merchantId, menuId, locationId } = params

  if (!merchantId || !menuId || !locationId) {
    return { success: false, error: 'Missing required parameters' }
  }

  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Lazy reconcile
    try {
      await supabase.rpc('reconcile_stuck_push_channels_syncs', {
        p_stale_minutes: 5,
      })
    } catch (e) {
      console.warn('[adminPushMenuToConnectedChannels] reconcile threw (non-fatal):', e)
    }

    // Resolve OrderOut restaurant
    const { data: restaurant, error: restaurantError } = await supabase
      .from('orderout_restaurants')
      .select(
        'id, oo_restaurant_id, connected_channels, channels_confirmed_by_merchant'
      )
      .eq('location_id', locationId)
      .single()

    if (restaurantError || !restaurant?.oo_restaurant_id) {
      return { success: false, error: 'Location is not onboarded to OrderOut' }
    }

    // Resolve active menu link
    const { data: link, error: linkError } = await supabase
      .from('orderout_menu_links')
      .select('id, oo_menu_id')
      .eq('orderout_restaurant_id', restaurant.id)
      .eq('menu_id', menuId)
      .eq('is_active', true)
      .single()

    if (linkError || !link?.oo_menu_id) {
      return {
        success: false,
        error: 'Menu has not been uploaded to OrderOut yet',
      }
    }

    // Union of webhook-verified + merchant self-confirmed channels. HQ has no
    // self-attest control — the merchant confirms from their dashboard — but
    // the admin push inherits the same union so HQ can push as soon as the
    // merchant has self-confirmed.
    const verified = extractConnectedPlatforms(restaurant.connected_channels)
    const confirmed = ((restaurant.channels_confirmed_by_merchant ?? []) as string[]).map(
      (c: string) => c.toUpperCase()
    )
    const expectedChannels = Array.from(new Set([...verified, ...confirmed]))

    if (expectedChannels.length === 0) {
      return {
        success: false,
        error:
          'No connected delivery channels. Ask the merchant to confirm platforms in the OrderOut tab first.',
      }
    }

    // 30-second cooldown
    const cooldownSince = new Date(
      Date.now() - ADMIN_PUSH_CHANNELS_COOLDOWN_SECONDS * 1000
    ).toISOString()
    const { count: recentCount } = await supabase
      .from('orderout_menu_syncs')
      .select('id', { head: true, count: 'exact' })
      .eq('orderout_restaurant_id', restaurant.id)
      .eq('menu_id', menuId)
      .eq('sync_direction', 'push_channels')
      .gte('created_at', cooldownSince)

    if ((recentCount ?? 0) >= 1) {
      await LogAuditEvent({
        merchantId,
        locationId,
        action: 'pushed_menu_to_channels_rate_limited',
        actionCategory: 'integrations',
        severity: 'warning',
        resourceType: 'menu',
        resourceId: menuId,
        metadata: {
          admin_action: true,
          triggered_by_admin: userId,
          cooldown_seconds: ADMIN_PUSH_CHANNELS_COOLDOWN_SECONDS,
          trigger: 'admin',
        },
      })
      return {
        success: false,
        error: `Please wait ${ADMIN_PUSH_CHANNELS_COOLDOWN_SECONDS} seconds between pushes.`,
      }
    }

    // Hourly ceiling
    const hourSince = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: hourlyCount } = await supabase
      .from('orderout_menu_syncs')
      .select('id', { head: true, count: 'exact' })
      .eq('orderout_restaurant_id', restaurant.id)
      .eq('menu_id', menuId)
      .eq('sync_direction', 'push_channels')
      .gte('created_at', hourSince)

    if ((hourlyCount ?? 0) >= ADMIN_PUSH_CHANNELS_HOURLY_LIMIT) {
      await LogAuditEvent({
        merchantId,
        locationId,
        action: 'pushed_menu_to_channels_rate_limited',
        actionCategory: 'integrations',
        severity: 'warning',
        resourceType: 'menu',
        resourceId: menuId,
        metadata: {
          admin_action: true,
          triggered_by_admin: userId,
          hourly_count: hourlyCount,
          hourly_limit: ADMIN_PUSH_CHANNELS_HOURLY_LIMIT,
          trigger: 'admin',
        },
      })
      return {
        success: false,
        error: `Hourly push limit reached (${ADMIN_PUSH_CHANNELS_HOURLY_LIMIT}). Try again later.`,
      }
    }

    // Insert sync row
    const { data: syncRow, error: insertErr } = await supabase
      .from('orderout_menu_syncs')
      .insert({
        orderout_restaurant_id: restaurant.id,
        menu_id: menuId,
        oo_menu_id: link.oo_menu_id,
        sync_direction: 'push_channels',
        sync_status: 'pending',
        expected_channels: expectedChannels,
        pushed_to_channels: [],
        trigger_source: 'admin',
        triggered_by_user_id: userId ?? null,
        menu_payload_snapshot: {
          trigger: 'push_channels',
          expected_channels: expectedChannels,
          oo_menu_id: link.oo_menu_id,
        },
      })
      .select('id')
      .single()

    if (insertErr || !syncRow) {
      console.error('[adminPushMenuToConnectedChannels] insert sync failed:', insertErr)
      return { success: false, error: 'Failed to create sync record' }
    }

    const orderOutApiUrl = process.env.NEXT_PUBLIC_ORDEROUT_API_URL
    const orderOutApiKey = process.env.ORDEROUT_API_KEY
    if (!orderOutApiUrl || !orderOutApiKey) {
      await supabase
        .from('orderout_menu_syncs')
        .update({
          sync_status: 'failed',
          error_details: 'OrderOut API configuration missing',
          synced_at: new Date().toISOString(),
        })
        .eq('id', syncRow.id)
      return { success: false, error: 'OrderOut API configuration missing' }
    }

    const triggeredAt = new Date().toISOString()
    const pushUrl = `${orderOutApiUrl}/pos/restaurant/${restaurant.oo_restaurant_id}/push_menu/${link.oo_menu_id}`

    let httpStatus = 0
    let errMsg: string | null = null
    try {
      const resp = await fetch(pushUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': orderOutApiKey,
        },
      })
      httpStatus = resp.status
      if (!resp.ok) {
        try {
          const body = await resp.json()
          errMsg =
            (body?.error as string) ||
            (body?.message as string) ||
            `OrderOut API returned ${resp.status}`
        } catch {
          errMsg = `OrderOut API returned ${resp.status}`
        }
      }
    } catch (e) {
      errMsg = e instanceof Error ? e.message : 'Network error'
    }

    if (httpStatus >= 200 && httpStatus < 300) {
      await supabase
        .from('orderout_menu_syncs')
        .update({ sync_status: 'syncing' })
        .eq('id', syncRow.id)

      await LogAuditEvent({
        merchantId,
        locationId,
        action: 'pushed_menu_to_channels',
        actionCategory: 'integrations',
        severity: 'info',
        resourceType: 'menu',
        resourceId: menuId,
        metadata: {
          admin_action: true,
          triggered_by_admin: userId,
          sync_id: syncRow.id,
          oo_menu_id: link.oo_menu_id,
          oo_restaurant_id: restaurant.oo_restaurant_id,
          expected_channels: expectedChannels,
          verified_channels: verified,
          self_confirmed_channels: confirmed,
          trigger: 'admin',
        },
      })

      return {
        success: true,
        data: {
          syncId: syncRow.id,
          ooMenuId: link.oo_menu_id,
          expectedChannels,
          triggeredAt,
        },
        error: null,
      }
    }

    await supabase
      .from('orderout_menu_syncs')
      .update({
        sync_status: 'failed',
        error_details: errMsg ?? 'Unknown error',
        synced_at: new Date().toISOString(),
      })
      .eq('id', syncRow.id)

    await LogAuditEvent({
      merchantId,
      locationId,
      action: 'pushed_menu_to_channels_failed',
      actionCategory: 'integrations',
      severity: 'warning',
      resourceType: 'menu',
      resourceId: menuId,
      metadata: {
        admin_action: true,
        triggered_by_admin: userId,
        sync_id: syncRow.id,
        oo_menu_id: link.oo_menu_id,
        oo_restaurant_id: restaurant.oo_restaurant_id,
        http_status: httpStatus,
        error_message: errMsg,
        trigger: 'admin',
      },
    })

    return { success: false, error: errMsg ?? 'Failed to push to channels' }
  } catch (error) {
    console.error('[adminPushMenuToConnectedChannels] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getAdminPushChannelsHistory(
  merchantId: string,
  locationId: string,
  opts?: { menuId?: string; limit?: number }
): Promise<{
  success: boolean
  data: PushChannelsHistoryEntry[] | null
  error: string | null
}> {
  if (!merchantId || !locationId) {
    return { success: false, data: null, error: 'Missing required parameters' }
  }

  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data: restaurant } = await supabase
      .from('orderout_restaurants')
      .select('id')
      .eq('location_id', locationId)
      .single()

    if (!restaurant) {
      return { success: true, data: [], error: null }
    }

    const limit = opts?.limit ?? 25

    let query = supabase
      .from('orderout_menu_syncs')
      .select(
        'id, menu_id, oo_menu_id, sync_status, expected_channels, pushed_to_channels, trigger_source, triggered_by_user_id, created_at, synced_at, error_details'
      )
      .eq('orderout_restaurant_id', restaurant.id)
      .eq('sync_direction', 'push_channels')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (opts?.menuId) {
      query = query.eq('menu_id', opts.menuId)
    }

    const { data: rows, error: rowsErr } = await query
    if (rowsErr) {
      return { success: false, data: null, error: rowsErr.message }
    }
    if (!rows || rows.length === 0) {
      return { success: true, data: [], error: null }
    }

    const syncIds = rows.map((r) => r.id)
    const { data: results } = await supabase
      .from('orderout_menu_sync_results')
      .select(
        'sync_id, delivery_service, status, status_code, error_message, raw_response, received_at'
      )
      .in('sync_id', syncIds)

    const resultsBySyncId = new Map<string, PushChannelsHistoryEntry['perChannelResults']>()
    for (const r of results || []) {
      const list = resultsBySyncId.get(r.sync_id) ?? []
      list.push({
        deliveryService: r.delivery_service,
        status: r.status,
        statusCode: r.status_code ?? null,
        errorMessage: r.error_message ?? null,
        rawResponse: r.raw_response,
        receivedAt: r.received_at,
      })
      resultsBySyncId.set(r.sync_id, list)
    }

    const menuIds = Array.from(
      new Set(rows.map((r) => r.menu_id).filter(Boolean) as string[])
    )
    const { data: menus } =
      menuIds.length > 0
        ? await supabase.from('menus').select('id, name').in('id', menuIds)
        : { data: [] as { id: string; name: string }[] }

    const menuNameById = new Map(menus?.map((m) => [m.id, m.name]) || [])

    const entries: PushChannelsHistoryEntry[] = rows.map((r) => ({
      syncId: r.id,
      menuId: r.menu_id || null,
      menuName: r.menu_id ? menuNameById.get(r.menu_id) ?? null : null,
      ooMenuId: r.oo_menu_id || null,
      syncStatus: r.sync_status,
      expectedChannels: (r.expected_channels as string[] | null) ?? [],
      pushedToChannels: (r.pushed_to_channels as string[] | null) ?? [],
      triggerSource: r.trigger_source ?? null,
      triggeredByUserId: r.triggered_by_user_id ?? null,
      createdAt: r.created_at,
      syncedAt: r.synced_at ?? null,
      errorDetails: r.error_details,
      perChannelResults: resultsBySyncId.get(r.id) ?? [],
    }))

    return { success: true, data: entries, error: null }
  } catch (error) {
    console.error('[getAdminPushChannelsHistory] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Minimal synced-menus getter for the admin UI. Mirrors the merchant
 * getOrderOutSyncedMenus but is location-scoped by merchantId + locationId.
 */
export async function getAdminOrderOutSyncedMenusForLocation(
  merchantId: string,
  locationId: string
): Promise<{
  success: boolean
  data: Array<{ menuId: string; menuName: string; ooMenuId: string | null }> | null
  error: string | null
}> {
  if (!merchantId || !locationId) {
    return { success: false, data: null, error: 'Missing required parameters' }
  }

  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data: restaurant } = await supabase
      .from('orderout_restaurants')
      .select('id')
      .eq('location_id', locationId)
      .single()

    if (!restaurant) {
      return { success: true, data: [], error: null }
    }

    const { data: links, error: linksError } = await supabase
      .from('orderout_menu_links')
      .select('menu_id, oo_menu_id, oo_menu_name, is_active')
      .eq('orderout_restaurant_id', restaurant.id)
      .eq('is_active', true)

    if (linksError) {
      return { success: false, data: null, error: linksError.message }
    }

    if (!links || links.length === 0) {
      return { success: true, data: [], error: null }
    }

    const menuIds = links.map((l) => l.menu_id).filter(Boolean) as string[]
    const { data: menus } = await supabase
      .from('menus')
      .select('id, name')
      .in('id', menuIds)

    const menuNameMap = new Map(menus?.map((m) => [m.id, m.name]) || [])

    const result = links.map((l) => ({
      menuId: l.menu_id,
      menuName: menuNameMap.get(l.menu_id) || l.oo_menu_name || 'Unknown Menu',
      ooMenuId: l.oo_menu_id,
    }))

    return { success: true, data: result, error: null }
  } catch (error) {
    console.error('[getAdminOrderOutSyncedMenusForLocation] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getAdminPushChannelsLiveStatus(
  merchantId: string,
  syncId: string
): Promise<{
  success: boolean
  data: PushChannelsLiveStatus | null
  error: string | null
}> {
  if (!merchantId || !syncId) {
    return { success: false, data: null, error: 'Missing required parameters' }
  }

  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data: row, error: rowErr } = await supabase
      .from('orderout_menu_syncs')
      .select(
        'id, sync_status, expected_channels, pushed_to_channels, synced_at, created_at'
      )
      .eq('id', syncId)
      .single()

    if (rowErr || !row) {
      return { success: false, data: null, error: 'Sync not found' }
    }

    return {
      success: true,
      data: {
        syncId: row.id,
        syncStatus: row.sync_status,
        expectedChannels: (row.expected_channels as string[] | null) ?? [],
        reportedChannels: (row.pushed_to_channels as string[] | null) ?? [],
        lastUpdatedAt: row.synced_at ?? row.created_at,
      },
      error: null,
    }
  } catch (error) {
    console.error('[getAdminPushChannelsLiveStatus] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
