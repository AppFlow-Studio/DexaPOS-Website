'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CategoriesModel } from '@/types/db-modles'

// ============================================================================
// GET OPERATIONS
// ============================================================================

export async function GetCategories(clerkOrgId: string, menuId?: string | null) {
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

    // Build query
    let query = supabase
        .from('categories')
        .select('*')
        .eq('merchant_id', merchant.id)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

    if (menuId === null) {
        // Get merchant-global categories (menu_id is null)
        query = query.is('menu_id', null)
    } else if (menuId) {
        // Get menu-specific categories
        query = query.eq('menu_id', menuId)
    }
    // If menuId is undefined, get all categories

    const { data, error } = await query

    if (error) {
        console.error('Error getting categories:', error)
        return []
    }
    return data as CategoriesModel[]
}

export async function GetCategory(categoryId: string) {
    if (!categoryId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    const { data: category, error } = await supabase
        .from('categories')
        .select(`
            *,
            category_schedules(
                id,
                schedule:schedules(*)
            )
        `)
        .eq('id', categoryId)
        .single()

    if (error || !category) {
        console.error('Error getting category:', error)
        return null
    }

    return category as CategoriesModel & {
        category_schedules?: Array<{
            id: string
            schedule: any
        }>
    }
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function CreateCategory(
    clerkOrgId: string,
    data: {
        name: string
        description?: string
        menu_id?: string | null
        display_order?: number
        image?: string
        is_active?: boolean
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

    // If menu_id is provided, verify it belongs to the merchant
    if (data.menu_id) {
        const { data: menu, error: menuError } = await supabase
            .from('menus')
            .select('id')
            .eq('id', data.menu_id)
            .eq('merchant_id', merchant.id)
            .single()

        if (menuError || !menu) {
            return { error: 'Menu not found or does not belong to merchant' }
        }
    }

    const { data: category, error } = await supabase
        .from('categories')
        .insert({
            merchant_id: merchant.id,
            name: data.name,
            description: data.description || null,
            menu_id: data.menu_id || null,
            display_order: data.display_order || null,
            image: data.image || null,
            is_active: data.is_active ?? true,
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating category:', error)
        return { error: error.message }
    }

    return { data: category as CategoriesModel }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

export async function UpdateCategory(
    categoryId: string,
    data: {
        name?: string
        description?: string
        menu_id?: string | null
        display_order?: number
        image?: string
        is_active?: boolean
    }
) {
    if (!categoryId) {
        return { error: 'Category ID is required' }
    }

    const supabase = createServerSupabaseClient()

    // Build update object
    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.menu_id !== undefined) updateData.menu_id = data.menu_id || null
    if (data.display_order !== undefined) updateData.display_order = data.display_order
    if (data.image !== undefined) updateData.image = data.image
    if (data.is_active !== undefined) updateData.is_active = data.is_active

    // If menu_id is being updated, verify it belongs to the merchant
    if (data.menu_id !== undefined && data.menu_id) {
        const { data: category } = await supabase
            .from('categories')
            .select('merchant_id')
            .eq('id', categoryId)
            .single()

        if (category) {
            const { data: menu, error: menuError } = await supabase
                .from('menus')
                .select('id')
                .eq('id', data.menu_id)
                .eq('merchant_id', category.merchant_id)
                .single()

            if (menuError || !menu) {
                return { error: 'Menu not found or does not belong to merchant' }
            }
        }
    }

    const { data: category, error } = await supabase
        .from('categories')
        .update(updateData)
        .eq('id', categoryId)
        .select()
        .single()

    if (error) {
        console.error('Error updating category:', error)
        return { error: error.message }
    }

    return { data: category as CategoriesModel }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function DeleteCategory(categoryId: string) {
    if (!categoryId) {
        return { error: 'Category ID is required' }
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId)

    if (error) {
        console.error('Error deleting category:', error)
        return { error: error.message }
    }

    return { success: true }
}

// ============================================================================
// ASSIGNMENT OPERATIONS
// ============================================================================

export async function AssignCategoryToMenu(categoryId: string, menuId: string, displayOrder?: number) {
    if (!categoryId || !menuId) {
        return { error: 'Category ID and Menu ID are required' }
    }

    const supabase = createServerSupabaseClient()

    // Check if assignment already exists
    const { data: existing } = await supabase
        .from('menu_categories')
        .select('id')
        .eq('category_id', categoryId)
        .eq('menu_id', menuId)
        .single()

    if (existing) {
        // Update display order if provided
        if (displayOrder !== undefined) {
            const { error } = await supabase
                .from('menu_categories')
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
        .from('menu_categories')
        .insert({
            category_id: categoryId,
            menu_id: menuId,
            display_order: displayOrder || null,
        })
        .select()
        .single()

    if (error) {
        console.error('Error assigning category to menu:', error)
        return { error: error.message }
    }

    return { success: true, data }
}

