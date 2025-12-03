'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

// ============================================================================
// ITEM-CATEGORY ASSIGNMENTS
// ============================================================================

export async function AssignItemToCategory(menuItemId: string, categoryId: string) {
    if (!menuItemId || !categoryId) {
        return { error: 'Menu Item ID and Category ID are required' }
    }

    const supabase = createServerSupabaseClient()

    // Check if assignment already exists
    const { data: existing } = await supabase
        .from('menu_item_categories')
        .select('id')
        .eq('menu_item_id', menuItemId)
        .eq('category_id', categoryId)
        .single()

    if (existing) {
        return { success: true, data: existing }
    }

    // Create new assignment
    const { data, error } = await supabase
        .from('menu_item_categories')
        .insert({
            menu_item_id: menuItemId,
            category_id: categoryId,
        })
        .select()
        .single()

    if (error) {
        console.error('Error assigning item to category:', error)
        return { error: error.message }
    }

    return { success: true, data }
}

export async function RemoveItemFromCategory(menuItemId: string, categoryId: string) {
    if (!menuItemId || !categoryId) {
        return { error: 'Menu Item ID and Category ID are required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('menu_item_categories')
        .delete()
        .eq('menu_item_id', menuItemId)
        .eq('category_id', categoryId)

    if (error) {
        console.error('Error removing item from category:', error)
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

