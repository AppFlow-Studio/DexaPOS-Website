'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

// ============================================================================
// ITEM-CATEGORY ASSIGNMENTS (Using new category_items table)
// ============================================================================

/**
 * Add an item to a category using the RPC function
 */
export async function AddItemToCategory(
    categoryId: string,
    menuItemId: string,
    displayOrder?: number,
    customPrice?: number,
    isFeatured?: boolean
) {
    if (!menuItemId || !categoryId) {
        return { error: 'Menu Item ID and Category ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase.rpc('add_item_to_category', {
        p_category_id: categoryId,
        p_menu_item_id: menuItemId,
        p_display_order: displayOrder ?? 0,
        p_custom_price: customPrice || null,
        p_is_featured: isFeatured ?? false
    })

    if (error) {
        console.error('Error adding item to category:', error)
        return { error: error.message }
    }

    return { success: true, data }
}

/**
 * Remove an item from a category using the RPC function
 */
export async function RemoveItemFromCategory(categoryId: string, menuItemId: string) {
    if (!menuItemId || !categoryId) {
        return { error: 'Menu Item ID and Category ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase.rpc('remove_item_from_category', {
        p_category_id: categoryId,
        p_menu_item_id: menuItemId
    })

    if (error) {
        console.error('Error removing item from category:', error)
        return { error: error.message }
    }

    return { success: true, data }
}

/**
 * @deprecated Use AddItemToCategory instead
 */
export async function AssignItemToCategory(menuItemId: string, categoryId: string) {
    return AddItemToCategory(categoryId, menuItemId)
}

/**
 * Update category item settings (display order, featured, category price)
 */
export async function UpdateCategoryItem(
    categoryId: string,
    menuItemId: string,
    data: {
        displayOrder?: number
        customPrice?: number | null
        customCashPrice?: number | null
        isFeatured?: boolean
        isAvailable?: boolean
    }
) {
    if (!menuItemId || !categoryId) {
        return { error: 'Menu Item ID and Category ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (data.displayOrder !== undefined) updateData.display_order = data.displayOrder
    if (data.customPrice !== undefined) updateData.custom_price = data.customPrice
    if (data.customCashPrice !== undefined) updateData.custom_cash_price = data.customCashPrice
    if (data.isFeatured !== undefined) updateData.is_featured = data.isFeatured
    if (data.isAvailable !== undefined) updateData.is_available = data.isAvailable

    const { error } = await supabase
        .from('category_items')
        .update(updateData)
        .eq('category_id', categoryId)
        .eq('menu_item_id', menuItemId)

    if (error) {
        console.error('Error updating category item:', error)
        return { error: error.message }
    }

    return { success: true }
}

/**
 * Bulk update category items (for reordering)
 */
export async function UpdateCategoryItemsOrder(
    categoryId: string,
    itemOrders: Array<{ menuItemId: string; displayOrder: number }>
) {
    if (!categoryId || !itemOrders?.length) {
        return { error: 'Category ID and item orders are required' }
    }

    const supabase = createServerSupabaseClient()

    // Update each item's display order
    const updates = itemOrders.map(({ menuItemId, displayOrder }) =>
        supabase
            .from('category_items')
            .update({ display_order: displayOrder, updated_at: new Date().toISOString() })
            .eq('category_id', categoryId)
            .eq('menu_item_id', menuItemId)
    )

    const results = await Promise.all(updates)
    const errors = results.filter(r => r.error)

    if (errors.length > 0) {
        console.error('Error updating category item orders:', errors)
        return { error: 'Failed to update some item orders' }
    }

    return { success: true }
}

// ============================================================================
// CATEGORY-MENU ASSIGNMENTS
// ============================================================================

/**
 * Add a category to a menu using the RPC function
 */
export async function AddCategoryToMenu(
    menuId: string,
    categoryId: string,
    displayOrder?: number,
    customTitle?: string
) {
    if (!categoryId || !menuId) {
        return { error: 'Category ID and Menu ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase.rpc('add_category_to_menu', {
        p_menu_id: menuId,
        p_category_id: categoryId,
        p_display_order: displayOrder ?? 0,
        p_custom_title: customTitle || null
    })

    if (error) {
        console.error('Error adding category to menu:', error)
        return { error: error.message }
    }

    return { success: true, data }
}

/**
 * Remove a category from a menu using the RPC function
 */
export async function RemoveCategoryFromMenu(menuId: string, categoryId: string) {
    if (!categoryId || !menuId) {
        return { error: 'Category ID and Menu ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase.rpc('remove_category_from_menu', {
        p_menu_id: menuId,
        p_category_id: categoryId
    })

    if (error) {
        console.error('Error removing category from menu:', error)
        return { error: error.message }
    }

    return { success: true, data }
}

/**
 * Update menu category settings
 */
export async function UpdateMenuCategory(
    menuId: string,
    categoryId: string,
    data: {
        displayOrder?: number
        isActive?: boolean
        customTitle?: string
        customImage?: string
    }
) {
    if (!categoryId || !menuId) {
        return { error: 'Category ID and Menu ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (data.displayOrder !== undefined) updateData.display_order = data.displayOrder
    if (data.isActive !== undefined) updateData.is_active = data.isActive
    if (data.customTitle !== undefined) updateData.custom_title = data.customTitle
    if (data.customImage !== undefined) updateData.custom_image = data.customImage

    const { error } = await supabase
        .from('menu_categories')
        .update(updateData)
        .eq('menu_id', menuId)
        .eq('category_id', categoryId)

    if (error) {
        console.error('Error updating menu category:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// ITEM-MODIFIER GROUP ASSIGNMENTS
// ============================================================================

export async function AssignModifierToItem(menuItemId: string, modifierGroupId: string, displayOrder?: number) {
    if (!menuItemId || !modifierGroupId) {
        return { error: 'Menu Item ID and Modifier Group ID are required' }
    }

    const supabase = createServerSupabaseClient()

    // Check if assignment already exists
    const { data: existing } = await supabase
        .from('menu_item_modifier_groups')
        .select('id')
        .eq('menu_item_id', menuItemId)
        .eq('modifier_group_id', modifierGroupId)
        .single()

    if (existing) {
        // Update display order if provided
        if (displayOrder !== undefined) {
            const { error } = await supabase
                .from('menu_item_modifier_groups')
                .update({ display_order: displayOrder })
                .eq('id', existing.id)

            if (error) {
                return { error: error.message }
            }
        }
        return { success: true, data: existing }
    }

    // Create new assignment
    const { data, error } = await supabase
        .from('menu_item_modifier_groups')
        .insert({
            menu_item_id: menuItemId,
            modifier_group_id: modifierGroupId,
            display_order: displayOrder || null,
        })
        .select()
        .single()

    if (error) {
        console.error('Error assigning modifier to item:', error)
        return { error: error.message }
    }

    return { success: true, data }
}

export async function RemoveModifierFromItem(menuItemId: string, modifierGroupId: string) {
    if (!menuItemId || !modifierGroupId) {
        return { error: 'Menu Item ID and Modifier Group ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('menu_item_modifier_groups')
        .delete()
        .eq('menu_item_id', menuItemId)
        .eq('modifier_group_id', modifierGroupId)

    if (error) {
        console.error('Error removing modifier from item:', error)
        return { error: error.message }
    }

    return { success: true }
}
