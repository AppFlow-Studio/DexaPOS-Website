'use server'

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { Order, OrderItem, OrderPayment, OrderItemModifier, OrderResponse } from "@/types/order-management"

export async function GetOrders(clerkOrgId: string, locationId?: string | null): Promise<Order[]> {
    if (!clerkOrgId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    // Get merchant ID from clerk org ID
    const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id')
        .eq('clerk_org_id', clerkOrgId)
        .single()

    if (merchantError || !merchant) {
        console.error('[GetOrders] Error getting merchant:', merchantError)
        return []
    }

    // Build query with location filtering
    let query = supabase
        .from('orders')
        .select(
            `
            *,
            order_items(
            *,
            order_item_modifiers(
                *
            )
            )
            `
        )
        .eq('merchant_id', merchant.id)

    if (locationId && locationId !== 'all') {
        query = query.eq('location_id', locationId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
        console.error('[GetOrders] Error getting orders:', error)
        return []
    }

    return (data as OrderResponse[]) || []
}

export async function GetOrderDetails(orderId: string): Promise<OrderResponse | null> {
    if (!orderId) {
        return null
    }

    const supabase = createServerSupabaseClient()

    try {
        // Get order with related items (including modifiers) and payments
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(
                `
                *,
                order_items(
                    *,
                    order_item_modifiers(*)
                ),
                order_payments(*),
                order_status_history(
                *,
                users(first_name, last_name),
                staff_profiles(first_name, last_name)
                ),
                table_sessions(
                *,
                table_session_events(
                *,
                staff_profiles(first_name, last_name)
                )
                )
                `
            )
            .eq('id', orderId)
            .single()

        if (orderError || !order) {
            console.error('[GetOrderDetails] Error getting order:', orderError)
            return null
        }
        console.log('order', order)

        return order as OrderResponse
    } catch (error) {
        console.error('[GetOrderDetails] Unexpected error:', error)
        return null
    }
}

