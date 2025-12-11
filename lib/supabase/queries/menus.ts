/**
 * Database query utilities for menus
 * These functions provide reusable query patterns for menu-related operations
 */

import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Get menu with all related data (categories, items, schedules)
 */
export async function getMenuWithRelations(menuId: string) {
    const supabase = createServerSupabaseClient()

    // Using category-centric structure - items are now accessed through categories
    const { data, error } = await supabase
        .from('menus')
        .select(`
            *,
            menu_categories(
                id,
                display_order,
                is_active,
                custom_title,
                custom_subtitle,
                custom_image,
                category:categories(
                    *,
                    category_items(
                        id,
                        display_order,
                        custom_price,
                        custom_cash_price,
                        is_available,
                        is_featured,
                        menu_item:menu_items(*)
                    )
                )
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

    if (error) {
        console.error('Error getting menu with relations:', error)
        return null
    }

    return data
}

/**
 * Get all menus for a merchant with basic stats
 */
export async function getMenusWithStats(merchantId: string, locationId?: string | null) {
    const supabase = createServerSupabaseClient()

    // Count items via categories using category_items
    let query = supabase
        .from('menus')
        .select(`
            *,
            menu_categories(
                count,
                category:categories(
                    category_items(count)
                )
            )
        `)
        .eq('merchant_id', merchantId)

    if (locationId === null) {
        query = query.is('location_id', null)
    } else if (locationId) {
        query = query.eq('location_id', locationId)
    }

    const { data, error } = await query
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error getting menus with stats:', error)
        return []
    }

    return data
}

