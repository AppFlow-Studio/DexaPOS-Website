'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlatformTransaction {
  id: string
  order_id: string
  merchant_name: string
  merchant_id: string
  location_name?: string
  location_id?: string
  customer_name?: string
  order_number?: string
  // Payment fields
  payment_method: string
  card_type?: string
  card_last_four?: string
  authorization_code?: string
  reference_number?: string
  // Amounts
  amount: number
  tip_amount: number
  total_amount: number
  // Status
  status: string          // payment status
  order_status?: string
  // Staff
  staff_name?: string
  // Timestamps
  created_at: string
}

export interface PlatformTransactionFilters {
  search?: string          // customer_name, card_last_four, auth_code, order_number
  merchantIds?: string[]
  locationIds?: string[]
  orderStatuses?: string[]
  paymentStatuses?: string[]
  paymentMethods?: string[]
  cardTypes?: string[]
  minAmount?: number
  maxAmount?: number
  staffId?: string
  dateFrom?: string
  dateTo?: string
}

// ─── Platform Transactions ────────────────────────────────────────────────────

export async function getPlatformTransactions(
  limit: number = 50,
  offset: number = 0,
  filters?: PlatformTransactionFilters
): Promise<{ data: PlatformTransaction[]; total: number }> {
  await assertHQPermission('hq.merchant.transactions')

  const supabase = createServerSupabaseClient()

  // Query from order_payments (primary) → orders → merchants
  // This gives us payment data (method, card, auth) + order/merchant context
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
      card_type,
      card_last_four,
      authorization_code,
      reference_number,
      captured_at,
      initiated_at,
      orders!inner(
        id,
        order_number,
        display_number,
        merchant_id,
        location_id,
        customer_name,
        status,
        payment_status,
        created_at,
        merchants!inner(name),
        locations(name)
      )
    `,
      { count: 'exact' }
    )
    .not('status', 'in', '(pending,failed)')
    .order('captured_at', { ascending: false, nullsFirst: false })

  // ── Filters ──
  // For embedded table columns, use .in('table.column', [...]) — Supabase JS v2 supports
  // dot-notation in all filter methods for embedded/joined table columns.

  // Merchant filter (related table: orders.merchant_id)
  if (filters?.merchantIds && filters.merchantIds.length > 0) {
    query = query.in('orders.merchant_id', filters.merchantIds)
  }

  // Location filter (related table: orders.location_id)
  if (filters?.locationIds && filters.locationIds.length > 0) {
    query = query.in('orders.location_id', filters.locationIds)
  }

  // Payment status filter (primary table: order_payments.status)
  if (filters?.paymentStatuses && filters.paymentStatuses.length > 0) {
    query = query.in('status', filters.paymentStatuses)
  }

  // Order status filter (related table: orders.status)
  if (filters?.orderStatuses && filters.orderStatuses.length > 0) {
    query = query.in('orders.status', filters.orderStatuses)
  }

  // Payment method filter (primary table: order_payments.payment_method)
  if (filters?.paymentMethods && filters.paymentMethods.length > 0) {
    query = query.in('payment_method', filters.paymentMethods)
  }

  // Card type filter (primary table: order_payments.card_type)
  if (filters?.cardTypes && filters.cardTypes.length > 0) {
    query = query.in('card_type', filters.cardTypes)
  }

  // Amount range (primary table: order_payments.total_amount)
  if (filters?.minAmount !== undefined) {
    query = query.gte('total_amount', filters.minAmount)
  }
  if (filters?.maxAmount !== undefined) {
    query = query.lte('total_amount', filters.maxAmount)
  }

  // Date range (primary table: order_payments.captured_at)
  if (filters?.dateFrom) {
    query = query.gte('captured_at', filters.dateFrom)
  }
  if (filters?.dateTo) {
    query = query.lte('captured_at', filters.dateTo)
  }

  // Search across primary table columns only (single .or() — multiple .or() calls get AND'd)
  // Searching related table columns (customer_name, order_number) requires a DB view or RPC
  if (filters?.search && filters.search.trim().length >= 2) {
    const term = filters.search.trim()
    query = query.or(
      `card_last_four.ilike.%${term}%,authorization_code.ilike.%${term}%,reference_number.ilike.%${term}%`
    )
  }

  // Pagination
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getPlatformTransactions] Error:', JSON.stringify(error))
    return { data: [], total: 0 }
  }

  const formattedData: PlatformTransaction[] = (data ?? []).map((payment: any) => ({
    id: payment.id,
    order_id: payment.order_id,
    merchant_name: payment.orders?.merchants?.name || 'Unknown',
    merchant_id: payment.orders?.merchant_id || '',
    location_name: payment.orders?.locations?.name,
    location_id: payment.orders?.location_id,
    customer_name: payment.orders?.customer_name,
    order_number: payment.orders?.order_number || payment.orders?.display_number,
    payment_method: payment.payment_method || 'unknown',
    card_type: payment.card_type,
    card_last_four: payment.card_last_four,
    authorization_code: payment.authorization_code,
    reference_number: payment.reference_number,
    amount: Number(payment.amount || 0),
    tip_amount: Number(payment.tip_amount || 0),
    total_amount: Number(payment.total_amount || 0),
    status: payment.status,
    order_status: payment.orders?.status,
    created_at: payment.captured_at || payment.initiated_at || payment.orders?.created_at,
  }))

  return {
    data: formattedData,
    total: count || 0,
  }
}

// ─── Merchants for filter dropdown ────────────────────────────────────────────

export interface PlatformMerchant {
  id: string
  name: string
}

export async function getPlatformMerchants(): Promise<PlatformMerchant[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('merchants')
    .select('id, name')
    .order('name')

  if (error) {
    console.error('[getPlatformMerchants] Error:', error)
    return []
  }

  return (data ?? []).map((m: any) => ({ id: m.id, name: m.name }))
}

// ─── Locations for filter dropdown ───────────────────────────────────────────

export interface PlatformLocation {
  id: string
  name: string
  merchant_id: string
}

export async function getPlatformLocations(merchantIds?: string[]): Promise<PlatformLocation[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('locations')
    .select('id, name, merchant_id')
    .order('name')

  if (merchantIds && merchantIds.length > 0) {
    query = query.in('merchant_id', merchantIds)
  }

  const { data, error } = await query

  if (error) {
    console.error('[getPlatformLocations] Error:', error)
    return []
  }

  return (data ?? []).map((l: any) => ({ id: l.id, name: l.name, merchant_id: l.merchant_id }))
}
