'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MenuItemsModel } from '@/types/db-modles'
import { UpsertLocationMenuItemOverride, GetLocationMenuItemOverride, OverrideData } from './location-menu-overrides'
import { LocationLibraryItem } from '@/types/menu'
// ============================================================================
// TYPES
// ============================================================================

export interface MenuItemWithLocationContext extends MenuItemsModel {
    // Location override data
    effective_price: number
    effective_cash_price: number | null
    has_price_override: boolean
    has_availability_override: boolean
    location_is_available: boolean
    global_price: number
    global_cash_price: number | null
}

// ============================================================================
// GET OPERATIONS
// ============================================================================

export async function GetMenuItems(clerkOrgId: string, locationId?: string | null) {
    if (!clerkOrgId) {
        return []
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
        return []
    }

    const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting menu items:', error)
        return []
    }

    // If no location specified, return global items
    if (!locationId || locationId === 'all') {
        return data as MenuItemsModel[]
    }

    // Get location overrides
    const { data: overrides } = await supabase
        .from('location_menu_item_overrides')
        .select('*')
        .eq('location_id', locationId)

    const overrideMap = new Map(
        (overrides || []).map(o => [o.menu_item_id, o])
    )

    // Return items with effective prices
    return data.map(item => {
        const override = overrideMap.get(item.id)
        return {
            ...item,
            effective_price: override?.custom_price ?? item.price,
            effective_cash_price: override?.custom_cash_price ?? item.cash_price,
            has_price_override: !!(override?.custom_price !== null || override?.custom_cash_price !== null),
            has_availability_override: override?.is_available !== undefined && override?.is_available !== item.availability,
            location_is_available: override?.is_available ?? item.availability,
            global_price: item.price,
            global_cash_price: item.cash_price,
        } as MenuItemWithLocationContext
    })
}


export async function GetMenuItem(
    itemId: string,
    locationId?: string | null // Optional: Add context if known
) {
    if (!itemId) return null;

    const Location_Id = locationId == 'all' ? null : locationId
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.rpc('get_menu_item_details', {
        p_item_id: itemId,
        p_location_id: Location_Id || null
    });
    console.log('data', data)

    if (error) {
        console.error('Error getting menu item:', error);
        return null;
    }

    if (!data) return null;

    // Use explicit casting to ensure type safety with your updated interfaces
    return data as LocationLibraryItem;
}

/**
 * Get menu item with location-specific pricing and availability context
 */
export async function GetMenuItemWithLocationContext(
    itemId: string,
    locationId?: string | null
) {
    if (!itemId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    // Get menu item with all relations (using new category_items table)
    const { data: item, error } = await supabase
        .from('menu_items')
        .select(`
            *,
            category_items(
                id,
                category_id,
                display_order,
                custom_price,
                custom_cash_price,
                is_available,
                is_featured,
                category:categories(*)
            ),
            menu_item_modifier_groups(
                id,
                display_order,
                modifier_group:modifier_groups(
                    *,
                    modifier_group_items(*)
                )
            )
        `)
        .eq('id', itemId)
        .single()

    if (error || !item) {
        console.error('Error getting menu item:', error)
        return null
    }

    // If no location specified, return item without override context
    if (!locationId || locationId === 'all') {
        return {
            ...item,
            effective_price: item.price,
            effective_cash_price: item.cash_price,
            has_price_override: false,
            has_availability_override: false,
            location_is_available: item.availability,
            global_price: item.price,
            global_cash_price: item.cash_price,
            location_override: null,
        }
    }

    // Get location override
    const override = await GetLocationMenuItemOverride(locationId, itemId)

    const hasPriceOverride = override && (
        override.custom_price !== null ||
        override.custom_cash_price !== null
    )
    const hasAvailabilityOverride = override &&
        override.is_available !== item.availability

    return {
        ...item,
        effective_price: hasPriceOverride && override.custom_price !== null
            ? override.custom_price
            : item.price,
        effective_cash_price: hasPriceOverride && override.custom_cash_price !== null
            ? override.custom_cash_price
            : item.cash_price,
        has_price_override: !!hasPriceOverride,
        has_availability_override: !!hasAvailabilityOverride,
        location_is_available: override?.is_available ?? item.availability,
        global_price: item.price,
        global_cash_price: item.cash_price,
        location_override: override,
    }
}

/**
 * @deprecated Use GetMenuWithCategories from menus.ts instead.
 * Items are now accessed through categories within a menu.
 */
export async function GetMenuItemsByMenu(menuId: string, locationId?: string | null) {
    if (!menuId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    // Get items through category_items via menu_categories junction
    // This replaces the deprecated menu_item_menus table
    const { data, error } = await supabase
        .from('menu_categories')
        .select(`
            id,
            category_id,
            display_order,
            category:categories(
                id,
                name,
                category_items(
                    id,
                    menu_item_id,
                    display_order,
                    custom_price,
                    custom_cash_price,
                    is_available,
                    is_featured,
                    menu_item:menu_items(*)
                )
            )
        `)
        .eq('menu_id', menuId)
        .order('display_order', { ascending: true, nullsFirst: false })

    if (error) {
        console.error('Error getting menu items by menu:', error)
        return []
    }

    // Flatten items from all categories
    const items: Array<MenuItemsModel & {
        category_item_id: string
        category_id: string
        custom_price?: number | null
        custom_cash_price?: number | null
        is_available_in_menu: boolean
        display_order_in_menu?: number
        is_featured?: boolean
    }> = []

    for (const menuCategory of (data || [])) {
        const category = menuCategory.category as unknown as {
            id: string
            name: string
            category_items: Array<{
                id: string
                menu_item_id: string
                display_order: number
                custom_price: number | null
                custom_cash_price: number | null
                is_available: boolean
                is_featured: boolean
                menu_item: MenuItemsModel
            }>
        } | null

        if (!category?.category_items) continue

        for (const categoryItem of category.category_items) {
            if (!categoryItem.menu_item) continue
            items.push({
                ...categoryItem.menu_item,
                category_item_id: categoryItem.id,
                category_id: category.id,
                custom_price: categoryItem.custom_price,
                custom_cash_price: categoryItem.custom_cash_price,
                is_available_in_menu: categoryItem.is_available,
                display_order_in_menu: categoryItem.display_order,
                is_featured: categoryItem.is_featured,
            })
        }
    }

    // If no location specified, return as is
    if (!locationId || locationId === 'all') {
        return items
    }

    // Get location overrides for these items
    const itemIds = items.map(i => i.id).filter(Boolean)
    if (!itemIds.length) return items

    const { data: overrides } = await supabase
        .from('location_menu_item_overrides')
        .select('*')
        .eq('location_id', locationId)
        .in('menu_item_id', itemIds)

    const overrideMap = new Map(
        (overrides || []).map(o => [o.menu_item_id, o])
    )

    // Apply location overrides to items
    return items.map(item => {
        const override = overrideMap.get(item.id)
        const hasPriceOverride = override && (
            override.custom_price !== null ||
            override.custom_cash_price !== null
        )

        return {
            ...item,
            effective_price: hasPriceOverride && override.custom_price !== null
                ? override.custom_price
                : item.price,
            effective_cash_price: hasPriceOverride && override.custom_cash_price !== null
                ? override.custom_cash_price
                : item.cash_price,
            has_price_override: !!hasPriceOverride,
            location_is_available: override?.is_available ?? item.availability,
            global_price: item.price,
            global_cash_price: item.cash_price,
        }
    })
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function CreateMenuItem(
    clerkOrgId: string,
    data: {
        name: string
        description?: string
        price: number
        cash_price?: number
        image?: string
        meal_types?: ("Lunch" | "Dinner" | "Brunch" | "Specials")[]
        allergens?: string[]
        card_bg_color?: string
        availability?: boolean
        stock_tracking_mode?: "in_stock" | "out_of_stock" | "quantity"
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

    const { data: item, error } = await supabase
        .from('menu_items')
        .insert({
            merchant_id: merchant.id,
            name: data.name,
            description: data.description || null,
            price: data.price,
            cash_price: data.cash_price || null,
            image: data.image || null,
            meal_types: data.meal_types || [],
            allergens: data.allergens || [],
            card_bg_color: data.card_bg_color || null,
            availability: data.availability ?? true,
            stock_tracking_mode: data.stock_tracking_mode || null,
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating menu item:', error)
        return { error: error.message }
    }

    return { data: item as MenuItemsModel }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update a menu item - location-aware
 * 
 * If locationId is provided AND data contains price/availability changes:
 *   → Creates/updates location_menu_item_overrides (location-specific)
 * If locationId is null/undefined OR "all":
 *   → Updates the global menu_items table
 */
export async function UpdateMenuItem(
    itemId: string,
    data: {
        name?: string
        description?: string
        price?: number
        cash_price?: number
        image?: string
        meal_types?: ("Lunch" | "Dinner" | "Brunch" | "Specials")[]
        allergens?: string[]
        card_bg_color?: string
        availability?: boolean
        stock_tracking_mode?: "in_stock" | "out_of_stock" | "quantity"
    },
    locationId?: string | null
) {
    if (!itemId) {
        return { error: 'Item ID is required' }
    }

    const supabase = createServerSupabaseClient()

    // Determine if this is a location-scoped update
    const isLocationScoped = locationId && locationId !== 'all'

    // Fields that can be overridden at location level
    const locationOverrideFields = ['price', 'cash_price', 'availability', 'stock_tracking_mode']

    // Check if we have any location-overridable fields in the data
    const hasLocationOverrideData = locationOverrideFields.some(
        field => data[field as keyof typeof data] !== undefined
    )

    // If location-scoped and has overridable data, use location override
    if (isLocationScoped && hasLocationOverrideData) {
        // Prepare override data
        const overrideData: OverrideData = {}

        if (data.price !== undefined) {
            overrideData.custom_price = data.price
        }
        if (data.cash_price !== undefined) {
            overrideData.custom_cash_price = data.cash_price
        }
        if (data.availability !== undefined) {
            overrideData.is_available = data.availability
        }
        if (data.stock_tracking_mode !== undefined) {
            overrideData.stock_tracking_mode = data.stock_tracking_mode as OverrideData['stock_tracking_mode']
        }

        // Update/create location override
        const overrideResult = await UpsertLocationMenuItemOverride(
            locationId,
            itemId,
            overrideData
        )

        if (overrideResult.error) {
            return { error: overrideResult.error }
        }

        // Check if there are any non-location fields to update globally
        const globalFields = ['name', 'description', 'image', 'meal_types', 'allergens', 'card_bg_color']
        const hasGlobalData = globalFields.some(
            field => data[field as keyof typeof data] !== undefined
        )

        // If no global fields, return success with just the override
        if (!hasGlobalData) {
            // Get updated item with context
            const updatedItem = await GetMenuItemWithLocationContext(itemId, locationId)
            return {
                data: updatedItem,
                location_override: overrideResult.data,
            }
        }

        // Continue to update global fields below
    }

    // Build update object with only provided fields (non-location fields for scoped updates)
    const updateData: Record<string, unknown> = {}

    if (!isLocationScoped || !hasLocationOverrideData) {
        // Include all fields for global updates
        if (data.name !== undefined) updateData.name = data.name
        if (data.description !== undefined) updateData.description = data.description
        if (data.price !== undefined) updateData.price = data.price
        if (data.cash_price !== undefined) updateData.cash_price = data.cash_price
        if (data.image !== undefined) updateData.image = data.image
        if (data.meal_types !== undefined) updateData.meal_types = data.meal_types
        if (data.allergens !== undefined) updateData.allergens = data.allergens
        if (data.card_bg_color !== undefined) updateData.card_bg_color = data.card_bg_color
        if (data.availability !== undefined) updateData.availability = data.availability
        if (data.stock_tracking_mode !== undefined) updateData.stock_tracking_mode = data.stock_tracking_mode
    } else {
        // Only include non-overridable fields for location-scoped updates
        if (data.name !== undefined) updateData.name = data.name
        if (data.description !== undefined) updateData.description = data.description
        if (data.image !== undefined) updateData.image = data.image
        if (data.meal_types !== undefined) updateData.meal_types = data.meal_types
        if (data.allergens !== undefined) updateData.allergens = data.allergens
        if (data.card_bg_color !== undefined) updateData.card_bg_color = data.card_bg_color
    }

    // If nothing to update in global table, return early
    if (Object.keys(updateData).length === 0) {
        const item = await GetMenuItemWithLocationContext(itemId, locationId)
        return { data: item }
    }

    const { data: item, error } = await supabase
        .from('menu_items')
        .update(updateData)
        .eq('id', itemId)
        .select()
        .single()

    if (error) {
        console.error('Error updating menu item:', error)
        return { error: error.message }
    }

    // Return with location context if applicable
    if (isLocationScoped) {
        const contextItem = await GetMenuItemWithLocationContext(itemId, locationId)
        return { data: contextItem }
    }

    return { data: item as MenuItemsModel }
}

/**
 * Reset location-specific override to use global values
 */
export async function ResetMenuItemToGlobal(
    itemId: string,
    locationId: string
) {
    if (!itemId || !locationId) {
        return { error: 'Item ID and Location ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('location_menu_item_overrides')
        .delete()
        .eq('location_id', locationId)
        .eq('menu_item_id', itemId)

    if (error) {
        console.error('Error resetting menu item to global:', error)
        return { error: error.message }
    }

    // Return the item with updated context
    const item = await GetMenuItemWithLocationContext(itemId, locationId)
    return { data: item }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function DeleteMenuItem(itemId: string) {
    if (!itemId) {
        return { error: 'Item ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', itemId)

    if (error) {
        console.error('Error deleting menu item:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// ITEMS WITH CATEGORIES
// ============================================================================

export async function GetMenuItemsWithCategories(clerkOrgId: string, locationId?: string | null) {
    if (!clerkOrgId) {
        return []
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
        return []
    }

    const { data, error } = await supabase
        .from('menu_items')
        .select(`
            *,
            category_items(
                id,
                category_id,
                custom_price,
                is_featured,
                category:categories(
                    id,
                    name
                )
            )
        `)
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting menu items with categories:', error)
        return []
    }

    // If no location specified, return global items
    if (!locationId || locationId === 'all') {
        return data as (MenuItemsModel & {
            category_items: Array<{
                id: string
                category_id: string
                custom_price: number | null
                is_featured: boolean
                category: {
                    id: string
                    name: string
                } | null
            }>
        })[]
    }

    // Get location overrides
    const itemIds = data.map(d => d.id)
    const { data: overrides } = await supabase
        .from('location_menu_item_overrides')
        .select('*')
        .eq('location_id', locationId)
        .in('menu_item_id', itemIds)

    const overrideMap = new Map(
        (overrides || []).map(o => [o.menu_item_id, o])
    )

    // Return items with location context
    return data.map(item => {
        const override = overrideMap.get(item.id)
        const hasPriceOverride = override && (
            override.custom_price !== null ||
            override.custom_cash_price !== null
        )

        return {
            ...item,
            effective_price: hasPriceOverride && override.custom_price !== null
                ? override.custom_price
                : item.price,
            effective_cash_price: hasPriceOverride && override.custom_cash_price !== null
                ? override.custom_cash_price
                : item.cash_price,
            has_price_override: !!hasPriceOverride,
            location_is_available: override?.is_available ?? item.availability,
            global_price: item.price,
            global_cash_price: item.cash_price,
        }
    })
}

export async function GetMenuItemsByCategory(categoryId: string) {
    if (!categoryId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    // Use new category_items table
    const { data, error } = await supabase
        .from('category_items')
        .select(`
            id,
            display_order,
            custom_price,
            custom_cash_price,
            is_available,
            is_featured,
            menu_item:menu_items(*)
        `)
        .eq('category_id', categoryId)
        .order('display_order', { ascending: true })

    if (error) {
        console.error('Error getting menu items by category:', error)
        return []
    }

    // Transform to return items with category context
    return data
        .map((item) => {
            const menuItem = item.menu_item as unknown as MenuItemsModel | null
            if (!menuItem) return null
            return {
                ...menuItem,
                category_item_id: item.id,
                category_custom_price: item.custom_price,
                category_custom_cash_price: item.custom_cash_price,
                category_is_available: item.is_available,
                is_featured: item.is_featured,
                display_order: item.display_order,
            }
        })
        .filter((item): item is MenuItemsModel & {
            category_item_id: string
            category_custom_price: number | null
            category_custom_cash_price: number | null
            category_is_available: boolean
            is_featured: boolean
            display_order: number
        } => item !== null)
}


