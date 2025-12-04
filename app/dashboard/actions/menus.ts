'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MenusModel } from '@/types/db-modles'
import { SyncMenuToAllLocations } from './location-menus'

// ============================================================================
// TYPES
// ============================================================================

export interface MenuWithLocationStatus extends MenusModel {
    location_menu_id?: string
    is_active_at_location: boolean
    display_order_at_location?: number
    is_inherited: boolean // true for global menus when viewing a location
}

export interface MenuItemWithPricing {
    id: string
    name: string
    description: string | null
    price: number
    cash_price: number | null
    image: string | null
    availability: boolean
    // Location-specific fields
    effective_price: number
    effective_cash_price: number | null
    has_price_override: boolean
    location_is_available: boolean
    global_price: number
    global_cash_price: number | null
}

// ============================================================================
// GET OPERATIONS
// ============================================================================

/**
 * Get menus for a merchant, with optional location context
 * 
 * When locationId is provided:
 *   - Returns global menus (location_id IS NULL) that are available at the location
 *   - Includes is_active_at_location status from location_menus table
 *   - Also returns location-specific menus if any
 * 
 * When locationId is null:
 *   - Returns only global menus (location_id IS NULL)
 * 
 * When locationId is undefined:
 *   - Returns all menus for the merchant
 */
export async function GetMenus(clerkOrgId: string, locationId?: string | null) {
    if (!clerkOrgId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    // First, get the merchant ID from the clerk_org_id
    const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id')
        .eq('clerk_org_id', clerkOrgId)
        .single()

    if (merchantError || !merchant) {
        console.error('Error getting merchant:', merchantError)
        return []
    }

    // If viewing "all locations" or no location specified
    if (locationId === undefined || locationId === 'all') {
        // Get all menus for the merchant (both global and location-specific)
        const { data, error } = await supabase
            .from('menus')
            .select('*')
            .eq('merchant_id', merchant.id)
            .order('display_order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error getting menus:', error)
            return []
        }
        return data as MenusModel[]
    }

    // If locationId is null, get only global menus
    if (locationId === null) {
        const { data, error } = await supabase
            .from('menus')
            .select('*')
            .eq('merchant_id', merchant.id)
            .is('location_id', null)
            .order('display_order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error getting global menus:', error)
            return []
        }
        return data as MenusModel[]
    }

    // Location-specific view - get global menus with location status
    // First, get the location info
    const { data: location, error: locationError } = await supabase
        .from('locations')
        .select('uses_global_menu')
        .eq('id', locationId)
        .single()

    if (locationError) {
        console.error('Error getting location:', locationError)
        return []
    }

    // Get all global menus for this merchant
    const { data: globalMenus, error: menusError } = await supabase
        .from('menus')
        .select('*')
        .eq('merchant_id', merchant.id)
        .is('location_id', null)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

    if (menusError) {
        console.error('Error getting global menus:', menusError)
        return []
    }

    // Get location_menus records to see which are active at this location
    const { data: locationMenus } = await supabase
        .from('location_menus')
        .select('*')
        .eq('location_id', locationId)

    const locationMenuMap = new Map(
        (locationMenus || []).map(lm => [lm.menu_id, lm])
    )

    // Build result with location status
    // If uses_global_menu is true and no location_menus record exists,
    // the menu is considered active by default (auto-inherit)
    const result: MenuWithLocationStatus[] = globalMenus.map(menu => {
        const locationMenu = locationMenuMap.get(menu.id)

        return {
            ...menu,
            location_menu_id: locationMenu?.id,
            is_active_at_location: locationMenu
                ? locationMenu.is_active
                : location?.uses_global_menu ?? true, // Default to global menu setting
            display_order_at_location: locationMenu?.display_order,
            is_inherited: true, // All global menus are inherited
        }
    })

    // Also get any location-specific menus
    const { data: locationSpecificMenus } = await supabase
        .from('menus')
        .select('*')
        .eq('merchant_id', merchant.id)
        .eq('location_id', locationId)
        .order('display_order', { ascending: true, nullsFirst: false })

    if (locationSpecificMenus?.length) {
        for (const menu of locationSpecificMenus) {
            result.push({
                ...menu,
                is_active_at_location: menu.is_active,
                is_inherited: false, // Location-specific, not inherited
            })
        }
    }

    return result
}

export async function GetMenu(menuId: string) {
    if (!menuId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    // Get menu with categories and items
    const { data: menu, error: menuError } = await supabase
        .from('menus')
        .select(`
            *,
            menu_categories(
                id,
                display_order,
                category:categories(*)
            ),
            menu_item_menus(
                id,
                custom_price,
                custom_cash_price,
                is_available,
                display_order,
                menu_item:menu_items(*)
            ),
            menu_schedules(
                id,
                schedule:schedules(
                    *,
                    schedule_time_slots(*)
                )
            )
        `)
        .eq('id', menuId)
        .single()

    if (menuError || !menu) {
        console.error('Error getting menu:', menuError)
        return null
    }

    return menu
}

/**
 * Get menu with location-specific item pricing overrides
 */
export async function GetMenuWithLocationContext(
    menuId: string,
    locationId?: string | null
) {
    if (!menuId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    // Get menu with categories and items
    const { data: menu, error: menuError } = await supabase
        .from('menus')
        .select(`
            *,
            menu_categories(
                id,
                display_order,
                category:categories(*)
            ),
            menu_item_menus(
                id,
                custom_price,
                custom_cash_price,
                is_available,
                display_order,
                menu_item:menu_items(*)
            ),
            menu_schedules(
                id,
                schedule:schedules(
                    *,
                    schedule_time_slots(*)
                )
            )
        `)
        .eq('id', menuId)
        .single()

    if (menuError || !menu) {
        console.error('Error getting menu:', menuError)
        return null
    }

    // If no location specified, return menu without location context
    if (!locationId || locationId === 'all') {
        // Add effective prices equal to base prices
        const menuItemMenus = (menu.menu_item_menus || []).map((mim: any) => ({
            ...mim,
            effective_price: mim.custom_price ?? mim.menu_item?.price,
            effective_cash_price: mim.custom_cash_price ?? mim.menu_item?.cash_price,
            has_price_override: false,
            global_price: mim.menu_item?.price,
            global_cash_price: mim.menu_item?.cash_price,
        }))

        return {
            ...menu,
            menu_item_menus: menuItemMenus,
            location_context: null,
        }
    }

    // Get location overrides for all items in this menu
    const itemIds = (menu.menu_item_menus || [])
        .map((mim: any) => mim.menu_item?.id)
        .filter(Boolean)

    if (!itemIds.length) {
        return {
            ...menu,
            location_context: { location_id: locationId },
        }
    }

    const { data: overrides } = await supabase
        .from('location_menu_item_overrides')
        .select('*')
        .eq('location_id', locationId)
        .in('menu_item_id', itemIds)

    const overrideMap = new Map(
        (overrides || []).map(o => [o.menu_item_id, o])
    )

    // Apply location overrides to menu items
    const menuItemMenus = (menu.menu_item_menus || []).map((mim: any) => {
        const menuItem = mim.menu_item
        if (!menuItem) return mim

        const override = overrideMap.get(menuItem.id)
        const hasPriceOverride = override && (
            override.custom_price !== null ||
            override.custom_cash_price !== null
        )

        return {
            ...mim,
            effective_price: hasPriceOverride && override.custom_price !== null
                ? override.custom_price
                : mim.custom_price ?? menuItem.price,
            effective_cash_price: hasPriceOverride && override.custom_cash_price !== null
                ? override.custom_cash_price
                : mim.custom_cash_price ?? menuItem.cash_price,
            has_price_override: !!hasPriceOverride,
            location_is_available: override?.is_available ?? menuItem.availability,
            global_price: menuItem.price,
            global_cash_price: menuItem.cash_price,
            location_override: override || null,
        }
    })

    // Check if this menu is active at the location
    const { data: locationMenu } = await supabase
        .from('location_menus')
        .select('*')
        .eq('location_id', locationId)
        .eq('menu_id', menuId)
        .single()

    return {
        ...menu,
        menu_item_menus: menuItemMenus,
        location_context: {
            location_id: locationId,
            location_menu: locationMenu || null,
            is_active_at_location: locationMenu?.is_active ?? true,
        },
    }
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function CreateMenu(
    clerkOrgId: string,
    data: {
        name: string
        description?: string
        location_id?: string | null
        is_active?: boolean
        display_order?: number
    }
) {
    if (!clerkOrgId) {
        return { error: 'Organization ID is required' }
    }

    const supabase = createServerSupabaseClient()

    // Get merchant ID
    const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id')
        .eq('clerk_org_id', clerkOrgId)
        .single()

    if (merchantError || !merchant) {
        console.error('Error getting merchant:', merchantError)
        return { error: 'Merchant not found' }
    }

    // If location_id is provided, verify it belongs to the merchant
    if (data.location_id) {
        const { data: location, error: locationError } = await supabase
            .from('locations')
            .select('id')
            .eq('id', data.location_id)
            .eq('merchant_id', merchant.id)
            .single()

        if (locationError || !location) {
            return { error: 'Location not found or does not belong to merchant' }
        }
    }

    const { data: menu, error } = await supabase
        .from('menus')
        .insert({
            merchant_id: merchant.id,
            name: data.name,
            description: data.description || null,
            location_id: data.location_id || null,
            is_active: data.is_active ?? true,
            display_order: data.display_order || null,
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating menu:', error)
        return { error: error.message }
    }

    // If this is a global menu (no location_id), sync it to all locations
    if (!data.location_id) {
        await SyncMenuToAllLocations(menu.id)
    }

    return { data: menu as MenusModel }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

export async function UpdateMenu(
    menuId: string,
    data: {
        name?: string
        description?: string
        location_id?: string | null
        is_active?: boolean
        display_order?: number
    }
) {
    if (!menuId) {
        return { error: 'Menu ID is required' }
    }

    const supabase = createServerSupabaseClient()

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.location_id !== undefined) updateData.location_id = data.location_id || null
    if (data.is_active !== undefined) updateData.is_active = data.is_active
    if (data.display_order !== undefined) updateData.display_order = data.display_order

    // If location_id is being updated, verify it belongs to the merchant
    if (data.location_id !== undefined && data.location_id) {
        const { data: menu } = await supabase
            .from('menus')
            .select('merchant_id')
            .eq('id', menuId)
            .single()

        if (menu) {
            const { data: location, error: locationError } = await supabase
                .from('locations')
                .select('id')
                .eq('id', data.location_id)
                .eq('merchant_id', menu.merchant_id)
                .single()

            if (locationError || !location) {
                return { error: 'Location not found or does not belong to merchant' }
            }
        }
    }

    const { data: menu, error } = await supabase
        .from('menus')
        .update(updateData)
        .eq('id', menuId)
        .select()
        .single()

    if (error) {
        console.error('Error updating menu:', error)
        return { error: error.message }
    }

    return { data: menu as MenusModel }
}

export async function ToggleMenuActive(menuId: string) {
    if (!menuId) {
        return { error: 'Menu ID is required' }
    }

    const supabase = createServerSupabaseClient()

    // First get current status
    const { data: menu, error: fetchError } = await supabase
        .from('menus')
        .select('is_active')
        .eq('id', menuId)
        .single()

    if (fetchError || !menu) {
        console.error('Error fetching menu:', fetchError)
        return { error: 'Menu not found' }
    }

    // Toggle the status
    const { data: updatedMenu, error } = await supabase
        .from('menus')
        .update({ is_active: !menu.is_active })
        .eq('id', menuId)
        .select()
        .single()

    if (error) {
        console.error('Error toggling menu active status:', error)
        return { error: error.message }
    }

    return { data: updatedMenu as MenusModel }
}

/**
 * Toggle whether a menu is active at a specific location
 * This creates/updates the location_menus record
 */
export async function ToggleMenuActiveAtLocation(
    menuId: string,
    locationId: string
) {
    if (!menuId || !locationId) {
        return { error: 'Menu ID and Location ID are required' }
    }

    const supabase = createServerSupabaseClient()

    // Check if a location_menus record exists
    const { data: existing } = await supabase
        .from('location_menus')
        .select('id, is_active')
        .eq('menu_id', menuId)
        .eq('location_id', locationId)
        .single()

    if (existing) {
        // Toggle existing record
        const { data, error } = await supabase
            .from('location_menus')
            .update({ is_active: !existing.is_active })
            .eq('id', existing.id)
            .select()
            .single()

        if (error) {
            console.error('Error toggling location menu:', error)
            return { error: error.message }
        }

        return { data }
    } else {
        // Create new record with is_active = false (disabling inherited menu)
        const { data, error } = await supabase
            .from('location_menus')
            .insert({
                menu_id: menuId,
                location_id: locationId,
                is_active: false,
            })
            .select()
            .single()

        if (error) {
            console.error('Error creating location menu:', error)
            return { error: error.message }
        }

        return { data }
    }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function DeleteMenu(menuId: string) {
    if (!menuId) {
        return { error: 'Menu ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('menus')
        .delete()
        .eq('id', menuId)

    if (error) {
        console.error('Error deleting menu:', error)
        return { error: error.message }
    }

    return { success: true }
}
