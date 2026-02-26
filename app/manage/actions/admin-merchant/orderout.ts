'use server'

// ============================================================================
// Admin OrderOut Server Actions
// Description: HQ admin actions for OrderOut onboarding and status
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

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
        .select('location_id, oo_account_id, oo_restaurant_id, status, is_accepting_orders, prep_time_minutes, connected_channels, auto_accept_orders')
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
