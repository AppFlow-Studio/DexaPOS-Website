'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface OrderPayment {
  id: string
  order_id: string
  payment_method: 'cash' | 'card' | 'credit_card' | 'debit_card' | string
  amount: number
  tip_amount: number
  total_amount: number
  status: 'pending' | 'authorized' | 'captured' | 'failed' | 'voided' | 'refunded' | string
  terminal_type: string | null
  terminal_id: string | null
  device_id: string | null
  transaction_id: string | null
  authorization_code: string | null
  reference_number: string | null
  card_type: string | null
  card_last_four: string | null
  card_exp_month: string | null
  card_exp_year: string | null
  card_token: string | null
  dejavoo_transaction_type: string | null
  dejavoo_response_code: string | null
  dejavoo_response_message: string | null
  dejavoo_batch_number: string | null
  dejavoo_invoice_number: string | null
  dvpaylite_request_id: string | null
  dvpaylite_application_type: string | null
  processor_name: string | null
  processor_response: Record<string, unknown> | null
  gateway_fee: number | null
  cash_discount_applied: boolean
  original_amount: number | null
  refunded_amount: number | null
  refund_reason: string | null
  refunded_at: string | null
  refunded_by: string | null
  parent_payment_id: string | null
  initiated_at: string | null
  authorized_at: string | null
  captured_at: string | null
  failed_at: string | null
  voided_at: string | null
  processed_by_staff_id: string | null
  processed_by_user_id: string | null
  error_code: string | null
  error_message: string | null
  retry_count: number
  metadata: Record<string, unknown>
  amount_tendered: number | null
  change_given: number | null
  is_voided: boolean
  voided_by: string | null
  void_reason: string | null
  subtotal_portion: number | null
  tax_portion: number | null
  discount_portion: number | null
  is_cash_priced: boolean
  covers_items: string[] | null
  split_portion_index: number | null
  split_count: number | null
  auth_code: string | null
  rrn: string | null
  result_code: string | null
  result_message: string | null
  batch_number: string | null
  is_settled: boolean
  settled_at: string | null
  is_returned: boolean
  returned_at: string | null
  returned_by: string | null
  return_reason: string | null
  return_number: string | null
  return_reference_id: string | null
  return_amount: number | null
  return_auth_code: string | null
  return_rrn: string | null
  tip_adjusted_at: string | null
  tip_adjusted_by: string | null
  original_tip_amount: number | null
  split_index: number | null
  split_total: number | null
  terminal_request: Record<string, unknown> | null
  terminal_response: Record<string, unknown> | null
  emv_data: Record<string, unknown> | null
  approved_at: string | null
}

export interface Order {
  id: string
  order_number: string
  display_number: string | null
  external_id: string | null
  merchant_id: string
  location_id: string
  order_type: 'dine_in' | 'takeout' | 'delivery' | 'online' | 'catering' | string
  status: 'draft' | 'pending' | 'in_progress' | 'ready' | 'completed' | 'cancelled' | 'voided' | string
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  table_number: string | null
  seat_number: string | null
  created_by_staff_id: string | null
  created_by_user_id: string | null
  assigned_server_id: string | null
  created_at: string
  updated_at: string
  sent_to_kitchen_at: string | null
  started_preparing_at: string | null
  ready_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  subtotal: number
  tax_amount: number
  tip_amount: number
  discount_amount: number
  service_charge: number
  total_amount: number
  payment_status: 'unpaid' | 'partial' | 'paid' | 'refunded' | string
  amount_paid: number
  amount_due: number
  cash_discount_applied: boolean
  cash_discount_amount: number
  special_instructions: string | null
  internal_notes: string | null
  kitchen_notes: string | null
  cancellation_reason: string | null
  delivery_address: string | null
  estimated_delivery_time: string | null
  delivered_at: string | null
  device_id: string | null
  metadata: Record<string, unknown>
  last_synced_at: string | null
  sync_version: number
  is_offline: boolean
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  card_subtotal: number | null
  card_tax_amount: number | null
  card_total: number | null
  cash_subtotal: number | null
  cash_tax_amount: number | null
  cash_total: number | null
  effective_subtotal: number | null
  effective_tax_amount: number | null
  effective_total: number | null
  payment_pricing_mode: 'card' | 'cash' | string | null
  cash_amount_due: number | null
  customer_id: string | null
  station_id: string | null
  effective_cash_amount_due: number | null
  check_status: 'Open' | 'Closed' | string | null
  session_id: string | null
}

export interface OrderPaymentItem {
  id: string
  order_payment_id: string
  order_item_id: string
  quantity_paid: number
  unit_price_paid: number
  subtotal_paid: number
  created_at: string
  tax_paid: number
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface AdminTransaction {
  id: string
  order_id: string
  order_number: string
  display_number: string | null
  amount: number
  tip_amount: number
  payment_method: string
  status: string
  payment_status: string
  created_at: string
  customer_name: string | null
  location_name: string | null
  staff_name: string | null
}

export interface AdminTransactionFilters {
  status?: string
  paymentMethod?: string
  locationId?: string
  dateFrom?: Date
  dateTo?: Date
}

export interface AdminTransactionsResponse {
  transactions: AdminTransaction[]
  total: number
  page: number
  pageSize: number
}

export interface AdminTransactionSummary {
  totalRevenue: number
  netSales: number
  totalTips: number
  totalRefunds: number
  totalTax: number
  totalDiscounts: number
  cashTotal: number
  cardTotal: number
  otherTotal: number
  transactionCount: number
}

// ============================================================================
// GET ADMIN TRANSACTIONS (Paginated)
// ============================================================================

export async function getAdminTransactions(
  merchantId: string,
  filters: AdminTransactionFilters = {},
  page: number = 1,
  pageSize: number = 20
): Promise<AdminTransactionsResponse> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const offset = (page - 1) * pageSize

  // Query order_payments joined with orders for transaction data
  let query = supabase
    .from('order_payments')
    .select(
      `
      id,
      order_id,
      payment_method,
      amount,
      tip_amount,
      total_amount,
      status,
      captured_at,
      created_at:captured_at,
      orders!inner(
        id,
        order_number,
        display_number,
        merchant_id,
        location_id,
        customer_name,
        payment_status,
        created_at,
        locations(name),
        staff_profiles!orders_created_by_staff_id_fkey(first_name, last_name)
      )
    `,
      { count: 'exact' }
    )
    .eq('orders.merchant_id', merchantId)
    .not('status', 'in', '(pending,failed)')

  // Apply filters
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters.paymentMethod && filters.paymentMethod !== 'all') {
    query = query.eq('payment_method', filters.paymentMethod)
  }

  if (filters.locationId && filters.locationId !== 'all') {
    query = query.eq('orders.location_id', filters.locationId)
  }

  if (filters.dateFrom) {
    query = query.gte('captured_at', filters.dateFrom.toISOString())
  }

  if (filters.dateTo) {
    query = query.lte('captured_at', filters.dateTo.toISOString())
  }

  // Order by most recent
  query = query.order('captured_at', { ascending: false, nullsFirst: false })

  // Pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getAdminTransactions] Error:', error)
    return { transactions: [], total: 0, page, pageSize }
  }

  const transactions: AdminTransaction[] = (data || []).map((payment: any) => ({
    id: payment.id,
    order_id: payment.order_id,
    order_number: payment.orders?.order_number || '',
    display_number: payment.orders?.display_number,
    amount: Number(payment.amount || 0),
    tip_amount: Number(payment.tip_amount || 0),
    payment_method: payment.payment_method || 'unknown',
    status: payment.status,
    payment_status: payment.orders?.payment_status || 'unknown',
    created_at: payment.captured_at || payment.orders?.created_at,
    customer_name: payment.orders?.customer_name,
    location_name: payment.orders?.locations?.name,
    staff_name: payment.orders?.staff_profiles
      ? `${payment.orders.staff_profiles.first_name} ${payment.orders.staff_profiles.last_name}`
      : null,
  }))

  return {
    transactions,
    total: count || 0,
    page,
    pageSize,
  }
}

// ============================================================================
// GET ADMIN TRANSACTION SUMMARY
// ============================================================================

export async function getAdminTransactionSummary(
  merchantId: string,
  dateFrom: Date,
  dateTo: Date,
  locationId?: string | null
): Promise<AdminTransactionSummary> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Query orders for totals (orders table has the aggregated amounts)
  let ordersQuery = supabase
    .from('orders')
    .select(
      'id, total_amount, subtotal, tax_amount, tip_amount, discount_amount, status, payment_status'
    )
    .eq('merchant_id', merchantId)
    .not('status', 'in', '(draft,cancelled)')
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', dateTo.toISOString())

  if (locationId && locationId !== 'all') {
    ordersQuery = ordersQuery.eq('location_id', locationId)
  }

  const { data: orders, error: ordersError } = await ordersQuery

  if (ordersError) {
    console.error('[getAdminTransactionSummary] Orders Error:', ordersError)
    return getEmptyTransactionSummary()
  }

  // Query order_payments for payment method breakdown
  let paymentsQuery = supabase
    .from('order_payments')
    .select(
      `
      payment_method,
      total_amount,
      tip_amount,
      status,
      orders!inner(merchant_id, location_id, created_at)
    `
    )
    .eq('orders.merchant_id', merchantId)
    .eq('status', 'captured')
    .gte('orders.created_at', dateFrom.toISOString())
    .lte('orders.created_at', dateTo.toISOString())

  if (locationId && locationId !== 'all') {
    paymentsQuery = paymentsQuery.eq('orders.location_id', locationId)
  }

  const { data: payments, error: paymentsError } = await paymentsQuery

  if (paymentsError) {
    console.error('[getAdminTransactionSummary] Payments Error:', paymentsError)
  }

  const ordersList = orders || []
  const paymentsList = payments || []

  // Calculate order-based metrics
  const completedOrders = ordersList.filter(
    (o) => o.status === 'completed' || o.status === 'ready' || o.payment_status === 'paid'
  )
  const refundedOrders = ordersList.filter((o) => o.status === 'refunded' || o.payment_status === 'refunded')

  const totalRevenue = completedOrders.reduce(
    (sum, o) => sum + Number(o.total_amount || 0),
    0
  )
  const totalTips = completedOrders.reduce(
    (sum, o) => sum + Number(o.tip_amount || 0),
    0
  )
  const totalTax = completedOrders.reduce(
    (sum, o) => sum + Number(o.tax_amount || 0),
    0
  )
  const totalDiscounts = completedOrders.reduce(
    (sum, o) => sum + Number(o.discount_amount || 0),
    0
  )
  const totalRefunds = refundedOrders.reduce(
    (sum, o) => sum + Number(o.total_amount || 0),
    0
  )
  const netSales = totalRevenue - totalRefunds

  // Calculate payment method breakdown from order_payments
  const cashTotal = paymentsList
    .filter((p: any) => p.payment_method === 'cash')
    .reduce((sum, p: any) => sum + Number(p.total_amount || 0), 0)

  const cardTotal = paymentsList
    .filter((p: any) =>
      p.payment_method === 'card' ||
      p.payment_method === 'credit_card' ||
      p.payment_method === 'debit_card'
    )
    .reduce((sum, p: any) => sum + Number(p.total_amount || 0), 0)

  const otherTotal = paymentsList
    .filter((p: any) =>
      p.payment_method !== 'cash' &&
      p.payment_method !== 'card' &&
      p.payment_method !== 'credit_card' &&
      p.payment_method !== 'debit_card'
    )
    .reduce((sum, p: any) => sum + Number(p.total_amount || 0), 0)

  return {
    totalRevenue,
    netSales,
    totalTips,
    totalRefunds,
    totalTax,
    totalDiscounts,
    cashTotal,
    cardTotal,
    otherTotal,
    transactionCount: completedOrders.length,
  }
}

function getEmptyTransactionSummary(): AdminTransactionSummary {
  return {
    totalRevenue: 0,
    netSales: 0,
    totalTips: 0,
    totalRefunds: 0,
    totalTax: 0,
    totalDiscounts: 0,
    cashTotal: 0,
    cardTotal: 0,
    otherTotal: 0,
    transactionCount: 0,
  }
}

// ============================================================================
// GET ADMIN PAYMENT METHODS BREAKDOWN
// ============================================================================

export interface PaymentMethodBreakdown {
  method: string
  amount: number
  count: number
  percentage: number
}

export async function getAdminPaymentMethodsBreakdown(
  merchantId: string,
  dateFrom: Date,
  dateTo: Date,
  locationId?: string | null
): Promise<PaymentMethodBreakdown[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('order_payments')
    .select(
      `
      payment_method,
      total_amount,
      orders!inner(merchant_id, location_id, created_at, status)
    `
    )
    .eq('orders.merchant_id', merchantId)
    .eq('status', 'captured')
    .in('orders.status', ['completed', 'ready'])
    .gte('orders.created_at', dateFrom.toISOString())
    .lte('orders.created_at', dateTo.toISOString())

  if (locationId && locationId !== 'all') {
    query = query.eq('orders.location_id', locationId)
  }

  const { data: payments, error } = await query

  if (error) {
    console.error('[getAdminPaymentMethodsBreakdown] Error:', error)
    return []
  }

  const paymentsList = payments || []
  const totalAmount = paymentsList.reduce(
    (sum, p: any) => sum + Number(p.total_amount || 0),
    0
  )

  const methodMap = new Map<string, { amount: number; count: number }>()
  paymentsList.forEach((payment: any) => {
    const method = payment.payment_method || 'unknown'
    const amount = Number(payment.total_amount || 0)
    if (methodMap.has(method)) {
      const existing = methodMap.get(method)!
      methodMap.set(method, {
        amount: existing.amount + amount,
        count: existing.count + 1,
      })
    } else {
      methodMap.set(method, { amount, count: 1 })
    }
  })

  return Array.from(methodMap.entries())
    .map(([method, data]) => ({
      method,
      amount: data.amount,
      count: data.count,
      percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}

// ============================================================================
// GET ADMIN DAILY REVENUE
// ============================================================================

export interface DailyRevenue {
  date: string
  revenue: number
  orders: number
  tips: number
}

export async function getAdminDailyRevenue(
  merchantId: string,
  dateFrom: Date,
  dateTo: Date,
  locationId?: string | null
): Promise<DailyRevenue[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('orders')
    .select('created_at, total_amount, tip_amount')
    .eq('merchant_id', merchantId)
    .in('status', ['completed', 'ready'])
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', dateTo.toISOString())

  if (locationId && locationId !== 'all') {
    query = query.eq('location_id', locationId)
  }

  const { data: orders, error } = await query

  if (error) {
    console.error('[getAdminDailyRevenue] Error:', error)
    return []
  }

  const dailyMap = new Map<
    string,
    { revenue: number; orders: number; tips: number }
  >()

  orders?.forEach((order) => {
    const date = new Date(order.created_at).toISOString().split('T')[0]
    const revenue = Number(order.total_amount || 0)
    const tips = Number(order.tip_amount || 0)

    if (dailyMap.has(date)) {
      const existing = dailyMap.get(date)!
      dailyMap.set(date, {
        revenue: existing.revenue + revenue,
        orders: existing.orders + 1,
        tips: existing.tips + tips,
      })
    } else {
      dailyMap.set(date, { revenue, orders: 1, tips })
    }
  })

  return Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      revenue: data.revenue,
      orders: data.orders,
      tips: data.tips,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ============================================================================
// OPERATIONAL ACTIONS (REFUND / VOID)
// ============================================================================

/**
 * Refund an order and its payments
 */
export async function refundAdminOrder(
  merchantId: string,
  orderId: string,
  reason: string = 'Admin Refund'
) {
  await assertHQPermission('hq.merchant.update')
  console.log(`[refundAdminOrder] Refunding order: ${orderId}, reason: ${reason}`)

  const supabase = createServerSupabaseClient()

  // Fetch order details for logging
  const { data: order } = await supabase
    .from('orders')
    .select('order_number, total_amount, location_id')
    .eq('id', orderId)
    .single()

  // 1. Update order status
  const { error: orderError } = await supabase
    .from('orders')
    .update({
      status: 'refunded',
      payment_status: 'refunded',
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .eq('merchant_id', merchantId)

  if (orderError) {
    console.error('[refundAdminOrder] Order update error:', orderError)
    return { success: false, error: orderError.message }
  }

  // 2. Update all captured payments for this order
  const { error: paymentError } = await supabase
    .from('order_payments')
    .update({
      status: 'refunded',
      is_returned: true,
      returned_at: new Date().toISOString(),
      return_reason: reason,
      refunded_at: new Date().toISOString(),
      refund_reason: reason
    } as any)
    .eq('order_id', orderId)
    .eq('status', 'captured')

  if (paymentError) {
    console.error('[refundAdminOrder] Payment update error:', paymentError)
    return { success: false, error: paymentError.message }
  }

  // Audit log
  if (order) {
    await LogAuditEvent({
      merchantId,
      locationId: order.location_id,
      action: `Refunded Order: ${order.order_number}`,
      actionCategory: 'order',
      severity: 'critical',
      resourceType: 'order',
      resourceId: orderId,
      resourceName: order.order_number,
      metadata: {
        amount: order.total_amount,
        reason,
        admin_action: true,
      },
    })
  }

  return { success: true }
}

/**
 * Void an order and its payments
 */
export async function voidAdminOrder(
  merchantId: string,
  orderId: string,
  reason: string = 'Admin Void'
) {
  await assertHQPermission('hq.merchant.update')
  console.log(`[voidAdminOrder] Voiding order: ${orderId}, reason: ${reason}`)

  const supabase = createServerSupabaseClient()

  // Fetch order details for logging
  const { data: order } = await supabase
    .from('orders')
    .select('order_number, total_amount, location_id')
    .eq('id', orderId)
    .single()

  // 1. Update order status
  const { error: orderError } = await supabase
    .from('orders')
    .update({
      status: 'voided',
      payment_status: 'unpaid',
      voided_at: new Date().toISOString(),
      void_reason: reason,
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .eq('merchant_id', merchantId)

  if (orderError) {
    console.error('[voidAdminOrder] Order update error:', orderError)
    return { success: false, error: orderError.message }
  }

  // 2. Update all payments for this order
  const { error: paymentError } = await supabase
    .from('order_payments')
    .update({
      status: 'voided',
      is_voided: true,
      voided_at: new Date().toISOString(),
      void_reason: reason,
    } as any)
    .eq('order_id', orderId)

  if (paymentError) {
    console.error('[voidAdminOrder] Payment update error:', paymentError)
    return { success: false, error: paymentError.message }
  }

  // Audit log
  if (order) {
    await LogAuditEvent({
      merchantId,
      locationId: order.location_id,
      action: `Voided Order: ${order.order_number}`,
      actionCategory: 'order',
      severity: 'critical',
      resourceType: 'order',
      resourceId: orderId,
      resourceName: order.order_number,
      metadata: {
        amount: order.total_amount,
        reason,
        admin_action: true,
      },
    })
  }

  return { success: true }
}

