'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MenuItemsModel } from '@/types/db-modles'

// ============================================================================
// GET OPERATIONS
// ============================================================================

export async function GetMenuItems(clerkOrgId: string) {
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
    return data as MenuItemsModel[]
}

export async function GetMenuItem(itemId: string) {
    if (!itemId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    // Get menu item with all relations
    const { data: item, error } = await supabase
        .from('menu_items')
        .select(`
            *,
            menu_item_categories(
                id,
                category:categories(*)
            ),
            menu_item_menus(
                id,
                menu_id,
                custom_price,
                custom_cash_price,
                is_available,
                display_order,
                menu:menus(*)
            ),
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
                recipe:recipes(*)
            )
        `)
        .eq('id', itemId)
        .single()

    if (error || !item) {
        console.error('Error getting menu item:', error)
        return null
    }

    return item
}

export async function GetMenuItemsByMenu(menuId: string) {
    if (!menuId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    // Get items through menu_item_menus junction table
    const { data, error } = await supabase
        .from('menu_item_menus')
        .select(`
            id,
            custom_price,
            custom_cash_price,
            is_available,
            display_order,
            menu_item:menu_items(*)
        `)
        .eq('menu_id', menuId)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting menu items by menu:', error)
        return []
    }

    // Transform to return items with menu-specific pricing
    return data.map((item: any) => ({
        ...item.menu_item,
        menu_item_menu_id: item.id,
        custom_price: item.custom_price,
        custom_cash_price: item.custom_cash_price,
        is_available_in_menu: item.is_available,
        display_order_in_menu: item.display_order,
    })) as (MenuItemsModel & {
        menu_item_menu_id: string
        custom_price?: number
        custom_cash_price?: number
        is_available_in_menu: boolean
        display_order_in_menu?: number
    })[]
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
    }
) {
    console.log(data)
    if (!itemId) {
        return { error: 'Item ID is required' }
    }

    const supabase = createServerSupabaseClient()

    // Build update object with only provided fields
    const updateData: any = {}
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

    return { data: item as MenuItemsModel }
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

export async function GetMenuItemsWithCategories(clerkOrgId: string) {
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
            menu_item_categories(
                id,
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

    return data as (MenuItemsModel & {
        menu_item_categories: Array<{
            id: string
            category: {
                id: string
                name: string
            } | null
        }>
    })[]
}

export async function GetMenuItemsByCategory(categoryId: string) {
    if (!categoryId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('menu_item_categories')
        .select(`
            id,
            menu_item:menu_items(*)
        `)
        .eq('category_id', categoryId)

    if (error) {
        console.error('Error getting menu items by category:', error)
        return []
    }

    // Transform to return just the items
    return data
        .map((item: any) => item.menu_item)
        .filter(Boolean) as MenuItemsModel[]
}

