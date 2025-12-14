'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

export interface LocationModifierGroupOverride {
    id: string
    location_id: string
    modifier_group_id: string
    merchant_id: string
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface LocationModifierItemOverride {
    id: string
    location_id: string
    modifier_group_item_id: string
    merchant_id: string
    price_modifier: number | null
    is_active: boolean | null
    display_order: number | null
    stock_tracking_mode: 'quantity' | 'in_stock' | 'out_of_stock' | null
    current_stock: number | null
    low_stock_threshold: number
    created_at: string
    updated_at: string
}

export interface ModifierGroupOverrideData {
    is_active?: boolean
}

export interface ModifierItemOverrideData {
    price_modifier?: number | null
    is_active?: boolean | null
    display_order?: number | null
    stock_tracking_mode?: 'quantity' | 'in_stock' | 'out_of_stock' | null
    current_stock?: number | null
}

// ============================================================================
// MODIFIER GROUP OVERRIDES - GET OPERATIONS
// ============================================================================

/**
 * Get a single location override for a modifier group
 */
export async function GetLocationModifierGroupOverride(
    locationId: string,
    modifierGroupId: string
): Promise<LocationModifierGroupOverride | null> {
    if (!locationId || !modifierGroupId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('location_modifier_group_overrides')
        .select('*')
        .eq('location_id', locationId)
        .eq('modifier_group_id', modifierGroupId)
        .single()

    if (error) {
        // No override exists - this is normal
        if (error.code === 'PGRST116') {
            return null
        }
        console.error('Error getting location modifier group override:', error)
        return null
    }

    return data as LocationModifierGroupOverride
}

/**
 * Get all modifier group overrides for a location
 */
export async function GetLocationModifierGroupOverrides(
    locationId: string
): Promise<LocationModifierGroupOverride[]> {
    if (!locationId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('location_modifier_group_overrides')
        .select('*')
        .eq('location_id', locationId)

    if (error) {
        console.error('Error getting location modifier group overrides:', error)
        return []
    }

    return data as LocationModifierGroupOverride[]
}

// ============================================================================
// MODIFIER GROUP OVERRIDES - UPSERT OPERATIONS
// ============================================================================

/**
 * Upsert location override for a modifier group (hide/show at location)
 */
export async function UpsertLocationModifierGroupOverride(
    locationId: string,
    modifierGroupId: string,
    merchantId: string,
    data: ModifierGroupOverrideData
) {
    if (!locationId || !modifierGroupId || !merchantId) {
        return { error: 'Missing required parameters' }
    }

    const supabase = createServerSupabaseClient()

    const { data: override, error } = await supabase
        .from('location_modifier_group_overrides')
        .upsert({
            location_id: locationId,
            modifier_group_id: modifierGroupId,
            merchant_id: merchantId,
            is_active: data.is_active ?? true,
        }, {
            onConflict: 'location_id,modifier_group_id',
        })
        .select()
        .single()

    if (error) {
        console.error('Error upserting modifier group override:', error)
        return { error: error.message }
    }

    return { data: override as LocationModifierGroupOverride }
}

// ============================================================================
// MODIFIER GROUP OVERRIDES - DELETE OPERATIONS
// ============================================================================

/**
 * Delete location override for a modifier group (revert to global visibility)
 */
export async function DeleteLocationModifierGroupOverride(
    locationId: string,
    modifierGroupId: string
) {
    if (!locationId || !modifierGroupId) {
        return { error: 'Missing required parameters' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('location_modifier_group_overrides')
        .delete()
        .eq('location_id', locationId)
        .eq('modifier_group_id', modifierGroupId)

    if (error) {
        console.error('Error deleting modifier group override:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// MODIFIER ITEM OVERRIDES - GET OPERATIONS
// ============================================================================

/**
 * Get a single location override for a modifier item
 */
export async function GetLocationModifierItemOverride(
    locationId: string,
    modifierItemId: string
): Promise<LocationModifierItemOverride | null> {
    if (!locationId || !modifierItemId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('location_modifier_item_overrides')
        .select('*')
        .eq('location_id', locationId)
        .eq('modifier_group_item_id', modifierItemId)
        .single()

    if (error) {
        // No override exists - this is normal
        if (error.code === 'PGRST116') {
            return null
        }
        console.error('Error getting location modifier item override:', error)
        return null
    }

    return data as LocationModifierItemOverride
}

/**
 * Get all modifier item overrides for a location
 */
export async function GetLocationModifierItemOverrides(
    locationId: string
): Promise<LocationModifierItemOverride[]> {
    if (!locationId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('location_modifier_item_overrides')
        .select('*')
        .eq('location_id', locationId)

    if (error) {
        console.error('Error getting location modifier item overrides:', error)
        return []
    }

    return data as LocationModifierItemOverride[]
}

// ============================================================================
// MODIFIER ITEM OVERRIDES - UPSERT OPERATIONS
// ============================================================================

/**
 * Upsert location override for a modifier item
 * (hide/show, reorder, adjust price, track stock at location)
 */
export async function UpsertLocationModifierItemOverride(
    locationId: string,
    modifierItemId: string,
    merchantId: string,
    data: ModifierItemOverrideData
) {
    if (!locationId || !modifierItemId || !merchantId) {
        return { error: 'Missing required parameters' }
    }

    const supabase = createServerSupabaseClient()

    // Build upsert data - only include fields that are explicitly set
    const upsertData: Record<string, unknown> = {
        location_id: locationId,
        modifier_group_item_id: modifierItemId,
        merchant_id: merchantId,
    }

    // Only include fields that are defined (allows selective updates)
    if (data.price_modifier !== undefined) upsertData.price_modifier = data.price_modifier
    if (data.is_active !== undefined) upsertData.is_active = data.is_active
    if (data.display_order !== undefined) upsertData.display_order = data.display_order
    if (data.stock_tracking_mode !== undefined) upsertData.stock_tracking_mode = data.stock_tracking_mode
    if (data.current_stock !== undefined) upsertData.current_stock = data.current_stock

    const { data: override, error } = await supabase
        .from('location_modifier_item_overrides')
        .upsert(upsertData, {
            onConflict: 'location_id,modifier_group_item_id',
        })
        .select()
        .single()

    if (error) {
        console.error('Error upserting modifier item override:', error)
        return { error: error.message }
    }

    return { data: override as LocationModifierItemOverride }
}

// ============================================================================
// MODIFIER ITEM OVERRIDES - DELETE OPERATIONS
// ============================================================================

/**
 * Delete location override for a modifier item (revert to global settings)
 */
export async function DeleteLocationModifierItemOverride(
    locationId: string,
    modifierItemId: string
) {
    if (!locationId || !modifierItemId) {
        return { error: 'Missing required parameters' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('location_modifier_item_overrides')
        .delete()
        .eq('location_id', locationId)
        .eq('modifier_group_item_id', modifierItemId)

    if (error) {
        console.error('Error deleting modifier item override:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// EFFECTIVE VALUE CALCULATION
// ============================================================================

/**
 * Get modifier group with location-aware data
 * Returns global group with effective is_active based on location override
 */
export async function GetModifierGroupWithLocationContext(
    modifierGroupId: string,
    locationId: string | null
) {
    if (!modifierGroupId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    // Get base modifier group
    const { data: group, error: groupError } = await supabase
        .from('modifier_groups')
        .select(`
            *,
            modifier_group_items(*)
        `)
        .eq('id', modifierGroupId)
        .single()

    if (groupError || !group) {
        console.error('Error getting modifier group:', groupError)
        return null
    }

    // If no location context, return as-is
    if (!locationId || locationId === 'all') {
        return {
            ...group,
            has_location_override: false,
            effective_is_active: true,
            location_override: null,
        }
    }

    // Get location override if it exists
    const override = await GetLocationModifierGroupOverride(locationId, modifierGroupId)

    const effective_is_active = override ? override.is_active : true

    return {
        ...group,
        has_location_override: !!override,
        effective_is_active,
        location_override: override,
    }
}
