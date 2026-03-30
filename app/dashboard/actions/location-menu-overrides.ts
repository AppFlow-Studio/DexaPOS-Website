'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

export interface LocationMenuItemOverride {
    id: string
    location_id: string
    menu_item_id: string
    custom_price: number | null
    custom_cash_price: number | null
    is_available: boolean
    stock_tracking_mode: 'in_stock' | 'out_of_stock' | 'quantity' | 'use_default' | null
    created_at: string
    updated_at: string
}

export interface OverrideData {
    custom_price?: number | null
    custom_cash_price?: number | null
    is_available?: boolean
    stock_tracking_mode?: 'in_stock' | 'out_of_stock' | 'quantity' | 'use_default' | null
}

export interface EffectivePrice {
    price: number
    cash_price: number | null
    is_override: boolean
    global_price: number
    global_cash_price: number | null
}

// ============================================================================
// GET OPERATIONS
// ============================================================================

/**
 * Get a single location override for a menu item
 */
export async function GetLocationMenuItemOverride(
    locationId: string,
    menuItemId: string
): Promise<LocationMenuItemOverride | null> {
    if (!locationId || !menuItemId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('location_menu_item_overrides')
        .select('*')
        .eq('location_id', locationId)
        .eq('menu_item_id', menuItemId)
        .single()

    if (error) {
        // No override exists - this is normal
        if (error.code === 'PGRST116') {
            return null
        }
        console.error('Error getting location menu item override:', error)
        return null
    }

    return data as LocationMenuItemOverride
}

/**
 * Get all overrides for a location
 */
export async function GetLocationMenuItemOverrides(
    locationId: string
): Promise<LocationMenuItemOverride[]> {
    if (!locationId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('location_menu_item_overrides')
        .select('*')
        .eq('location_id', locationId)

    if (error) {
        console.error('Error getting location menu item overrides:', error)
        return []
    }

    return data as LocationMenuItemOverride[]
}

/**
 * Get all overrides for a location with menu item details
 */
export async function GetLocationMenuItemOverridesWithDetails(
    locationId: string
) {
    if (!locationId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('location_menu_item_overrides')
        .select(`
            *,
            menu_item:menu_items(
                id,
                name,
                description,
                price,
                cash_price,
                image
            )
        `)
        .eq('location_id', locationId)

    if (error) {
        console.error('Error getting location menu item overrides with details:', error)
        return []
    }

    return data
}

// ============================================================================
// CREATE/UPDATE OPERATIONS
// ============================================================================

/**
 * Create or update a location override for a menu item
 * Uses upsert to handle both create and update
 */
export async function UpsertLocationMenuItemOverride(
    locationId: string,
    menuItemId: string,
    data: OverrideData
) {
    if (!locationId || !menuItemId) {
        return { error: 'Location ID and Menu Item ID are required' }
    }

    const supabase = createServerSupabaseClient()

    // Build the upsert data
    const upsertData: Record<string, unknown> = {
        location_id: locationId,
        menu_item_id: menuItemId,
    }

    if (data.custom_price !== undefined) {
        upsertData.custom_price = data.custom_price
    }
    if (data.custom_cash_price !== undefined) {
        upsertData.custom_cash_price = data.custom_cash_price
    }
    if (data.is_available !== undefined) {
        upsertData.is_available = data.is_available
    }
    if (data.stock_tracking_mode !== undefined) {
        upsertData.stock_tracking_mode = data.stock_tracking_mode
    }

    const { data: override, error } = await supabase
        .from('location_item_overrides')
        .upsert(upsertData, {
            onConflict: 'location_id,menu_item_id',
        })
        .select()
        .single()

    if (error) {
        console.error('Error upserting location menu item override:', error)
        return { error: error.message }
    }

    return { data: override as LocationMenuItemOverride }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Delete a location override, reverting to global price
 */
export async function DeleteLocationMenuItemOverride(
    locationId: string,
    menuItemId: string
) {
    if (!locationId || !menuItemId) {
        return { error: 'Location ID and Menu Item ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('location_menu_item_overrides')
        .delete()
        .eq('location_id', locationId)
        .eq('menu_item_id', menuItemId)

    if (error) {
        console.error('Error deleting location menu item override:', error)
        return { error: error.message }
    }

    return { success: true }
}

/**
 * Delete all overrides for a location
 */
export async function DeleteAllLocationMenuItemOverrides(locationId: string) {
    if (!locationId) {
        return { error: 'Location ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('location_menu_item_overrides')
        .delete()
        .eq('location_id', locationId)

    if (error) {
        console.error('Error deleting all location menu item overrides:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// EFFECTIVE PRICE OPERATIONS
// ============================================================================

/**
 * Get the effective price for a menu item at a location
 * Returns the override price if exists, otherwise the global price
 */
export async function GetEffectiveMenuItemPrice(
    locationId: string,
    menuItemId: string
): Promise<EffectivePrice | null> {
    if (!menuItemId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    // Get the global item first
    const { data: menuItem, error: itemError } = await supabase
        .from('menu_items')
        .select('price, cash_price')
        .eq('id', menuItemId)
        .single()

    if (itemError || !menuItem) {
        console.error('Error getting menu item:', itemError)
        return null
    }

    // If no location specified, return global price
    if (!locationId || locationId === 'all') {
        return {
            price: menuItem.price,
            cash_price: menuItem.cash_price,
            is_override: false,
            global_price: menuItem.price,
            global_cash_price: menuItem.cash_price,
        }
    }

    // Check for location override
    const { data: override } = await supabase
        .from('location_menu_item_overrides')
        .select('custom_price, custom_cash_price')
        .eq('location_id', locationId)
        .eq('menu_item_id', menuItemId)
        .single()

    if (override && (override.custom_price !== null || override.custom_cash_price !== null)) {
        return {
            price: override.custom_price ?? menuItem.price,
            cash_price: override.custom_cash_price ?? menuItem.cash_price,
            is_override: true,
            global_price: menuItem.price,
            global_cash_price: menuItem.cash_price,
        }
    }

    return {
        price: menuItem.price,
        cash_price: menuItem.cash_price,
        is_override: false,
        global_price: menuItem.price,
        global_cash_price: menuItem.cash_price,
    }
}

/**
 * Get effective prices for multiple menu items at a location
 */
export async function GetEffectiveMenuItemPrices(
    locationId: string,
    menuItemIds: string[]
): Promise<Map<string, EffectivePrice>> {
    const result = new Map<string, EffectivePrice>()

    if (!menuItemIds.length) {
        return result
    }

    const supabase = createServerSupabaseClient()

    // Get all menu items
    const { data: menuItems, error: itemsError } = await supabase
        .from('menu_items')
        .select('id, price, cash_price')
        .in('id', menuItemIds)

    if (itemsError || !menuItems) {
        console.error('Error getting menu items:', itemsError)
        return result
    }

    // If no location specified, return global prices
    if (!locationId || locationId === 'all') {
        for (const item of menuItems) {
            result.set(item.id, {
                price: item.price,
                cash_price: item.cash_price,
                is_override: false,
                global_price: item.price,
                global_cash_price: item.cash_price,
            })
        }
        return result
    }

    // Get all overrides for this location
    const { data: overrides } = await supabase
        .from('location_menu_item_overrides')
        .select('menu_item_id, custom_price, custom_cash_price')
        .eq('location_id', locationId)
        .in('menu_item_id', menuItemIds)

    const overrideMap = new Map(
        (overrides || []).map(o => [o.menu_item_id, o])
    )

    // Build result with effective prices
    for (const item of menuItems) {
        const override = overrideMap.get(item.id)
        const hasOverride = override && (override.custom_price !== null || override.custom_cash_price !== null)

        result.set(item.id, {
            price: hasOverride && override.custom_price !== null ? override.custom_price : item.price,
            cash_price: hasOverride && override.custom_cash_price !== null ? override.custom_cash_price : item.cash_price,
            is_override: !!hasOverride,
            global_price: item.price,
            global_cash_price: item.cash_price,
        })
    }

    return result
}

// ============================================================================
// ITEM NEW FLAG (location_item_overrides.is_new)
// ============================================================================

/**
 * Get the manual is_new flag for an item at a specific location.
 */
export async function GetItemIsNew(
    menuItemId: string,
    locationId: string
): Promise<boolean> {
    if (!menuItemId || !locationId) return false

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
        .from('location_item_overrides')
        .select('is_new')
        .eq('menu_item_id', menuItemId)
        .eq('location_id', locationId)
        .single()

    if (error) return false
    return data?.is_new ?? false
}

/**
 * Set the manual is_new flag for an item at a specific location.
 * Upserts location_item_overrides; only touches is_new — leaves all other fields unchanged.
 */
export async function SetItemNew(
    menuItemId: string,
    locationId: string,
    isNew: boolean
): Promise<{ success: boolean; error?: string }> {
    if (!menuItemId || !locationId) {
        return { success: false, error: 'Missing menuItemId or locationId' }
    }

    const supabase = createServerSupabaseClient()
    const { error } = await supabase
        .from('location_item_overrides')
        .upsert(
            { menu_item_id: menuItemId, location_id: locationId, is_new: isNew },
            { onConflict: 'menu_item_id,location_id', ignoreDuplicates: false }
        )

    if (error) {
        console.error('Error setting item new:', error)
        return { success: false, error: error.message }
    }

    return { success: true }
}

// ============================================================================
// ITEM POPULAR FLAG (location_item_overrides.is_popular)
// ============================================================================

/**
 * Get the manual is_popular flag for an item at a specific location.
 * Reads from location_item_overrides (L2), NOT location_menu_item_overrides (L5).
 */
export async function GetItemIsPopular(
    menuItemId: string,
    locationId: string
): Promise<boolean> {
    if (!menuItemId || !locationId) return false

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
        .from('location_item_overrides')
        .select('is_popular')
        .eq('menu_item_id', menuItemId)
        .eq('location_id', locationId)
        .single()

    if (error) return false
    return data?.is_popular ?? false
}

/**
 * Set the manual is_popular flag for an item at a specific location.
 * Upserts location_item_overrides; only touches is_popular — leaves all other fields unchanged.
 */
export async function SetItemPopular(
    menuItemId: string,
    locationId: string,
    isPopular: boolean
): Promise<{ success: boolean; error?: string }> {
    if (!menuItemId || !locationId) {
        return { success: false, error: 'Missing menuItemId or locationId' }
    }

    const supabase = createServerSupabaseClient()
    const { error } = await supabase
        .from('location_item_overrides')
        .upsert(
            { menu_item_id: menuItemId, location_id: locationId, is_popular: isPopular },
            { onConflict: 'menu_item_id,location_id', ignoreDuplicates: false }
        )

    if (error) {
        console.error('Error setting item popular:', error)
        return { success: false, error: error.message }
    }

    return { success: true }
}

