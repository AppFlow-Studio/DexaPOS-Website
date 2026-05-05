'use server'

// ============================================================================
// Admin Locations Server Actions
// Description: CRUD operations for managing merchant locations from HQ
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import type { Location, CreateLocationInput, UpdateLocationInput } from '@/types/merchant_locations'
import type { ManagerAssignableUser } from '@/app/dashboard/actions/location-members'

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get all locations for a merchant (admin access)
 */
export async function adminGetMerchantLocations(merchantId: string) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[adminGetMerchantLocations] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    return { success: true, error: null, data: data as Location[] }
  } catch (err) {
    console.error('[adminGetMerchantLocations] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch locations',
      data: null,
    }
  }
}

/**
 * Get a single location for a merchant (admin access)
 */
export async function adminGetMerchantLocationById(
  merchantId: string,
  locationId: string
) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('id', locationId)
      .single()

    if (error) {
      console.error('[adminGetMerchantLocationById] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    return { success: true, error: null, data: data as Location }
  } catch (err) {
    console.error('[adminGetMerchantLocationById] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch location',
      data: null,
    }
  }
}

/**
 * Get the clerk_org_id for a merchant (admin access)
 */
export async function adminGetMerchantClerkOrgId(merchantId: string) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('merchants')
      .select('clerk_org_id')
      .eq('id', merchantId)
      .single()

    if (error || !data) {
      return { success: false, error: 'Merchant not found', clerkOrgId: null }
    }

    return { success: true, error: null, clerkOrgId: data.clerk_org_id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get merchant',
      clerkOrgId: null,
    }
  }
}

/**
 * Get manager-assignable users for a merchant by merchantId (admin access)
 */
export async function adminGetManagerAssignableUsers(merchantId: string): Promise<ManagerAssignableUser[]> {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    // Get the merchant's clerk_org_id
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('clerk_org_id')
      .eq('id', merchantId)
      .single()

    if (merchantError || !merchant?.clerk_org_id) {
      return []
    }

    const { data, error } = await supabase
      .from('members')
      .select(`
        user_id,
        role,
        users!inner(
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq('organization_id', merchant.clerk_org_id)

    if (error) {
      console.error('[adminGetManagerAssignableUsers] Error:', error)
      return []
    }

    const mapped = (data || [])
      .map((row: any) => {
        const user = row.users || {}
        const fullName = [user.first_name, user.last_name]
          .filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)
          .join(' ')
          .trim()

        return {
          user_id: row.user_id as string,
          email: (user.email as string) || '',
          full_name: fullName || (user.email as string) || row.user_id,
          role_code: (row.role as string) || null,
        }
      })
      .filter((row) => typeof row.user_id === 'string' && row.user_id.length > 0)

    const deduped = Array.from(
      new Map(mapped.map((row) => [row.user_id, row])).values()
    )

    deduped.sort((a, b) => a.full_name.localeCompare(b.full_name))
    return deduped
  } catch (err) {
    console.error('[adminGetManagerAssignableUsers] Error:', err)
    return []
  }
}

// ============================================================================
// CREATE Operations
// ============================================================================

/**
 * Create a new location for a merchant (admin access)
 */
export async function adminCreateLocation(
  merchantId: string,
  input: CreateLocationInput
) {
  try {
    await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Check for duplicate code if provided
    if (input.code) {
      const { data: existingLocation } = await supabase
        .from('locations')
        .select('id')
        .eq('merchant_id', merchantId)
        .eq('code', input.code)
        .single()

      if (existingLocation) {
        return {
          success: false,
          error: 'A location with this code already exists',
          data: null,
        }
      }
    }

    const { data, error } = await supabase
      .from('locations')
      .insert({
        merchant_id: merchantId,
        name: input.name,
        code: input.code || null,
        description: input.description || null,
        phone: input.phone || null,
        email: input.email || null,
        address_line1: input.address_line1,
        address_line2: input.address_line2 || null,
        city: input.city,
        state: input.state,
        postal_code: input.postal_code,
        country: input.country || 'US',
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        timezone: input.timezone || 'America/New_York',
        pricing_strategy: input.pricing_strategy || 'manual',
        dual_pricing_percentage: input.dual_pricing_percentage ?? 4.0,
        use_merchant_pricing_defaults: input.use_merchant_pricing_defaults ?? true,
        is_active: input.is_active ?? true,
        is_accepting_orders: input.is_accepting_orders ?? true,
        business_hours: input.business_hours || {},
        ein: input.ein || null,
        tax_id: input.tax_id || null,
        sales_tax_rate: input.sales_tax_rate ?? null,
        tax_registration_status: input.tax_registration_status || 'pending',
        onboarding_step: input.onboarding_step ?? 0,
        onboarding_completed: input.onboarding_completed ?? false,
        uses_global_menu: input.uses_global_menu ?? true,
        public_metadata: input.public_metadata || {},
        luqra_mid: input.luqra_mid || null,
        luqra_mid_descriptor: input.luqra_mid_descriptor || null,
        luqra_mid_status: input.luqra_mid ? input.luqra_mid_status || 'pending' : 'pending',
        luqra_mid_assigned_at: input.luqra_mid ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (error) {
      console.error('[adminCreateLocation] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `HQ Admin Created Location: ${input.name}`,
      actionCategory: 'settings',
      resourceType: 'location',
      resourceId: data.id,
      resourceName: input.name,
      locationId: data.id,
      changes: { after: input as unknown as Record<string, unknown> },
    })

    return { success: true, error: null, data: data as Location }
  } catch (err) {
    console.error('[adminCreateLocation] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create location',
      data: null,
    }
  }
}

// ============================================================================
// UPDATE Operations
// ============================================================================

/**
 * Update a merchant location from HQ (admin access)
 */
export async function adminUpdateLocation(
  merchantId: string,
  locationId: string,
  input: UpdateLocationInput
) {
  try {
    await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    const { data: currentLocation, error: currentLocationError } = await supabase
      .from('locations')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('id', locationId)
      .single()

    if (currentLocationError || !currentLocation) {
      return { success: false, error: 'Location not found', data: null }
    }

    if (input.code) {
      const { data: existingLocation } = await supabase
        .from('locations')
        .select('id')
        .eq('merchant_id', merchantId)
        .eq('code', input.code)
        .neq('id', locationId)
        .single()

      if (existingLocation) {
        return {
          success: false,
          error: 'A location with this code already exists',
          data: null,
        }
      }
    }

    const updateData: Record<string, unknown> = {}

    if (input.name !== undefined) updateData.name = input.name
    if (input.code !== undefined) updateData.code = input.code || null
    if (input.description !== undefined) updateData.description = input.description || null
    if (input.phone !== undefined) updateData.phone = input.phone || null
    if (input.email !== undefined) updateData.email = input.email || null
    if (input.address_line1 !== undefined) updateData.address_line1 = input.address_line1
    if (input.address_line2 !== undefined) updateData.address_line2 = input.address_line2 || null
    if (input.city !== undefined) updateData.city = input.city
    if (input.state !== undefined) updateData.state = input.state
    if (input.postal_code !== undefined) updateData.postal_code = input.postal_code
    if (input.country !== undefined) updateData.country = input.country
    if (input.latitude !== undefined) updateData.latitude = input.latitude
    if (input.longitude !== undefined) updateData.longitude = input.longitude
    if (input.timezone !== undefined) updateData.timezone = input.timezone
    if (input.pricing_strategy !== undefined) updateData.pricing_strategy = input.pricing_strategy
    if (input.dual_pricing_percentage !== undefined) {
      updateData.dual_pricing_percentage = input.dual_pricing_percentage
    }
    if (input.use_merchant_pricing_defaults !== undefined) {
      updateData.use_merchant_pricing_defaults = input.use_merchant_pricing_defaults
    }
    if (input.is_active !== undefined) updateData.is_active = input.is_active
    if (input.is_accepting_orders !== undefined) {
      updateData.is_accepting_orders = input.is_accepting_orders
    }
    if (input.business_hours !== undefined) updateData.business_hours = input.business_hours
    if (input.ein !== undefined) updateData.ein = input.ein || null
    if (input.tax_id !== undefined) updateData.tax_id = input.tax_id || null
    if (input.sales_tax_rate !== undefined) updateData.sales_tax_rate = input.sales_tax_rate
    if (input.tax_registration_status !== undefined) {
      updateData.tax_registration_status = input.tax_registration_status
    }
    if (input.onboarding_step !== undefined) updateData.onboarding_step = input.onboarding_step
    if (input.onboarding_completed !== undefined) {
      updateData.onboarding_completed = input.onboarding_completed
    }
    if (input.uses_global_menu !== undefined) updateData.uses_global_menu = input.uses_global_menu
    if (input.public_metadata !== undefined) updateData.public_metadata = input.public_metadata
    if (input.luqra_mid !== undefined) {
      const nextMid = input.luqra_mid || null
      const prevMid = (currentLocation as { luqra_mid?: string | null }).luqra_mid ?? null
      updateData.luqra_mid = nextMid
      if (nextMid && nextMid !== prevMid) {
        updateData.luqra_mid_assigned_at = new Date().toISOString()
      } else if (!nextMid) {
        updateData.luqra_mid_assigned_at = null
      }
    }
    if (input.luqra_mid_descriptor !== undefined) {
      updateData.luqra_mid_descriptor = input.luqra_mid_descriptor || null
    }
    if (input.luqra_mid_status !== undefined) {
      updateData.luqra_mid_status = input.luqra_mid_status
    }

    const { data, error } = await supabase
      .from('locations')
      .update(updateData)
      .eq('merchant_id', merchantId)
      .eq('id', locationId)
      .select('*')
      .single()

    if (error) {
      console.error('[adminUpdateLocation] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    const changedFields: string[] = []
    const beforeLog: Record<string, unknown> = {}
    const afterLog: Record<string, unknown> = {}

    Object.keys(updateData).forEach((key) => {
      const nextValue = updateData[key]
      const previousValue = currentLocation[key as keyof typeof currentLocation]

      if (JSON.stringify(nextValue) !== JSON.stringify(previousValue)) {
        changedFields.push(key)
        beforeLog[key] = previousValue
        afterLog[key] = nextValue
      }
    })

    if (changedFields.length > 0) {
      await LogAuditEvent({
        merchantId,
        action: `HQ Admin Updated Location: ${data.name}`,
        actionCategory: 'settings',
        resourceType: 'location',
        resourceId: locationId,
        resourceName: data.name,
        locationId,
        changes: { before: beforeLog, after: afterLog },
      })
    }

    return { success: true, error: null, data: data as Location }
  } catch (err) {
    console.error('[adminUpdateLocation] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update location',
      data: null,
    }
  }
}

/**
 * Toggle location active status from HQ (admin access)
 */
export async function adminToggleLocationActive(
  merchantId: string,
  locationId: string
) {
  try {
    await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    const { data: currentLocation, error: currentLocationError } = await supabase
      .from('locations')
      .select('id, name, is_active')
      .eq('merchant_id', merchantId)
      .eq('id', locationId)
      .single()

    if (currentLocationError || !currentLocation) {
      return { success: false, error: 'Location not found', data: null }
    }

    const nextIsActive = !currentLocation.is_active

    const { data, error } = await supabase
      .from('locations')
      .update({ is_active: nextIsActive })
      .eq('merchant_id', merchantId)
      .eq('id', locationId)
      .select('*')
      .single()

    if (error) {
      console.error('[adminToggleLocationActive] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    await LogAuditEvent({
      merchantId,
      action: `HQ Admin ${nextIsActive ? 'Activated' : 'Deactivated'} Location: ${data.name}`,
      actionCategory: 'settings',
      resourceType: 'location',
      resourceId: locationId,
      resourceName: data.name,
      locationId,
      changes: {
        before: { is_active: currentLocation.is_active },
        after: { is_active: nextIsActive },
      },
    })

    return { success: true, error: null, data: data as Location }
  } catch (err) {
    console.error('[adminToggleLocationActive] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update location status',
      data: null,
    }
  }
}

/**
 * Toggle location order acceptance from HQ (admin access)
 */
export async function adminToggleLocationOrders(
  merchantId: string,
  locationId: string
) {
  try {
    await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    const { data: currentLocation, error: currentLocationError } = await supabase
      .from('locations')
      .select('id, name, is_accepting_orders')
      .eq('merchant_id', merchantId)
      .eq('id', locationId)
      .single()

    if (currentLocationError || !currentLocation) {
      return { success: false, error: 'Location not found', data: null }
    }

    const nextIsAcceptingOrders = !currentLocation.is_accepting_orders

    const { data, error } = await supabase
      .from('locations')
      .update({ is_accepting_orders: nextIsAcceptingOrders })
      .eq('merchant_id', merchantId)
      .eq('id', locationId)
      .select('*')
      .single()

    if (error) {
      console.error('[adminToggleLocationOrders] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    await LogAuditEvent({
      merchantId,
      action: `HQ Admin ${nextIsAcceptingOrders ? 'Enabled' : 'Disabled'} Orders for Location: ${data.name}`,
      actionCategory: 'settings',
      resourceType: 'location',
      resourceId: locationId,
      resourceName: data.name,
      locationId,
      changes: {
        before: { is_accepting_orders: currentLocation.is_accepting_orders },
        after: { is_accepting_orders: nextIsAcceptingOrders },
      },
    })

    return { success: true, error: null, data: data as Location }
  } catch (err) {
    console.error('[adminToggleLocationOrders] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update order status',
      data: null,
    }
  }
}
