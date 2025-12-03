'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ItemStockModel, MenuItemsModel } from '@/types/db-modles'

// ============================================================================
// GET OPERATIONS
// ============================================================================

export async function GetItemStock(locationId: string, itemId?: string) {
    if (!locationId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    let query = supabase
        .from('item_stock')
        .select('*')
        .eq('location_id', locationId)

    if (itemId) {
        query = query.eq('menu_item_id', itemId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting item stock:', error)
        return []
    }
    return data as ItemStockModel[]
}

export async function GetLowStockItems(locationId: string) {
    if (!locationId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    // Get items where quantity is below reorder_threshold or is 0
    const { data, error } = await supabase
        .from('item_stock')
        .select(`
            *,
            menu_item:menu_items(*)
        `)
        .eq('location_id', locationId)
        .or('quantity.lte.reorder_threshold,quantity.eq.0')
        .order('quantity', { ascending: true })

    if (error) {
        console.error('Error getting low stock items:', error)
        return []
    }

    return data as (ItemStockModel & {
        menu_item: MenuItemsModel
    })[]
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

export async function UpdateItemStock(
    locationId: string,
    itemId: string,
    data: {
        quantity?: number
        reorder_threshold?: number
    }
) {
    if (!locationId || !itemId) {
        return { error: 'Location ID and Item ID are required' }
    }

    const supabase = createServerSupabaseClient()

    // Check if stock record exists
    const { data: existing } = await supabase
        .from('item_stock')
        .select('id')
        .eq('location_id', locationId)
        .eq('menu_item_id', itemId)
        .single()

    const updateData: any = {}
    if (data.quantity !== undefined) updateData.quantity = data.quantity
    if (data.reorder_threshold !== undefined) updateData.reorder_threshold = data.reorder_threshold
    if (data.quantity !== undefined) updateData.last_restocked_at = new Date().toISOString()

    if (existing) {
        // Update existing record
        const { data: stock, error } = await supabase
            .from('item_stock')
            .update(updateData)
            .eq('id', existing.id)
            .select()
            .single()

        if (error) {
            console.error('Error updating item stock:', error)
            return { error: error.message }
        }

        return { data: stock as ItemStockModel }
    } else {
        // Create new record
        const { data: stock, error } = await supabase
            .from('item_stock')
            .insert({
                location_id: locationId,
                menu_item_id: itemId,
                quantity: data.quantity ?? 0,
                reorder_threshold: data.reorder_threshold || null,
                last_restocked_at: data.quantity !== undefined ? new Date().toISOString() : null,
            })
            .select()
            .single()

        if (error) {
            console.error('Error creating item stock:', error)
            return { error: error.message }
        }

        return { data: stock as ItemStockModel }
    }
}

