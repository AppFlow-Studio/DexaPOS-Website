'use server'

import { createServerSupabaseClient } from "@/lib/supabase/server"

export interface OrderAnalytics {
    salesToday: number
    salesThisWeek: number
    totalOrders: number
    avgOrderValue: number
    bestSellingItems: Array<{ item_name: string; quantity: number; revenue: number }>
    orderTypeBreakdown: { dine_in: number; takeout: number; delivery: number; online: number; catering: number }
    salesByDate: Array<{ date: string; sales: number; orders: number }>
    previousPeriodSales?: number
}

export interface SalesByDateRange {
    date: string
    sales: number
    orders: number
}

export interface BestSellingItem {
    item_name: string
    quantity: number
    revenue: number
}

export interface OrderTypeBreakdown {
    dine_in: number
    takeout: number
    delivery: number
    online: number
    catering: number
}

export interface OrderStats {
    totalOrders: number
    avgOrderValue: number
    totalSales: number
    completedOrders: number
}

/**
 * Get merchant ID from clerk org ID
 */
async function getMerchantId(clerkOrgId: string) {
    const supabase = createServerSupabaseClient()
    const { data: merchant, error } = await supabase
        .from('merchants')
        .select('id')
        .eq('clerk_org_id', clerkOrgId)
        .single()

    if (error || !merchant) {
        console.error('[OrderAnalytics] Error getting merchant:', error)
        return null
    }

    return merchant.id
}

/**
 * Get order analytics for a date range
 */
export async function GetOrderAnalytics(
    clerkOrgId: string,
    locationId: string | null,
    dateFrom: Date,
    dateTo: Date
): Promise<OrderAnalytics> {
    const merchantId = await getMerchantId(clerkOrgId)
    if (!merchantId) {
        return getEmptyAnalytics()
    }

    const supabase = createServerSupabaseClient()

    // Build base query
    let query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('merchant_id', merchantId)
        .eq('status', 'completed')
        .gte('created_at', dateFrom.toISOString())
        .lte('created_at', dateTo.toISOString())

    if (locationId && locationId !== 'all') {
        query = query.eq('location_id', locationId)
    }

    const { data: orders, error } = await query

    if (error) {
        console.error('[GetOrderAnalytics] Error fetching orders:', error)
        return getEmptyAnalytics()
    }

    const ordersList = orders || []

    // Calculate today's sales
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const salesToday = ordersList
        .filter(o => {
            const orderDate = new Date(o.created_at)
            orderDate.setHours(0, 0, 0, 0)
            return orderDate.getTime() === today.getTime()
        })
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)

    // Calculate this week's sales (last 7 days)
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const salesThisWeek = ordersList
        .filter(o => new Date(o.created_at) >= weekAgo)
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)

    // Total orders
    const totalOrders = ordersList.length

    // Average order value
    const totalSales = ordersList.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0

    // Best selling items
    const itemMap = new Map<string, { quantity: number; revenue: number }>()
    ordersList.forEach(order => {
        if (order.order_items) {
            order.order_items.forEach((item: any) => {
                const itemName = item.item_name || 'Unknown Item'
                const quantity = item.quantity || 0
                const revenue = Number(item.subtotal || 0)

                if (itemMap.has(itemName)) {
                    const existing = itemMap.get(itemName)!
                    itemMap.set(itemName, {
                        quantity: existing.quantity + quantity,
                        revenue: existing.revenue + revenue,
                    })
                } else {
                    itemMap.set(itemName, { quantity, revenue })
                }
            })
        }
    })

    const bestSellingItems = Array.from(itemMap.entries())
        .map(([item_name, data]) => ({
            item_name,
            quantity: data.quantity,
            revenue: data.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)

    // Order type breakdown
    const orderTypeBreakdown = {
        dine_in: 0,
        takeout: 0,
        delivery: 0,
        online: 0,
        catering: 0,
    }

    ordersList.forEach(order => {
        const orderType = order.order_type || 'dine_in'
        if (orderType in orderTypeBreakdown) {
            orderTypeBreakdown[orderType as keyof typeof orderTypeBreakdown]++
        }
    })

    // Sales by date
    const salesByDateMap = new Map<string, { sales: number; orders: number }>()
    ordersList.forEach(order => {
        const date = new Date(order.created_at).toISOString().split('T')[0]
        const amount = Number(order.total_amount || 0)

        if (salesByDateMap.has(date)) {
            const existing = salesByDateMap.get(date)!
            salesByDateMap.set(date, {
                sales: existing.sales + amount,
                orders: existing.orders + 1,
            })
        } else {
            salesByDateMap.set(date, { sales: amount, orders: 1 })
        }
    })

    // Convert to array and sort by date
    const salesByDate = Array.from(salesByDateMap.entries())
        .map(([date, data]) => ({
            date,
            sales: data.sales,
            orders: data.orders,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))

    // Calculate previous period for comparison
    const periodDays = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
    const previousDateFrom = new Date(dateFrom)
    previousDateFrom.setDate(previousDateFrom.getDate() - periodDays)
    const previousDateTo = new Date(dateFrom)

    let previousPeriodQuery = supabase
        .from('orders')
        .select('total_amount')
        .eq('merchant_id', merchantId)
        .eq('status', 'completed')
        .gte('created_at', previousDateFrom.toISOString())
        .lt('created_at', previousDateTo.toISOString())

    if (locationId && locationId !== 'all') {
        previousPeriodQuery = previousPeriodQuery.eq('location_id', locationId)
    }

    const { data: previousOrders } = await previousPeriodQuery
    const previousPeriodSales = previousOrders?.reduce(
        (sum, o) => sum + Number(o.total_amount || 0),
        0
    ) || 0

    return {
        salesToday,
        salesThisWeek,
        totalOrders,
        avgOrderValue,
        bestSellingItems,
        orderTypeBreakdown,
        salesByDate,
        previousPeriodSales,
    }
}

/**
 * Get sales by date range
 */
export async function GetSalesByDateRange(
    clerkOrgId: string,
    locationId: string | null,
    dateFrom: Date,
    dateTo: Date
): Promise<SalesByDateRange[]> {
    const merchantId = await getMerchantId(clerkOrgId)
    if (!merchantId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    let query = supabase
        .from('orders')
        .select('created_at, total_amount')
        .eq('merchant_id', merchantId)
        .eq('status', 'completed')
        .gte('created_at', dateFrom.toISOString())
        .lte('created_at', dateTo.toISOString())

    if (locationId && locationId !== 'all') {
        query = query.eq('location_id', locationId)
    }

    const { data: orders, error } = await query

    if (error) {
        console.error('[GetSalesByDateRange] Error:', error)
        return []
    }

    const salesByDateMap = new Map<string, { sales: number; orders: number }>()
    orders?.forEach(order => {
        const date = new Date(order.created_at).toISOString().split('T')[0]
        const amount = Number(order.total_amount || 0)

        if (salesByDateMap.has(date)) {
            const existing = salesByDateMap.get(date)!
            salesByDateMap.set(date, {
                sales: existing.sales + amount,
                orders: existing.orders + 1,
            })
        } else {
            salesByDateMap.set(date, { sales: amount, orders: 1 })
        }
    })

    return Array.from(salesByDateMap.entries())
        .map(([date, data]) => ({
            date,
            sales: data.sales,
            orders: data.orders,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Get best selling items
 */
export async function GetBestSellingItems(
    clerkOrgId: string,
    locationId: string | null,
    dateFrom: Date,
    dateTo: Date,
    limit: number = 10
): Promise<BestSellingItem[]> {
    const merchantId = await getMerchantId(clerkOrgId)
    if (!merchantId) {
        return []
    }

    const supabase = createServerSupabaseClient()

    let query = supabase
        .from('orders')
        .select('order_items(item_name, quantity, subtotal)')
        .eq('merchant_id', merchantId)
        .eq('status', 'completed')
        .gte('created_at', dateFrom.toISOString())
        .lte('created_at', dateTo.toISOString())

    if (locationId && locationId !== 'all') {
        query = query.eq('location_id', locationId)
    }

    const { data: orders, error } = await query

    if (error) {
        console.error('[GetBestSellingItems] Error:', error)
        return []
    }

    const itemMap = new Map<string, { quantity: number; revenue: number }>()
    orders?.forEach((order: any) => {
        if (order.order_items) {
            order.order_items.forEach((item: any) => {
                const itemName = item.item_name || 'Unknown Item'
                const quantity = item.quantity || 0
                const revenue = Number(item.subtotal || 0)

                if (itemMap.has(itemName)) {
                    const existing = itemMap.get(itemName)!
                    itemMap.set(itemName, {
                        quantity: existing.quantity + quantity,
                        revenue: existing.revenue + revenue,
                    })
                } else {
                    itemMap.set(itemName, { quantity, revenue })
                }
            })
        }
    })

    return Array.from(itemMap.entries())
        .map(([item_name, data]) => ({
            item_name,
            quantity: data.quantity,
            revenue: data.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit)
}

/**
 * Get order type breakdown
 */
export async function GetOrderTypeBreakdown(
    clerkOrgId: string,
    locationId: string | null,
    dateFrom: Date,
    dateTo: Date
): Promise<OrderTypeBreakdown> {
    const merchantId = await getMerchantId(clerkOrgId)
    if (!merchantId) {
        return {
            dine_in: 0,
            takeout: 0,
            delivery: 0,
            online: 0,
            catering: 0,
        }
    }

    const supabase = createServerSupabaseClient()

    let query = supabase
        .from('orders')
        .select('order_type')
        .eq('merchant_id', merchantId)
        .eq('status', 'completed')
        .gte('created_at', dateFrom.toISOString())
        .lte('created_at', dateTo.toISOString())

    if (locationId && locationId !== 'all') {
        query = query.eq('location_id', locationId)
    }

    const { data: orders, error } = await query

    if (error) {
        console.error('[GetOrderTypeBreakdown] Error:', error)
        return {
            dine_in: 0,
            takeout: 0,
            delivery: 0,
            online: 0,
            catering: 0,
        }
    }

    const breakdown: OrderTypeBreakdown = {
        dine_in: 0,
        takeout: 0,
        delivery: 0,
        online: 0,
        catering: 0,
    }

    orders?.forEach((order: any) => {
        const orderType = order.order_type || 'dine_in'
        if (orderType in breakdown) {
            breakdown[orderType as keyof OrderTypeBreakdown]++
        }
    })

    return breakdown
}

/**
 * Get order stats
 */
export async function GetOrderStats(
    clerkOrgId: string,
    locationId: string | null,
    dateFrom: Date,
    dateTo: Date
): Promise<OrderStats> {
    const merchantId = await getMerchantId(clerkOrgId)
    if (!merchantId) {
        return {
            totalOrders: 0,
            avgOrderValue: 0,
            totalSales: 0,
            completedOrders: 0,
        }
    }

    const supabase = createServerSupabaseClient()

    let query = supabase
        .from('orders')
        .select('total_amount, status')
        .eq('merchant_id', merchantId)
        .gte('created_at', dateFrom.toISOString())
        .lte('created_at', dateTo.toISOString())

    if (locationId && locationId !== 'all') {
        query = query.eq('location_id', locationId)
    }

    const { data: orders, error } = await query

    if (error) {
        console.error('[GetOrderStats] Error:', error)
        return {
            totalOrders: 0,
            avgOrderValue: 0,
            totalSales: 0,
            completedOrders: 0,
        }
    }

    const ordersList = orders || []
    const totalOrders = ordersList.length
    const completedOrders = ordersList.filter((o: any) => o.status === 'completed').length
    const totalSales = ordersList
        .filter((o: any) => o.status === 'completed')
        .reduce((sum, o: any) => sum + Number(o.total_amount || 0), 0)
    const avgOrderValue = completedOrders > 0 ? totalSales / completedOrders : 0

    return {
        totalOrders,
        avgOrderValue,
        totalSales,
        completedOrders,
    }
}

/**
 * Helper function to return empty analytics
 */
function getEmptyAnalytics(): OrderAnalytics {
    return {
        salesToday: 0,
        salesThisWeek: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        bestSellingItems: [],
        orderTypeBreakdown: {
            dine_in: 0,
            takeout: 0,
            delivery: 0,
            online: 0,
            catering: 0,
        },
        salesByDate: [],
        previousPeriodSales: 0,
    }
}

