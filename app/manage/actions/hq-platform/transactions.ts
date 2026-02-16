'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { refundAdminOrder } from '@/app/manage/actions/admin-merchant/transactions'

const USE_PLATFORM_TX_VIEW = process.env.USE_PLATFORM_TX_VIEW === 'true'

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
  subtotal_amount?: number
  tax_amount?: number
  discount_amount?: number
  // Status
  status: string
  order_status?: string
  // Staff
  staff_name?: string
  // Card entry
  entry_mode?: string
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
  sortBy?: 'created_at' | 'order_number' | 'total_amount'
  sortDir?: 'asc' | 'desc'
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
  subtotal_amount?: number | string | null
  tax_amount?: number | string | null
  discount_amount?: number | string | null
  status: string | null
  order_status: string | null
  staff_name?: string | null
  entry_mode?: string | null
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

const CARD_TYPE_EQUIVALENTS: Record<string, string[]> = {
  visa: ['visa'],
  mastercard: ['mastercard', 'master card', 'mc'],
  amex: ['amex', 'american express'],
  discover: ['discover'],
  other: ['other', 'unknown'],
}

function applyCardTypeFilter(query: any, cardTypes?: string[]) {
  if (!cardTypes || cardTypes.length === 0) return query

  const normalized = Array.from(
    new Set(
      cardTypes
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  )

  const tokens = Array.from(
    new Set(normalized.flatMap((value) => CARD_TYPE_EQUIVALENTS[value] ?? [value]))
  )

  if (tokens.length === 0) return query

  const cardTypeOr = tokens
    .map((token) => sanitizeSearchTerm(token))
    .filter(Boolean)
    .map((token) => `card_type.ilike.%${token}%`)
    .join(',')

  if (!cardTypeOr) return query

  return query.or(cardTypeOr)
}

function normalizeSort(
  filters?: PlatformTransactionFilters
): { sortBy: 'created_at' | 'order_number' | 'total_amount'; ascending: boolean } {
  const sortBy = filters?.sortBy ?? 'created_at'
  const sortDir = filters?.sortDir ?? 'desc'
  return { sortBy, ascending: sortDir === 'asc' }
}

function mapViewRowToTransaction(row: PlatformTransactionViewRow): PlatformTransaction {
  const subtotal = row.subtotal_amount !== undefined && row.subtotal_amount !== null
    ? Number(row.subtotal_amount)
    : undefined
  const tax = row.tax_amount !== undefined && row.tax_amount !== null
    ? Number(row.tax_amount)
    : undefined
  const discount = row.discount_amount !== undefined && row.discount_amount !== null
    ? Number(row.discount_amount)
    : undefined

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
    subtotal_amount: subtotal,
    tax_amount: tax,
    discount_amount: discount,
    status: row.status || 'unknown',
    order_status: row.order_status || undefined,
    staff_name: row.staff_name || undefined,
    entry_mode: row.entry_mode || undefined,
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

  if (filters?.staffId) {
    query = query.eq('staff_id', filters.staffId)
  }

  query = applyCardTypeFilter(query, filters?.cardTypes)

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

  query = applyPlatformTransactionFilters(query, filters)
  const { sortBy, ascending } = normalizeSort(filters)
  query = query.order(sortBy, { ascending, nullsFirst: false })
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
      processor_response,
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
        created_by_staff_id,
        customer_name,
        status,
        payment_status,
        subtotal,
        tax_amount,
        discount_amount,
        created_at,
        staff_profiles!orders_created_by_staff_id_fkey(first_name, last_name),
        merchants!inner(name),
        locations(name)
      )
    `,
      { count: 'exact' }
    )
    .not('status', 'in', '(pending,failed)')

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

  if (filters?.staffId) {
    query = query.eq('orders.created_by_staff_id', filters.staffId)
  }

  query = applyCardTypeFilter(query, filters?.cardTypes)

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

  const { sortBy, ascending } = normalizeSort(filters)
  if (sortBy === 'order_number') {
    query = query.order('order_number', { ascending, nullsFirst: false, foreignTable: 'orders' as any })
  } else if (sortBy === 'total_amount') {
    query = query.order('total_amount', { ascending, nullsFirst: false })
  } else {
    query = query.order('captured_at', { ascending, nullsFirst: false })
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getPlatformTransactions:legacy] Error:', error)
    return { data: [], total: 0 }
  }

  const formattedData: PlatformTransaction[] = (data ?? []).map((payment: any) => {
    const processorResponse =
      payment.processor_response && typeof payment.processor_response === 'object'
        ? (payment.processor_response as Record<string, unknown>)
        : null
    const processorEntryCandidates = [
      processorResponse?.entry_type,
      processorResponse?.entryType,
      processorResponse?.entry_mode,
      processorResponse?.entryMode,
    ]
    const processorEntry = processorEntryCandidates.find((value) => typeof value === 'string') as string | undefined
    const staffFirst = payment.orders?.staff_profiles?.first_name || ''
    const staffLast = payment.orders?.staff_profiles?.last_name || ''
    const staffName = `${staffFirst} ${staffLast}`.trim()

    return {
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
      subtotal_amount:
        payment.orders?.subtotal !== null && payment.orders?.subtotal !== undefined
          ? Number(payment.orders.subtotal)
          : undefined,
      tax_amount:
        payment.orders?.tax_amount !== null && payment.orders?.tax_amount !== undefined
          ? Number(payment.orders.tax_amount)
          : undefined,
      discount_amount:
        payment.orders?.discount_amount !== null && payment.orders?.discount_amount !== undefined
          ? Number(payment.orders.discount_amount)
          : undefined,
      status: payment.status,
      order_status: payment.orders?.status,
      staff_name: staffName || undefined,
      entry_mode: processorEntry || undefined,
      created_at: payment.captured_at || payment.initiated_at || payment.orders?.created_at,
    }
  })

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

  // Legacy is the stable default until view parity is guaranteed in every environment.
  if (!USE_PLATFORM_TX_VIEW) {
    return getPlatformTransactionsLegacy(limit, offset, filters)
  }

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

export interface PlatformTransactionStats {
  totalTransactions: number
  capturedTransactions: number
  authorizedTransactions: number
  refundedTransactions: number
  totalRevenue: number
  totalTips: number
  averageTicket: number
}

export async function getPlatformTransactionStats(
  filters?: PlatformTransactionFilters
): Promise<PlatformTransactionStats> {
  await assertHQPermission('hq.merchant.transactions')

  const batchSize = 1000
  let offset = 0
  let source: 'view' | 'legacy' = USE_PLATFORM_TX_VIEW ? 'view' : 'legacy'

  let totalTransactions = 0
  let capturedTransactions = 0
  let authorizedTransactions = 0
  let refundedTransactions = 0
  let totalRevenue = 0
  let totalTips = 0

  while (true) {
    let rows: PlatformTransaction[] = []

    if (source === 'view') {
      const fromView = await getPlatformTransactionsFromView(batchSize, offset, filters)
      if (fromView.errorCode) {
        console.warn(
          `[getPlatformTransactionStats] Falling back to legacy query path due to view error (${fromView.errorCode}).`
        )
        source = 'legacy'
        continue
      }
      rows = fromView.data
    } else {
      const fromLegacy = await getPlatformTransactionsLegacy(batchSize, offset, filters)
      rows = fromLegacy.data
    }

    if (!rows || rows.length === 0) break

    for (const tx of rows) {
      totalTransactions += 1
      totalRevenue += tx.total_amount
      totalTips += tx.tip_amount

      if (tx.status === 'captured') capturedTransactions += 1
      if (tx.status === 'authorized') authorizedTransactions += 1
      if (tx.status === 'refunded' || tx.status === 'partially_refunded') refundedTransactions += 1
    }

    if (rows.length < batchSize) break
    offset += batchSize

    // Safety guard against runaway loops.
    if (offset > 100000) break
  }

  return {
    totalTransactions,
    capturedTransactions,
    authorizedTransactions,
    refundedTransactions,
    totalRevenue,
    totalTips,
    averageTicket: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
  }
}

// Transaction detail drawer

export interface PlatformTransactionLineItem {
  id: string
  item_name: string
  quantity: number
  unit_price: number
  subtotal: number
  special_instructions?: string
}

export interface PlatformTransactionPaidItem {
  id: string
  order_item_id?: string
  item_name?: string
  quantity_paid: number
  unit_price_paid: number
  subtotal_paid: number
  tax_paid: number
}

export interface PlatformTransactionPaymentEvent {
  id: string
  event_type: string
  previous_status?: string
  new_status?: string
  timestamp?: string
  terminal_id?: string
  result_code?: string
  response_message?: string
  raw_response?: Record<string, unknown> | null
}

export interface PlatformTransactionDetails {
  id: string
  order_id: string
  order_number?: string
  display_number?: string
  merchant_id: string
  merchant_name: string
  location_id?: string
  location_name?: string
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  order_type?: string
  order_status?: string
  payment_status?: string
  table_number?: string
  staff_name?: string
  notes?: string
  payment_method: string
  status: string
  amount: number
  tip_amount: number
  total_amount: number
  order_subtotal: number
  order_tax_amount: number
  order_tip_amount: number
  order_discount_amount: number
  order_service_charge: number
  order_total_amount: number
  card_type?: string
  card_last_four?: string
  authorization_code?: string
  reference_number?: string
  transaction_id?: string
  processor_name?: string
  terminal_id?: string
  terminal_type?: string
  device_id?: string
  card_entry_mode?: string
  dejavoo_response_code?: string
  batch_number?: string
  invoice_number?: string
  is_split_payment?: boolean
  split_sequence?: number
  settled_at?: string
  settlement_batch_id?: string
  gateway_fee?: number
  original_amount?: number
  refunded_amount?: number
  refund_reason?: string
  return_amount?: number
  return_reason?: string
  is_voided: boolean
  void_reason?: string
  error_code?: string
  error_message?: string
  created_at: string
  initiated_at?: string
  authorized_at?: string
  approved_at?: string
  captured_at?: string
  refunded_at?: string
  returned_at?: string
  voided_at?: string
  failed_at?: string
  completed_at?: string
  metadata?: Record<string, unknown>
  emv_data?: Record<string, unknown> | null
  processor_response?: Record<string, unknown> | null
  items: PlatformTransactionLineItem[]
  paid_items: PlatformTransactionPaidItem[]
  payment_events: PlatformTransactionPaymentEvent[]
}

export async function getPlatformTransactionDetails(
  transactionId: string
): Promise<PlatformTransactionDetails | null> {
  await assertHQPermission('hq.merchant.transactions')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('order_payments')
    .select(
      `
      *,
      order_payment_items(
        id,
        order_item_id,
        quantity_paid,
        unit_price_paid,
        subtotal_paid,
        tax_paid,
        order_items(
          id,
          item_name
        )
      ),
      orders!inner(
        id,
        order_number,
        display_number,
        merchant_id,
        location_id,
        customer_name,
        customer_phone,
        customer_email,
        order_type,
        status,
        payment_status,
        table_number,
        subtotal,
        tax_amount,
        tip_amount,
        discount_amount,
        service_charge,
        total_amount,
        created_at,
        completed_at,
        special_instructions,
        internal_notes,
        merchants!inner(name),
        locations(name),
        staff_profiles!orders_created_by_staff_id_fkey(first_name, last_name),
        order_items(
          id,
          item_name,
          quantity,
          unit_price,
          subtotal,
          special_instructions
        )
      )
    `
    )
    .eq('id', transactionId)
    .single()

  if (error || !data) {
    console.error('[getPlatformTransactionDetails] Error:', error)
    return null
  }

  const order = (data as any).orders
  if (!order) return null

  const staffFirst = order.staff_profiles?.first_name || ''
  const staffLast = order.staff_profiles?.last_name || ''
  const staffName = `${staffFirst} ${staffLast}`.trim() || undefined
  const processorResponse =
    data.processor_response && typeof data.processor_response === 'object'
      ? (data.processor_response as Record<string, unknown>)
      : null
  const entryFromProcessor = [
    processorResponse?.entry_type,
    processorResponse?.entryType,
    processorResponse?.entry_mode,
    processorResponse?.entryMode,
  ].find((value) => typeof value === 'string') as string | undefined

  let paymentEvents: PlatformTransactionPaymentEvent[] = []
  const { data: eventsData, error: eventsError } = await supabase
    .from('payment_events')
    .select('*')
    .eq('payment_id', transactionId)
    .order('created_at', { ascending: true })

  if (eventsError) {
    // Backward compatibility for environments where payment_events is not provisioned yet.
    if (eventsError.code !== 'PGRST205' && eventsError.code !== '42P01') {
      console.error('[getPlatformTransactionDetails:payment_events] Error:', eventsError)
    }
  } else {
    paymentEvents = (eventsData ?? []).map((event: any, index: number) => {
      const timestamp =
        event.created_at ||
        event.occurred_at ||
        event.event_at ||
        event.timestamp ||
        undefined

      const previousStatus =
        event.previous_status ||
        event.from_status ||
        event.old_status ||
        undefined

      const newStatus =
        event.new_status ||
        event.to_status ||
        event.status ||
        undefined

      const rawResponse = (
        event.raw_response ||
        event.processor_response ||
        event.response_json ||
        event.payload ||
        null
      ) as Record<string, unknown> | null

      const fallbackId = `${transactionId}-${timestamp || 'event'}-${index}`

      return {
        id: event.id || fallbackId,
        event_type: event.event_type || event.type || event.action || 'event',
        previous_status: previousStatus,
        new_status: newStatus,
        timestamp,
        terminal_id: event.terminal_id || event.device_id || undefined,
        result_code: event.result_code || event.response_code || event.code || undefined,
        response_message: event.response_message || event.result_message || event.message || event.error_message || undefined,
        raw_response: rawResponse,
      }
    })
  }

  return {
    id: data.id,
    order_id: data.order_id,
    order_number: order.order_number || undefined,
    display_number: order.display_number || undefined,
    merchant_id: order.merchant_id,
    merchant_name: order.merchants?.name || 'Unknown',
    location_id: order.location_id || undefined,
    location_name: order.locations?.name || undefined,
    customer_name: order.customer_name || undefined,
    customer_phone: order.customer_phone || undefined,
    customer_email: order.customer_email || undefined,
    order_type: order.order_type || undefined,
    order_status: order.status || undefined,
    payment_status: order.payment_status || undefined,
    table_number: order.table_number || undefined,
    staff_name: staffName,
    notes: order.special_instructions || order.internal_notes || undefined,
    payment_method: data.payment_method || 'unknown',
    status: data.status || 'unknown',
    amount: Number(data.amount || 0),
    tip_amount: Number(data.tip_amount || 0),
    total_amount: Number(data.total_amount || 0),
    order_subtotal: Number(order.subtotal || 0),
    order_tax_amount: Number(order.tax_amount || 0),
    order_tip_amount: Number(order.tip_amount || 0),
    order_discount_amount: Number(order.discount_amount || 0),
    order_service_charge: Number(order.service_charge || 0),
    order_total_amount: Number(order.total_amount || 0),
    card_type: data.card_type || undefined,
    card_last_four: data.card_last_four || undefined,
    authorization_code: data.authorization_code || undefined,
    reference_number: data.reference_number || undefined,
    transaction_id: data.transaction_id || undefined,
    processor_name: data.processor_name || undefined,
    terminal_id: data.terminal_id || undefined,
    terminal_type: data.terminal_type || undefined,
    device_id: data.device_id || undefined,
    card_entry_mode: data.card_entry_mode || entryFromProcessor || undefined,
    dejavoo_response_code: data.dejavoo_response_code || data.result_code || undefined,
    batch_number: data.batch_number || data.dejavoo_batch_number || undefined,
    invoice_number: data.invoice_number || data.dejavoo_invoice_number || undefined,
    is_split_payment:
      data.is_split_payment ?? (
        data.split_total !== null &&
        data.split_total !== undefined &&
        Number(data.split_total) > 1
      ? true
      : undefined
      ),
    split_sequence:
      data.split_sequence !== null && data.split_sequence !== undefined
        ? Number(data.split_sequence)
        : data.split_index !== null && data.split_index !== undefined
          ? Number(data.split_index)
          : data.split_portion_index !== null && data.split_portion_index !== undefined
            ? Number(data.split_portion_index)
        : undefined,
    settled_at: data.settled_at || undefined,
    settlement_batch_id: data.settlement_batch_id || undefined,
    gateway_fee: data.gateway_fee !== null ? Number(data.gateway_fee) : undefined,
    original_amount: data.original_amount !== null ? Number(data.original_amount) : undefined,
    refunded_amount: data.refunded_amount !== null ? Number(data.refunded_amount) : undefined,
    refund_reason: data.refund_reason || undefined,
    return_amount: data.return_amount !== null ? Number(data.return_amount) : undefined,
    return_reason: data.return_reason || undefined,
    is_voided: Boolean(data.is_voided),
    void_reason: data.void_reason || undefined,
    error_code: data.error_code || undefined,
    error_message: data.error_message || undefined,
    created_at: data.captured_at || data.initiated_at || order.created_at || new Date(0).toISOString(),
    initiated_at: data.initiated_at || undefined,
    authorized_at: data.authorized_at || undefined,
    approved_at: data.approved_at || undefined,
    captured_at: data.captured_at || undefined,
    refunded_at: data.refunded_at || undefined,
    returned_at: data.returned_at || undefined,
    voided_at: data.voided_at || undefined,
    failed_at: data.failed_at || undefined,
    completed_at: order.completed_at || undefined,
    emv_data: (data.emv_data as Record<string, unknown> | null) || null,
    processor_response: processorResponse,
    metadata: (data.metadata as Record<string, unknown>) || undefined,
    items: (order.order_items || []).map((item: any) => ({
      id: item.id,
      item_name: item.item_name || 'Item',
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      subtotal: Number(item.subtotal || 0),
      special_instructions: item.special_instructions || undefined,
    })),
    paid_items: ((data as any).order_payment_items || []).map((item: any) => ({
      id: item.id,
      order_item_id: item.order_item_id || undefined,
      item_name: item.order_items?.item_name || undefined,
      quantity_paid: Number(item.quantity_paid || 0),
      unit_price_paid: Number(item.unit_price_paid || 0),
      subtotal_paid: Number(item.subtotal_paid || 0),
      tax_paid: Number(item.tax_paid || 0),
    })),
    payment_events: paymentEvents,
  }
}

export async function refundPlatformTransaction(
  transactionId: string,
  reason: string = 'HQ refund from platform transactions'
): Promise<{ success: boolean; error?: string }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('order_payments')
    .select(
      `
      id,
      order_id,
      status,
      orders!inner(
        merchant_id
      )
    `
    )
    .eq('id', transactionId)
    .single()

  if (error || !data) {
    console.error('[refundPlatformTransaction] Lookup error:', error)
    return { success: false, error: 'Transaction not found' }
  }

  if (data.status !== 'captured') {
    return {
      success: false,
      error: `Only captured payments can be refunded (current status: ${data.status})`,
    }
  }

  const merchantId = (data as any).orders?.merchant_id as string | undefined
  if (!merchantId) {
    return { success: false, error: 'Missing merchant context for refund' }
  }

  return refundAdminOrder(merchantId, data.order_id, reason)
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

// Staff for filter dropdown

export interface PlatformStaff {
  id: string
  name: string
  merchant_id?: string
  location_id?: string
}

export async function getPlatformStaff(
  merchantIds?: string[],
  locationIds?: string[]
): Promise<PlatformStaff[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('orders')
    .select(
      `
      created_by_staff_id,
      merchant_id,
      location_id,
      created_at,
      staff_profiles!orders_created_by_staff_id_fkey(
        id,
        first_name,
        last_name
      )
    `
    )
    .not('created_by_staff_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (merchantIds && merchantIds.length > 0) {
    query = query.in('merchant_id', merchantIds)
  }

  if (locationIds && locationIds.length > 0) {
    query = query.in('location_id', locationIds)
  }

  const { data, error } = await query

  if (error) {
    console.error('[getPlatformStaff] Error:', error)
    return []
  }

  const unique = new Map<string, PlatformStaff>()

  for (const row of data ?? []) {
    const profileRaw = (row as any).staff_profiles
    const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
    const staffId = row.created_by_staff_id || profile?.id
    const first = profile?.first_name || ''
    const last = profile?.last_name || ''
    const name = `${first} ${last}`.trim()

    if (!staffId || !name) continue
    if (unique.has(staffId)) continue

    unique.set(staffId, {
      id: staffId,
      name,
      merchant_id: row.merchant_id || undefined,
      location_id: row.location_id || undefined,
    })
  }

  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name))
}
