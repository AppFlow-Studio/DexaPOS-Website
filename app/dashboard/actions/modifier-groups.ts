'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ModifierGroupsModel, ModifierGroupItemsModel } from '@/types/db-modles'

// ============================================================================
// GET OPERATIONS - MODIFIER GROUPS
// ============================================================================

export async function GetModifierGroups(clerkOrgId: string) {
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

    // Get modifier groups with their items and usage count
    const { data, error } = await supabase
        .from('modifier_groups')
        .select(`
            *,
            modifier_group_items(*),
            menu_item_modifier_groups(
                id,
                menu_item:menu_items(id, name, price)
            )
        `)
        .eq('merchant_id', merchant.id)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting modifier groups:', error)
        return []
    }

    return data as (ModifierGroupsModel & {
        modifier_group_items: ModifierGroupItemsModel[]
        menu_item_modifier_groups: Array<{
            id: string
            menu_item: {
                id: string
                name: string
                price: number
            }
        }>
    })[]
}

export async function GetModifierGroup(modifierGroupId: string) {
    if (!modifierGroupId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
        .from('modifier_groups')
        .select(`
            *,
            modifier_group_items(*)
        `)
        .eq('id', modifierGroupId)
        .single()

    if (error || !data) {
        console.error('Error getting modifier group:', error)
        return null
    }

    return data as ModifierGroupsModel & {
        modifier_group_items: ModifierGroupItemsModel[]
    }
}

// ============================================================================
// CREATE OPERATIONS - MODIFIER GROUPS
// ============================================================================

export async function CreateModifierGroup(
    clerkOrgId: string,
    data: {
        name: string
        description?: string
        is_required?: boolean
        min_selections?: number
        max_selections?: number
        display_order?: number
        options?: Array<{
            name: string
            description?: string
            price_modifier: number
            display_order?: number
        }>
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

    // Create modifier group
    const { data: modifierGroup, error: groupError } = await supabase
        .from('modifier_groups')
        .insert({
            merchant_id: merchant.id,
            name: data.name,
            description: data.description || null,
            is_required: data.is_required ?? false,
            min_selections: data.min_selections ?? 0,
            max_selections: data.max_selections || null,
            display_order: data.display_order || null,
        })
        .select()
        .single()

    if (groupError || !modifierGroup) {
        console.error('Error creating modifier group:', groupError)
        return { error: groupError?.message || 'Failed to create modifier group' }
    }

    // Create options if provided
    if (data.options && data.options.length > 0) {
        const options = data.options.map((opt, index) => ({
            modifier_group_id: modifierGroup.id,
            name: opt.name,
            description: opt.description || null,
            price_modifier: opt.price_modifier,
            display_order: opt.display_order ?? index,
            is_active: true,
        }))

        const { error: optionsError } = await supabase
            .from('modifier_group_items')
            .insert(options)

        if (optionsError) {
            console.error('Error creating modifier group options:', optionsError)
            return { error: 'Modifier group created but failed to add options', data: modifierGroup }
        }
    }

    return { data: modifierGroup as ModifierGroupsModel }
}

// ============================================================================
// UPDATE OPERATIONS - MODIFIER GROUPS
// ============================================================================

export async function UpdateModifierGroup(
    modifierGroupId: string,
    data: {
        name?: string
        description?: string
        is_required?: boolean
        min_selections?: number
        max_selections?: number | null
        display_order?: number
    }
) {
    if (!modifierGroupId) {
        return { error: 'Modifier Group ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.is_required !== undefined) updateData.is_required = data.is_required
    if (data.min_selections !== undefined) updateData.min_selections = data.min_selections
    if (data.max_selections !== undefined) updateData.max_selections = data.max_selections
    if (data.display_order !== undefined) updateData.display_order = data.display_order

    const { data: modifierGroup, error } = await supabase
        .from('modifier_groups')
        .update(updateData)
        .eq('id', modifierGroupId)
        .select()
        .single()

    if (error) {
        console.error('Error updating modifier group:', error)
        return { error: error.message }
    }

    return { data: modifierGroup as ModifierGroupsModel }
}

// ============================================================================
// DELETE OPERATIONS - MODIFIER GROUPS
// ============================================================================

export async function DeleteModifierGroup(modifierGroupId: string) {
    if (!modifierGroupId) {
        return { error: 'Modifier Group ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('modifier_groups')
        .delete()
        .eq('id', modifierGroupId)

    if (error) {
        console.error('Error deleting modifier group:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// MODIFIER GROUP ITEMS - CREATE
// ============================================================================

export async function CreateModifierGroupItem(
    modifierGroupId: string,
    data: {
        name: string
        description?: string
        price_modifier: number
        display_order?: number
        is_active?: boolean
    }
) {
    if (!modifierGroupId) {
        return { error: 'Modifier Group ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { data: item, error } = await supabase
        .from('modifier_group_items')
        .insert({
            modifier_group_id: modifierGroupId,
            name: data.name,
            description: data.description || null,
            price_modifier: data.price_modifier,
            display_order: data.display_order || null,
            is_active: data.is_active ?? true,
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating modifier group item:', error)
        return { error: error.message }
    }

    return { data: item as ModifierGroupItemsModel }
}

// ============================================================================
// MODIFIER GROUP ITEMS - UPDATE
// ============================================================================

export async function UpdateModifierGroupItem(
    itemId: string,
    data: {
        name?: string
        description?: string
        price_modifier?: number
        display_order?: number
        is_active?: boolean
    }
) {
    if (!itemId) {
        return { error: 'Item ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.price_modifier !== undefined) updateData.price_modifier = data.price_modifier
    if (data.display_order !== undefined) updateData.display_order = data.display_order
    if (data.is_active !== undefined) updateData.is_active = data.is_active

    const { data: item, error } = await supabase
        .from('modifier_group_items')
        .update(updateData)
        .eq('id', itemId)
        .select()
        .single()

    if (error) {
        console.error('Error updating modifier group item:', error)
        return { error: error.message }
    }

    return { data: item as ModifierGroupItemsModel }
}

// ============================================================================
// MODIFIER GROUP ITEMS - DELETE
// ============================================================================

export async function DeleteModifierGroupItem(itemId: string) {
    if (!itemId) {
        return { error: 'Item ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('modifier_group_items')
        .delete()
        .eq('id', itemId)

    if (error) {
        console.error('Error deleting modifier group item:', error)
        return { error: error.message }
    }

    return { success: true }
}

