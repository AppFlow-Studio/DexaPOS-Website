'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Types

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
  status: string
  order_status?: string
  // Staff
  staff_name?: string
  // Timestamps
  created_at: string
}

export interface PlatformTransactionFilters {
  search?: string
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

interface PlatformTransactionViewRow {
  id: string
  order_id: string
  merchant_name: string | null
  merchant_id: string | null
  location_name: string | null
  location_id: string | null
  customer_name: string | null
  order_number: string | null
  payment_method: string | null
  card_type: string | null
  card_last_four: string | null
  authorization_code: string | null
  reference_number: string | null
  amount: number | string | null
  tip_amount: number | string | null
  total_amount: number | string | null
  status: string | null
  order_status: string | null
  created_at: string | null
}

const PLATFORM_TX_SELECT = `
  id,
  order_id,
  merchant_name,
  merchant_id,
  location_name,
  location_id,
  customer_name,
  order_number,
  payment_method,
  card_type,
  card_last_four,
  authorization_code,
  reference_number,
  amount,
  tip_amount,
  total_amount,
  status,
  order_status,
  created_at
`

function sanitizeSearchTerm(term: string): string {
  return term.trim().replace(/[(),]/g, ' ')
}

function mapViewRowToTransaction(row: PlatformTransactionViewRow): PlatformTransaction {
  return {
    id: row.id,
    order_id: row.order_id,
    merchant_name: row.merchant_name || 'Unknown',
    merchant_id: row.merchant_id || '',
    location_name: row.location_name || undefined,
    location_id: row.location_id || undefined,
    customer_name: row.customer_name || undefined,
    order_number: row.order_number || undefined,
    payment_method: row.payment_method || 'unknown',
    card_type: row.card_type || undefined,
    card_last_four: row.card_last_four || undefined,
    authorization_code: row.authorization_code || undefined,
    reference_number: row.reference_number || undefined,
    amount: Number(row.amount || 0),
    tip_amount: Number(row.tip_amount || 0),
    total_amount: Number(row.total_amount || 0),
    status: row.status || 'unknown',
    order_status: row.order_status || undefined,
    created_at: row.created_at || new Date(0).toISOString(),
  }
}

function applyPlatformTransactionFilters(query: any, filters?: PlatformTransactionFilters) {
  if (filters?.merchantIds && filters.merchantIds.length > 0) {
    query = query.in('merchant_id', filters.merchantIds)
  }

  if (filters?.locationIds && filters.locationIds.length > 0) {
    query = query.in('location_id', filters.locationIds)
  }

  if (filters?.paymentStatuses && filters.paymentStatuses.length > 0) {
    query = query.in('status', filters.paymentStatuses)
  }

  if (filters?.orderStatuses && filters.orderStatuses.length > 0) {
    query = query.in('order_status', filters.orderStatuses)
  }

  if (filters?.paymentMethods && filters.paymentMethods.length > 0) {
    query = query.in('payment_method', filters.paymentMethods)
  }

  if (filters?.cardTypes && filters.cardTypes.length > 0) {
    query = query.in('card_type', filters.cardTypes)
  }

  if (filters?.minAmount !== undefined) {
    query = query.gte('total_amount', filters.minAmount)
  }

  if (filters?.maxAmount !== undefined) {
    query = query.lte('total_amount', filters.maxAmount)
  }

  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom)
  }

  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo)
  }

  if (filters?.search && filters.search.trim().length >= 2) {
    const term = sanitizeSearchTerm(filters.search)
    if (term.length >= 2) {
      const columns = [
        'customer_name',
        'order_number',
        'card_last_four',
        'authorization_code',
        'reference_number',
        'merchant_name',
        'location_name',
      ]
      query = query.or(columns.map((column) => `${column}.ilike.%${term}%`).join(','))
    }
  }

  return query
}

async function getPlatformTransactionsFromView(
  limit: number,
  offset: number,
  filters?: PlatformTransactionFilters
): Promise<{ data: PlatformTransaction[]; total: number; errorCode?: string }> {
  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('vw_platform_transactions')
    .select(PLATFORM_TX_SELECT, { count: 'exact' })
    .not('status', 'in', '(pending,failed)')
    .order('created_at', { ascending: false, nullsFirst: false })

  query = applyPlatformTransactionFilters(query, filters)
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getPlatformTransactions:view] Error:', error)
    return { data: [], total: 0, errorCode: error.code }
  }

  return {
    data: ((data ?? []) as PlatformTransactionViewRow[]).map(mapViewRowToTransaction),
    total: count || 0,
  }
}

async function getPlatformTransactionsLegacy(
  limit: number,
  offset: number,
  filters?: PlatformTransactionFilters
): Promise<{ data: PlatformTransaction[]; total: number }> {
  const supabase = createServerSupabaseClient()

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

  if (filters?.merchantIds && filters.merchantIds.length > 0) {
    query = query.in('orders.merchant_id', filters.merchantIds)
  }

  if (filters?.locationIds && filters.locationIds.length > 0) {
    query = query.in('orders.location_id', filters.locationIds)
  }

  if (filters?.paymentStatuses && filters.paymentStatuses.length > 0) {
    query = query.in('status', filters.paymentStatuses)
  }

  if (filters?.orderStatuses && filters.orderStatuses.length > 0) {
    query = query.in('orders.status', filters.orderStatuses)
  }

  if (filters?.paymentMethods && filters.paymentMethods.length > 0) {
    query = query.in('payment_method', filters.paymentMethods)
  }

  if (filters?.cardTypes && filters.cardTypes.length > 0) {
    query = query.in('card_type', filters.cardTypes)
  }

  if (filters?.minAmount !== undefined) {
    query = query.gte('total_amount', filters.minAmount)
  }

  if (filters?.maxAmount !== undefined) {
    query = query.lte('total_amount', filters.maxAmount)
  }

  if (filters?.dateFrom) {
    query = query.gte('captured_at', filters.dateFrom)
  }

  if (filters?.dateTo) {
    query = query.lte('captured_at', filters.dateTo)
  }

  if (filters?.search && filters.search.trim().length >= 2) {
    const term = sanitizeSearchTerm(filters.search)
    query = query.or(
      `card_last_four.ilike.%${term}%,authorization_code.ilike.%${term}%,reference_number.ilike.%${term}%`
    )
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getPlatformTransactions:legacy] Error:', error)
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

// Platform Transactions

export async function getPlatformTransactions(
  limit: number = 50,
  offset: number = 0,
  filters?: PlatformTransactionFilters
): Promise<{ data: PlatformTransaction[]; total: number }> {
  await assertHQPermission('hq.merchant.transactions')

  const fromView = await getPlatformTransactionsFromView(limit, offset, filters)
  if (!fromView.errorCode) {
    return { data: fromView.data, total: fromView.total }
  }

  // Backward compatibility until the DB view exists in all environments.
  console.warn(
    `[getPlatformTransactions] Falling back to legacy query path due to view error (${fromView.errorCode}).`
  )
  return getPlatformTransactionsLegacy(limit, offset, filters)
}

// Merchants for filter dropdown

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

// Locations for filter dropdown

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
