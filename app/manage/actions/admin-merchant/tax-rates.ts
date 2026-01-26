'use server'

// ============================================================================
// Admin Tax Rates Server Actions
// Description: CRUD operations for viewing/managing merchant tax rates from HQ
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import type { TaxCategory, TaxRate } from '@/types/tax'

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get all tax rates for a merchant across all locations (admin access)
 */
export async function getAdminMerchantTaxRates(
  merchantId: string,
  locationId?: string | null
) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    // First get all locations for this merchant
    const { data: locations, error: locError } = await supabase
      .from('locations')
      .select('id, name')
      .eq('merchant_id', merchantId)

    if (locError) {
      console.error('[getAdminMerchantTaxRates] Error fetching locations:', locError)
      return { success: false, error: locError.message, data: null }
    }

    const locationIds = locations?.map((l) => l.id) || []

    if (locationIds.length === 0) {
      return { success: true, data: [], error: null }
    }

    // Get tax rates for these locations
    let query = supabase
      .from('tax_rates')
      .select('*')
      .in('location_id', locationIds)
      .eq('is_active', true)
      .order('location_id')
      .order('tax_category')

    if (locationId && locationId !== 'all') {
      query = query.eq('location_id', locationId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[getAdminMerchantTaxRates] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Enrich with location names
    const locationMap = new Map(locations?.map((l) => [l.id, l.name]) || [])
    const enrichedData = (data || []).map((rate) => ({
      ...rate,
      location_name: locationMap.get(rate.location_id) || 'Unknown',
    }))

    return {
      success: true,
      data: enrichedData as (TaxRate & { location_name: string })[],
      error: null,
    }
  } catch (error) {
    console.error('[getAdminMerchantTaxRates] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * Get tax rates for a specific location (admin access)
 */
export async function getAdminLocationTaxRates(locationId: string) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('tax_rates')
      .select('*')
      .eq('location_id', locationId)
      .eq('is_active', true)
      .order('tax_category')

    if (error) {
      console.error('[getAdminLocationTaxRates] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    return { success: true, data: data as TaxRate[], error: null }
  } catch (error) {
    console.error('[getAdminLocationTaxRates] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// ============================================================================
// WRITE Operations
// ============================================================================

/**
 * Create or update a tax rate (admin access)
 */
export async function adminUpsertTaxRate(
  merchantId: string,
  locationId: string,
  taxCategory: TaxCategory,
  name: string,
  percentage: number
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Validate percentage
    if (percentage < 0 || percentage > 100) {
      return {
        success: false,
        error: 'Percentage must be between 0 and 100',
        data: null,
      }
    }

    // First, deactivate any existing active rate for this category
    await supabase
      .from('tax_rates')
      .update({ is_active: false })
      .eq('location_id', locationId)
      .eq('tax_category', taxCategory)
      .eq('is_active', true)

    // Create new rate
    const { data, error } = await supabase
      .from('tax_rates')
      .insert({
        location_id: locationId,
        name,
        percentage,
        tax_category: taxCategory,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('[adminUpsertTaxRate] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Fetch location name for audit log
    const { data: location } = await supabase
      .from('locations')
      .select('name')
      .eq('id', locationId)
      .single()

    await LogAuditEvent({
      merchantId: merchantId,
      action: `HQ Admin Set Tax Rate: ${name} (${percentage}%)`,
      actionCategory: 'settings',
      resourceType: 'tax_rate',
      resourceId: data.id,
      resourceName: name,
      locationId: locationId,
      metadata: {
        location_name: location?.name,
        tax_category: taxCategory,
        percentage: percentage,
        set_by_admin: userId,
      },
    })

    return { success: true, data: data as TaxRate, error: null }
  } catch (error) {
    console.error('[adminUpsertTaxRate] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * Deactivate a tax rate (admin access)
 */
export async function adminDeactivateTaxRate(merchantId: string, taxRateId: string) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Fetch details before update
    const { data: taxRate } = await supabase
      .from('tax_rates')
      .select('name, location_id, tax_category')
      .eq('id', taxRateId)
      .single()

    const { error } = await supabase
      .from('tax_rates')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taxRateId)

    if (error) {
      console.error('[adminDeactivateTaxRate] Error:', error)
      return { success: false, error: error.message }
    }

    if (taxRate) {
      const { data: loc } = await supabase
        .from('locations')
        .select('name')
        .eq('id', taxRate.location_id)
        .single()

      await LogAuditEvent({
        merchantId: merchantId,
        action: `HQ Admin Deactivated Tax Rate: ${taxRate.name}`,
        actionCategory: 'settings',
        resourceType: 'tax_rate',
        resourceId: taxRateId,
        resourceName: taxRate.name,
        locationId: taxRate.location_id,
        metadata: {
          location_name: loc?.name,
          tax_category: taxRate.tax_category,
          deactivated_by_admin: userId,
        },
      })
    }

    return { success: true, error: null }
  } catch (error) {
    console.error('[adminDeactivateTaxRate] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Delete a tax rate permanently (admin access)
 */
export async function adminDeleteTaxRate(merchantId: string, taxRateId: string) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Fetch details before delete
    const { data: taxRate } = await supabase
      .from('tax_rates')
      .select('name, location_id, tax_category')
      .eq('id', taxRateId)
      .single()

    let locationName = ''
    if (taxRate?.location_id) {
      const { data: loc } = await supabase
        .from('locations')
        .select('name')
        .eq('id', taxRate.location_id)
        .single()
      locationName = loc?.name || ''
    }

    const { error } = await supabase.from('tax_rates').delete().eq('id', taxRateId)

    if (error) {
      console.error('[adminDeleteTaxRate] Error:', error)
      return { success: false, error: error.message }
    }

    if (taxRate) {
      await LogAuditEvent({
        merchantId: merchantId,
        action: `HQ Admin Deleted Tax Rate: ${taxRate.name}`,
        actionCategory: 'settings',
        resourceType: 'tax_rate',
        resourceId: taxRateId,
        resourceName: taxRate.name,
        locationId: taxRate.location_id,
        metadata: {
          location_name: locationName,
          tax_category: taxRate.tax_category,
          deleted_by_admin: userId,
        },
      })
    }

    return { success: true, error: null }
  } catch (error) {
    console.error('[adminDeleteTaxRate] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
