'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

export interface AdminOrderFilters {
  status?: string | string[]
  orderType?: string | string[]
  paymentMethod?: string
  locationId?: string
  search?: string
  dateFrom?: Date
  dateTo?: Date
}

export interface AdminOrder {
  id: string
  order_number: number
  display_number: string | null
  status: string
  order_type: string
  payment_method: string | null
  payment_status: string | null
  subtotal: number
  tax_amount: number
  tip_amount: number
  discount_amount: number
  total_amount: number
  created_at: string
  completed_at: string | null
  location_id: string
  location_name?: string
  staff_id: string | null
  staff_name?: string
  customer_name: string | null
  customer_phone: string | null
  items_count: number
}

export interface AdminOrderDetails extends AdminOrder {
  order_items: Array<{
    id: string
    item_name: string
    quantity: number
    unit_price: number
    subtotal: number
    modifiers?: Array<{
      name: string
      price: number
    }>
    notes?: string
  }>
  payments: Array<{
    id: string
    amount: number
    payment_method: string
    status: string
    created_at: string
  }>
  notes?: string
  table_id?: string
  table_name?: string
}

export interface AdminOrdersResponse {
  orders: AdminOrder[]
  total: number
  page: number
  pageSize: number
}

// ============================================================================
// GET ADMIN ORDERS (Paginated)
// ============================================================================

export async function getAdminOrders(
  merchantId: string,
  filters: AdminOrderFilters = {},
  page: number = 1,
  pageSize: number = 20
): Promise<AdminOrdersResponse> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const offset = (page - 1) * pageSize

  // Build query - note: payment_method is on order_payments, not orders
  let query = supabase
    .from('orders')
    .select(
      `
      id,
      order_number,
      display_number,
      status,
      order_type,
      payment_status,
      subtotal,
      tax_amount,
      tip_amount,
      discount_amount,
      total_amount,
      created_at,
      completed_at,
      location_id,
      created_by_staff_id,
      customer_name,
      customer_phone,
      locations!inner(name),
      order_items(id),
      order_payments(payment_method),
      created_by_staff:staff_profiles!orders_created_by_staff_id_fkey(first_name, last_name, display_name)
    `,
      { count: 'exact' }
    )
    .eq('merchant_id', merchantId)

  // Apply filters
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
    const valid = statuses.filter((s) => s && s !== 'all')
    if (valid.length > 0) {
      query = query.in('status', valid)
    }
  }

  if (filters.orderType) {
    const types = Array.isArray(filters.orderType) ? filters.orderType : [filters.orderType]
    const valid = types.filter((t) => t && t !== 'all')
    if (valid.length > 0) {
      query = query.in('order_type', valid)
    }
  }

  if (filters.paymentMethod && filters.paymentMethod !== 'all') {
    // Filter by payment method from order_payments table
    query = query.eq('order_payments.payment_method', filters.paymentMethod)
  }

  if (filters.locationId && filters.locationId !== 'all') {
    query = query.eq('location_id', filters.locationId)
  }

  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom.toISOString())
  }

  if (filters.dateTo) {
    query = query.lte('created_at', filters.dateTo.toISOString())
  }

  if (filters.search) {
    // Search by order number or customer name
    query = query.or(
      `order_number.eq.${filters.search},customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%`
    )
  }

  // Order by most recent first
  query = query.order('created_at', { ascending: false })

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getAdminOrders] Error:', error)
    return { orders: [], total: 0, page, pageSize }
  }

  const orders: AdminOrder[] = (data || []).map((order: any) => {
    // Derive primary payment method from order_payments
    const payments = order.order_payments || []
    const primaryPaymentMethod = payments.length > 0 ? payments[0].payment_method : null
    const staff = order.created_by_staff
    const staffName = staff
      ? staff.display_name || [staff.first_name, staff.last_name].filter(Boolean).join(' ')
      : undefined

    return {
      id: order.id,
      order_number: order.order_number,
      display_number: order.display_number,
      status: order.status,
      order_type: order.order_type,
      payment_method: primaryPaymentMethod,
      payment_status: order.payment_status,
      subtotal: Number(order.subtotal || 0),
      tax_amount: Number(order.tax_amount || 0),
      tip_amount: Number(order.tip_amount || 0),
      discount_amount: Number(order.discount_amount || 0),
      total_amount: Number(order.total_amount || 0),
      created_at: order.created_at,
      completed_at: order.completed_at,
      location_id: order.location_id,
      location_name: order.locations?.name,
      staff_id: order.created_by_staff_id,
      staff_name: staffName || undefined,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      items_count: order.order_items?.length || 0,
    }
  })

  return {
    orders,
    total: count || 0,
    page,
    pageSize,
  }
}

// ============================================================================
// GET ADMIN ORDER DETAILS
// ============================================================================

export async function getAdminOrderDetails(
  merchantId: string,
  orderId: string
): Promise<AdminOrderDetails | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      `
      *,
      locations(name),
      staff_profiles!orders_created_by_staff_id_fkey(first_name, last_name),
      order_items(
        id,
        item_name,
        quantity,
        unit_price,
        subtotal,
        modifiers:order_item_modifiers(*),
        special_instructions
      ),
      order_payments(
        id,
        amount,
        payment_method,
        status,
        captured_at
      )
    `
    )
    .eq('id', orderId)
    .eq('merchant_id', merchantId)
    .single()

  if (error || !order) {
    console.error('[getAdminOrderDetails] Error:', error)
    return null
  }

  // Derive primary payment method from order_payments
  const payments = order.order_payments || []
  const primaryPaymentMethod = payments.length > 0 ? payments[0].payment_method : null

  // Map payments to expected format
  const mappedPayments = payments.map((p: any) => ({
    id: p.id,
    amount: Number(p.amount || 0),
    payment_method: p.payment_method,
    status: p.status,
    created_at: p.captured_at || order.created_at,
  }))

  return {
    id: order.id,
    order_number: order.order_number,
    display_number: order.display_number,
    status: order.status,
    order_type: order.order_type,
    payment_method: primaryPaymentMethod,
    payment_status: order.payment_status,
    subtotal: Number(order.subtotal || 0),
    tax_amount: Number(order.tax_amount || 0),
    tip_amount: Number(order.tip_amount || 0),
    discount_amount: Number(order.discount_amount || 0),
    total_amount: Number(order.total_amount || 0),
    created_at: order.created_at,
    completed_at: order.completed_at,
    location_id: order.location_id,
    location_name: order.locations?.name,
    staff_id: order.created_by_staff_id,
    staff_name: order.staff_profiles
      ? `${order.staff_profiles.first_name} ${order.staff_profiles.last_name}`
      : undefined,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    items_count: order.order_items?.length || 0,
    order_items: order.order_items || [],
    payments: mappedPayments,
    notes: order.special_instructions || order.internal_notes,
    table_id: order.table_number,
    table_name: order.table_number,
  }
}

// ============================================================================
// GET ADMIN ORDER STATS
// ============================================================================

export interface AdminOrderStats {
  totalOrders: number
  completedOrders: number
  pendingOrders: number
  cancelledOrders: number
  avgOrderValue: number
  totalRevenue: number
}

export async function getAdminOrderStats(
  merchantId: string,
  dateFrom?: Date,
  dateTo?: Date,
  locationId?: string
): Promise<AdminOrderStats> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('orders')
    .select('status, total_amount')
    .eq('merchant_id', merchantId)

  if (locationId && locationId !== 'all') {
    query = query.eq('location_id', locationId)
  }

  if (dateFrom) {
    query = query.gte('created_at', dateFrom.toISOString())
  }

  if (dateTo) {
    query = query.lte('created_at', dateTo.toISOString())
  }

  const { data: orders, error } = await query

  if (error) {
    console.error('[getAdminOrderStats] Error:', error)
    return {
      totalOrders: 0,
      completedOrders: 0,
      pendingOrders: 0,
      cancelledOrders: 0,
      avgOrderValue: 0,
      totalRevenue: 0,
    }
  }

  const ordersList = orders || []
  const totalOrders = ordersList.length
  const completedOrders = ordersList.filter((o) => o.status === 'completed').length
  const pendingOrders = ordersList.filter(
    (o) => o.status === 'pending' || o.status === 'in_progress'
  ).length
  const cancelledOrders = ordersList.filter(
    (o) => o.status === 'cancelled' || o.status === 'void'
  ).length

  const completedOrdersList = ordersList.filter((o) => o.status === 'completed')
  const totalRevenue = completedOrdersList.reduce(
    (sum, o) => sum + Number(o.total_amount || 0),
    0
  )
  const avgOrderValue =
    completedOrdersList.length > 0 ? totalRevenue / completedOrdersList.length : 0

  return {
    totalOrders,
    completedOrders,
    pendingOrders,
    cancelledOrders,
    avgOrderValue,
    totalRevenue,
  }
}

// ============================================================================
// GET RECENT ORDERS (for Overview)
// ============================================================================

export async function getAdminRecentOrders(
  merchantId: string,
  limit: number = 5
): Promise<AdminOrder[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('orders')
    .select(
      `
      id,
      order_number,
      display_number,
      status,
      order_type,
      payment_status,
      subtotal,
      tax_amount,
      tip_amount,
      discount_amount,
      total_amount,
      created_at,
      completed_at,
      location_id,
      created_by_staff_id,
      customer_name,
      customer_phone,
      locations(name),
      order_items(id),
      order_payments(payment_method)
    `
    )
    .eq('merchant_id', merchantId)
    .not('status', 'eq', 'draft')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[getAdminRecentOrders] Error:', error)
    return []
  }

  return (data || []).map((order: any) => {
    // Derive primary payment method from order_payments
    const payments = order.order_payments || []
    const primaryPaymentMethod = payments.length > 0 ? payments[0].payment_method : null

    return {
      id: order.id,
      order_number: order.order_number,
      display_number: order.display_number,
      status: order.status,
      order_type: order.order_type,
      payment_method: primaryPaymentMethod,
      payment_status: order.payment_status,
      subtotal: Number(order.subtotal || 0),
      tax_amount: Number(order.tax_amount || 0),
      tip_amount: Number(order.tip_amount || 0),
      discount_amount: Number(order.discount_amount || 0),
      total_amount: Number(order.total_amount || 0),
      created_at: order.created_at,
      completed_at: order.completed_at,
      location_id: order.location_id,
      location_name: order.locations?.name,
      staff_id: order.created_by_staff_id,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      items_count: order.order_items?.length || 0,
    }
  })
}
