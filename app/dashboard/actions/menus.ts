'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MenusModel, CategoriesModel, MenuItemsModel } from '@/types/db-modles'

// ============================================================================
// GET OPERATIONS
// ============================================================================

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

    // Build query - if locationId is provided, filter by it; if null, get merchant-level menus
    let query = supabase
        .from('menus')
        .select('*')
        .eq('merchant_id', merchant.id)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

    if (locationId === null) {
        // Get merchant-level menus (location_id is null)
        query = query.is('location_id', null)
    } else if (locationId) {
        // Get location-specific menus
        query = query.eq('location_id', locationId)
    }
    // If locationId is undefined, get all menus for the merchant

    const { data, error } = await query

    if (error) {
        console.error('Error getting menus:', error)
        return []
    }
    return data as MenusModel[]
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
    const updateData: any = {}
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

