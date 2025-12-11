/**
 * Database query utilities for menu items
 * These functions provide reusable query patterns for menu item operations
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Get menu item with all relations (categories, sizes, addons, modifiers, recipes, stock)
 */
export async function getMenuItemWithRelations(itemId: string) {
    const supabase = createServerSupabaseClient()

    // Using category_items instead of deprecated menu_item_categories and menu_item_menus
    const { data, error } = await supabase
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
            menu_item_sizes:item_sizes!item_sizes_menu_item_id_fkey(*),
            menu_item_addons:item_addons!item_addons_menu_item_id_fkey(*),
            menu_item_modifier_groups(
                id,
                display_order,
                modifier_group:modifier_groups(
                    *,
                    modifier_group_items(*)
                )
            ),
            menu_item_discounts(
                id,
                discount:discounts(*)
            ),
            menu_item_recipes(
                id,
                quantity_multiplier,
                recipe:recipes(
                    *,
                    recipe_items(*)
                )
            )
        `)
        .eq('id', itemId)
        .single()

    if (error) {
        console.error('Error getting menu item with relations:', error)
        return null
    }

    return data
}

/**
 * Get menu items for a merchant with basic info
 */
export async function getMenuItemsForMerchant(merchantId: string) {
    const supabase = createServerSupabaseClient()

    // Using category_items instead of deprecated menu_item_categories
    const { data, error } = await supabase
        .from('menu_items')
        .select(`
            *,
            category_items(
                category:categories(name)
            )
        `)
        .eq('merchant_id', merchantId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting menu items for merchant:', error)
        return []
    }

    return data
}

