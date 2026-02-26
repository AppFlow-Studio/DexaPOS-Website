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
