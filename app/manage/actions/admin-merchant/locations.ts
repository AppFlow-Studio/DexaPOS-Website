'use server'

// ============================================================================
// Admin Locations Server Actions
// Description: CRUD operations for managing merchant locations from HQ
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import type { Location, CreateLocationInput } from '@/types/merchant_locations'
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
