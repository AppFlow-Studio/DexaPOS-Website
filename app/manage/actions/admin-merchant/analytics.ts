'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

export interface AdminOrderAnalytics {
  salesToday: number
  salesThisWeek: number
  salesThisMonth: number
  totalOrders: number
  avgOrderValue: number
  totalRevenue: number
  tips: number
  refunds: number
  bestSellingItems: Array<{
    item_name: string
    quantity: number
    revenue: number
  }>
  orderTypeBreakdown: {
    dine_in: number
    qr_dine_in: number
    takeout: number
    delivery: number
    online: number
    catering: number
  }
  salesByDate: Array<{ date: string; sales: number; orders: number }>
  previousPeriodSales: number
  growthPercentage: number
}

export interface AdminFinancialKPIs {
  summary: {
    gross_sales: number
    net_sales: number
    discounts_total: number
    refunds_total: number
    tax_total: number
    tip_total: number
    order_count: number
    avg_order_value: number
  }
  payment_methods: Array<{
    method: string
    amount: number
    count: number
  }>
  daily_stats: Array<{
    date: string
    net_sales: number
    order_count: number
  }>
  order_types: Array<{
    type: string
    count: number
    revenue: number
  }>
}

export interface AdminSalesByDate {
  date: string
  sales: number
  orders: number
}

export interface AdminBestSellingItem {
  item_name: string
  quantity: number
  revenue: number
}

// ============================================================================
// ADMIN ORDER ANALYTICS
// ============================================================================

export async function getAdminOrderAnalytics(
  merchantId: string,
  dateFrom: Date,
  dateTo: Date,
  locationId?: string | null
): Promise<AdminOrderAnalytics> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Build base query
  let query = supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('merchant_id', merchantId)
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', dateTo.toISOString())

  if (locationId && locationId !== 'all') {
    query = query.eq('location_id', locationId)
  }

  const { data: orders, error } = await query

  if (error) {
    console.error('[getAdminOrderAnalytics] Error fetching orders:', error)
    return getEmptyAnalytics()
  }

  const ordersList = orders || []

  // Calculate today's sales
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const salesToday = ordersList
    .filter((o) => {
      const orderDate = new Date(o.created_at)
      orderDate.setHours(0, 0, 0, 0)
      return orderDate.getTime() === today.getTime()
    })
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)

  // Calculate this week's sales (last 7 days)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const salesThisWeek = ordersList
    .filter((o) => new Date(o.created_at) >= weekAgo)
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)

  // Calculate this month's sales
  const monthAgo = new Date()
  monthAgo.setDate(monthAgo.getDate() - 30)
  const salesThisMonth = ordersList
    .filter((o) => new Date(o.created_at) >= monthAgo)
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)

  // Total orders and revenue
  const totalOrders = ordersList.length
  const totalRevenue = ordersList.reduce(
    (sum, o) => sum + Number(o.total_amount || 0),
    0
  )
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

  // Tips and refunds
  const tips = ordersList.reduce((sum, o) => sum + Number(o.tip_amount || 0), 0)
  const refunds = ordersList
    .filter((o) => o.status === 'refunded')
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)

  // Best selling items
  const itemMap = new Map<string, { quantity: number; revenue: number }>()
  ordersList.forEach((order) => {
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
    qr_dine_in: 0,
    takeout: 0,
    delivery: 0,
    online: 0,
    catering: 0,
  }

  ordersList.forEach((order) => {
    const orderType = order.order_type || 'dine_in'
    if (orderType in orderTypeBreakdown) {
      orderTypeBreakdown[orderType as keyof typeof orderTypeBreakdown]++
    }
  })

  // Sales by date
  const salesByDateMap = new Map<string, { sales: number; orders: number }>()
  ordersList.forEach((order) => {
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

  const salesByDate = Array.from(salesByDateMap.entries())
    .map(([date, data]) => ({
      date,
      sales: data.sales,
      orders: data.orders,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Calculate previous period for comparison
  const periodDays = Math.ceil(
    (dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)
  )
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
  const previousPeriodSales =
    previousOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0

  // Calculate growth percentage
  const growthPercentage =
    previousPeriodSales > 0
      ? ((totalRevenue - previousPeriodSales) / previousPeriodSales) * 100
      : 0

  return {
    salesToday,
    salesThisWeek,
    salesThisMonth,
    totalOrders,
    avgOrderValue,
    totalRevenue,
    tips,
    refunds,
    bestSellingItems,
    orderTypeBreakdown,
    salesByDate,
    previousPeriodSales,
    growthPercentage,
  }
}

// ============================================================================
// ADMIN FINANCIAL KPIS
// ============================================================================

export async function getAdminFinancialKPIs(
  merchantId: string,
  dateFrom: Date,
  dateTo: Date,
  locationId?: string | null
): Promise<AdminFinancialKPIs | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Try RPC first if available
  const { data: kpis, error: rpcError } = await supabase.rpc('get_financial_kpis', {
    p_merchant_id: merchantId,
    p_location_id: locationId === 'all' ? null : locationId,
    p_start_date: dateFrom.toISOString(),
    p_end_date: dateTo.toISOString(),
  })

  if (!rpcError && kpis) {
    return kpis as AdminFinancialKPIs
  }

  // Fallback to manual calculation
  let query = supabase
    .from('orders')
    .select('*')
    .eq('merchant_id', merchantId)
    .not('status', 'in', '(draft,cancelled)')
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', dateTo.toISOString())

  if (locationId && locationId !== 'all') {
    query = query.eq('location_id', locationId)
  }

  const { data: orders, error } = await query

  if (error) {
    console.error('[getAdminFinancialKPIs] Error:', error)
    return null
  }

  const ordersList = orders || []
  const completedOrders = ordersList.filter((o) => o.status === 'completed')

  const gross_sales = completedOrders.reduce(
    (sum, o) => sum + Number(o.subtotal || 0),
    0
  )
  const discounts_total = completedOrders.reduce(
    (sum, o) => sum + Number(o.discount_amount || 0),
    0
  )
  const refunds_total = ordersList
    .filter((o) => o.status === 'refunded')
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
  const tax_total = completedOrders.reduce(
    (sum, o) => sum + Number(o.tax_amount || 0),
    0
  )
  const tip_total = completedOrders.reduce(
    (sum, o) => sum + Number(o.tip_amount || 0),
    0
  )
  const net_sales = gross_sales - discounts_total - refunds_total
  const order_count = completedOrders.length
  const avg_order_value = order_count > 0 ? net_sales / order_count : 0

  // Payment methods breakdown
  const paymentMap = new Map<string, { amount: number; count: number }>()
  completedOrders.forEach((order) => {
    const method = order.payment_method || 'unknown'
    const amount = Number(order.total_amount || 0)
    if (paymentMap.has(method)) {
      const existing = paymentMap.get(method)!
      paymentMap.set(method, {
        amount: existing.amount + amount,
        count: existing.count + 1,
      })
    } else {
      paymentMap.set(method, { amount, count: 1 })
    }
  })

  const payment_methods = Array.from(paymentMap.entries()).map(
    ([method, data]) => ({
      method,
      amount: data.amount,
      count: data.count,
    })
  )

  // Daily stats
  const dailyMap = new Map<string, { net_sales: number; order_count: number }>()
  completedOrders.forEach((order) => {
    const date = new Date(order.created_at).toISOString().split('T')[0]
    const amount = Number(order.total_amount || 0)
    if (dailyMap.has(date)) {
      const existing = dailyMap.get(date)!
      dailyMap.set(date, {
        net_sales: existing.net_sales + amount,
        order_count: existing.order_count + 1,
      })
    } else {
      dailyMap.set(date, { net_sales: amount, order_count: 1 })
    }
  })

  const daily_stats = Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      net_sales: data.net_sales,
      order_count: data.order_count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Order types
  const typeMap = new Map<string, { count: number; revenue: number }>()
  completedOrders.forEach((order) => {
    const type = order.order_type || 'dine_in'
    const revenue = Number(order.total_amount || 0)
    if (typeMap.has(type)) {
      const existing = typeMap.get(type)!
      typeMap.set(type, {
        count: existing.count + 1,
        revenue: existing.revenue + revenue,
      })
    } else {
      typeMap.set(type, { count: 1, revenue })
    }
  })

  const order_types = Array.from(typeMap.entries()).map(([type, data]) => ({
    type,
    count: data.count,
    revenue: data.revenue,
  }))

  return {
    summary: {
      gross_sales,
      net_sales,
      discounts_total,
      refunds_total,
      tax_total,
      tip_total,
      order_count,
      avg_order_value,
    },
    payment_methods,
    daily_stats,
    order_types,
  }
}

// ============================================================================
// ADMIN SALES BY DATE
// ============================================================================

export async function getAdminSalesByDate(
  merchantId: string,
  dateFrom: Date,
  dateTo: Date,
  locationId?: string | null
): Promise<AdminSalesByDate[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('orders')
    .select('created_at, total_amount')
    .eq('merchant_id', merchantId)
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', dateTo.toISOString())

  if (locationId && locationId !== 'all') {
    query = query.eq('location_id', locationId)
  }

  const { data: orders, error } = await query

  if (error) {
    console.error('[getAdminSalesByDate] Error:', error)
    return []
  }

  const salesByDateMap = new Map<string, { sales: number; orders: number }>()
  orders?.forEach((order) => {
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

// ============================================================================
// ADMIN BEST SELLING ITEMS
// ============================================================================

export async function getAdminBestSellingItems(
  merchantId: string,
  dateFrom: Date,
  dateTo: Date,
  locationId?: string | null,
  limit: number = 10
): Promise<AdminBestSellingItem[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('orders')
    .select('order_items(item_name, quantity, subtotal)')
    .eq('merchant_id', merchantId)
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', dateTo.toISOString())

  if (locationId && locationId !== 'all') {
    query = query.eq('location_id', locationId)
  }

  const { data: orders, error } = await query

  if (error) {
    console.error('[getAdminBestSellingItems] Error:', error)
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

// ============================================================================
// HELPER
// ============================================================================

function getEmptyAnalytics(): AdminOrderAnalytics {
  return {
    salesToday: 0,
    salesThisWeek: 0,
    salesThisMonth: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    totalRevenue: 0,
    tips: 0,
    refunds: 0,
    bestSellingItems: [],
    orderTypeBreakdown: {
      dine_in: 0,
      qr_dine_in: 0,
      takeout: 0,
      delivery: 0,
      online: 0,
      catering: 0,
    },
    salesByDate: [],
    previousPeriodSales: 0,
    growthPercentage: 0,
  }
}
