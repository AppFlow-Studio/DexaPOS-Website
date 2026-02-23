'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { refundAdminOrder } from '@/app/manage/actions/admin-merchant/transactions'
import { headers } from 'next/headers'
import type {
  PlatformChargebackStatus,
  PlatformPaymentAuditActionType,
} from './transactions-shared'

const USE_PLATFORM_TX_VIEW = process.env.USE_PLATFORM_TX_VIEW === 'true'
const DEFAULT_AUDIT_REQUEST_PATH = '/manage/transactions'
const AUDIT_LOG_FIELDS_TRANSACTION_LIST = ['card_last_four', 'auth_code'] as const
const AUDIT_LOG_FIELDS_TRANSACTION_DETAIL = ['card_last_four', 'auth_code', 'emv_data'] as const
const CARD_LAST_FOUR_SEARCH_REGEX = /^\d{4}$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let hasLoggedMissingPaymentAuditFunction = false

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

interface PlatformTransactionExportRpcRow {
  payment_id: string
  order_id: string
  order_number: string | null
  display_number: string | null
  created_at: string | null
  merchant_id: string | null
  merchant_name: string | null
  location_id: string | null
  location_name: string | null
  customer_name: string | null
  order_type: string | null
  order_status: string | null
  payment_method: string | null
  card_type: string | null
  card_last_four: string | null
  entry_mode: string | null
  authorization_code: string | null
  reference_number: string | null
  batch_number: string | null
  subtotal_amount: number | string | null
  tax_amount: number | string | null
  tip_amount: number | string | null
  discount_amount: number | string | null
  service_charge_amount: number | string | null
  total_amount: number | string | null
  amount_tendered: number | string | null
  change_given: number | string | null
  payment_status: string | null
  is_voided: boolean | number | string | null
  void_reason: string | null
  is_returned: boolean | number | string | null
  return_amount: number | string | null
  return_reason: string | null
  staff_name: string | null
  terminal_serial: string | null
  device_id: string | null
  total_count: number | string | null
}

export interface PlatformTransactionExportRow {
  payment_id: string
  order_id: string
  order_number?: string
  display_number?: string
  created_at: string
  merchant_id?: string
  merchant_name?: string
  location_id?: string
  location_name?: string
  customer_name?: string
  order_type?: string
  order_status?: string
  payment_method?: string
  card_type?: string
  card_last_four?: string
  entry_mode?: string
  authorization_code?: string
  reference_number?: string
  batch_number?: string
  subtotal_amount: number
  tax_amount: number
  tip_amount: number
  discount_amount: number
  service_charge_amount: number
  total_amount: number
  amount_tendered: number
  change_given: number
  payment_status?: string
  is_voided: boolean
  void_reason?: string
  is_returned: boolean
  return_amount: number
  return_reason?: string
  staff_name?: string
  terminal_serial?: string
  device_id?: string
}

export interface PlatformTransactionExportResult {
  rows: PlatformTransactionExportRow[]
  total: number
  cap: number
  capped: boolean
  errorCode?: string
}

interface PlatformTransactionSummaryRpcRow {
  current_period_from: string | null
  current_period_to: string | null
  previous_period_from: string | null
  previous_period_to: string | null
  current_total_transactions: number | string | null
  previous_total_transactions: number | string | null
  current_card_revenue: number | string | null
  previous_card_revenue: number | string | null
  current_card_count: number | string | null
  previous_card_count: number | string | null
  current_cash_revenue: number | string | null
  previous_cash_revenue: number | string | null
  current_cash_count: number | string | null
  previous_cash_count: number | string | null
  current_total_revenue: number | string | null
  previous_total_revenue: number | string | null
  current_avg_tip: number | string | null
  previous_avg_tip: number | string | null
  current_avg_tip_pct: number | string | null
  previous_avg_tip_pct: number | string | null
  current_void_return_count: number | string | null
  previous_void_return_count: number | string | null
  current_void_return_amount: number | string | null
  previous_void_return_amount: number | string | null
  current_void_rate_pct: number | string | null
  previous_void_rate_pct: number | string | null
}

export interface PlatformTransactionSummary {
  currentPeriodFrom?: string
  currentPeriodTo?: string
  previousPeriodFrom?: string
  previousPeriodTo?: string
  current: {
    totalTransactions: number
    cardRevenue: number
    cardCount: number
    cashRevenue: number
    cashCount: number
    totalRevenue: number
    avgTip: number
    avgTipPct: number
    voidReturnCount: number
    voidReturnAmount: number
    voidRatePct: number
  }
  previous: {
    totalTransactions: number
    cardRevenue: number
    cardCount: number
    cashRevenue: number
    cashCount: number
    totalRevenue: number
    avgTip: number
    avgTipPct: number
    voidReturnCount: number
    voidReturnAmount: number
    voidRatePct: number
  }
}

export interface PlatformSettlementBatchFilters {
  merchantIds?: string[]
  statuses?: string[]
  dateFrom?: string
  dateTo?: string
  limit?: number
}

interface PlatformSettlementBatchRpcRow {
  id: string
  batch_id: string | null
  merchant_id: string | null
  merchant_name: string | null
  location_id: string | null
  location_name: string | null
  business_date: string | null
  opened_at: string | null
  closed_at: string | null
  settlement_date: string | null
  funded_date: string | null
  transaction_count: number | string | null
  sales_count: number | string | null
  refund_count: number | string | null
  void_count: number | string | null
  gross_amount: number | string | null
  tip_amount: number | string | null
  refund_amount: number | string | null
  net_deposit: number | string | null
  status: string | null
  linked_payment_count: number | string | null
  linked_payment_amount: number | string | null
  discrepancy_amount: number | string | null
  has_discrepancy: boolean | number | string | null
}

export interface PlatformSettlementBatch {
  id: string
  batch_id: string
  merchant_id: string
  merchant_name: string
  location_id?: string
  location_name?: string
  business_date: string
  opened_at?: string
  closed_at?: string
  settlement_date?: string
  funded_date?: string
  transaction_count: number
  sales_count: number
  refund_count: number
  void_count: number
  gross_amount: number
  tip_amount: number
  refund_amount: number
  net_deposit: number
  status: string
  linked_payment_count: number
  linked_payment_amount: number
  discrepancy_amount: number
  has_discrepancy: boolean
}

interface PlatformSettlementBatchPaymentRpcRow {
  payment_id: string
  order_id: string
  order_number: string | null
  merchant_id: string | null
  merchant_name: string | null
  location_id: string | null
  location_name: string | null
  payment_method: string | null
  payment_status: string | null
  total_amount: number | string | null
  tip_amount: number | string | null
  refund_amount: number | string | null
  is_voided: boolean | number | string | null
  is_returned: boolean | number | string | null
  initiated_at: string | null
  captured_at: string | null
}

export interface PlatformSettlementBatchPayment {
  payment_id: string
  order_id: string
  order_number?: string
  merchant_id?: string
  merchant_name?: string
  location_id?: string
  location_name?: string
  payment_method: string
  payment_status: string
  total_amount: number
  tip_amount: number
  refund_amount: number
  is_voided: boolean
  is_returned: boolean
  initiated_at?: string
  captured_at?: string
}

export interface PlatformSettlementBatchResult {
  data: PlatformSettlementBatch[]
  errorCode?: string
}

export interface PlatformSettlementBatchPaymentsResult {
  data: PlatformSettlementBatchPayment[]
  errorCode?: string
}

export interface PlatformMerchantBreakdownFilters {
  merchantIds?: string[]
  locationIds?: string[]
  paymentStatuses?: string[]
  dateFrom?: string
  dateTo?: string
}

interface PlatformMerchantBreakdownRpcRow {
  merchant_id: string | null
  merchant_name: string | null
  location_count: number | string | null
  transaction_count: number | string | null
  card_revenue: number | string | null
  cash_revenue: number | string | null
  total_revenue: number | string | null
  avg_ticket: number | string | null
  tip_total: number | string | null
  void_count: number | string | null
  void_rate_pct: number | string | null
  daily_revenue_trend: unknown
}

export interface PlatformMerchantBreakdownDailyPoint {
  date: string
  revenue: number
}

export interface PlatformMerchantBreakdown {
  merchant_id: string
  merchant_name: string
  location_count: number
  transaction_count: number
  card_revenue: number
  cash_revenue: number
  total_revenue: number
  avg_ticket: number
  tip_total: number
  void_count: number
  void_rate_pct: number
  daily_revenue_trend: PlatformMerchantBreakdownDailyPoint[]
}

export interface PlatformPaymentAuditLogFilters {
  search?: string
  user?: string
  action?: PlatformPaymentAuditActionType
  merchantIds?: string[]
  dateFrom?: string
  dateTo?: string
  outcome?: 'success' | 'failed'
}

interface PlatformPaymentAuditLogDbRow {
  id: string
  event_timestamp: string | null
  user_email: string | null
  user_role: string | null
  action: string | null
  resource_type: string | null
  resource_id: string | null
  success: boolean | number | string | null
  ip_address: string | null
  fields_accessed: string[] | null
  merchant_id: string | null
  location_id: string | null
  request_path: string | null
  error_message: string | null
}

export interface PlatformPaymentAuditLogRow {
  id: string
  event_timestamp?: string
  user_email?: string
  user_role?: string
  action: string
  resource_type: string
  resource_id?: string
  success: boolean
  ip_address?: string
  fields_accessed: string[]
  merchant_id?: string
  merchant_name?: string
  location_id?: string
  request_path?: string
  error_message?: string
}

export interface PlatformPaymentAuditLogsResult {
  data: PlatformPaymentAuditLogRow[]
  total: number
  errorCode?: string
}

export interface PlatformChargebackFilters {
  merchantIds?: string[]
  statuses?: PlatformChargebackStatus[]
  cardNetworks?: string[]
  dateFrom?: string
  dateTo?: string
}

interface PlatformChargebackDbRow {
  id: string
  original_payment_id: string | null
  dispute_psp_reference: string | null
  merchant_id: string | null
  location_id: string | null
  amount: number | string | null
  reason_code: string | null
  reason_description: string | null
  card_network: string | null
  status: string | null
  defendable: boolean | number | string | null
  defense_deadline: string | null
  defense_submitted_at: string | null
  defense_documents: unknown
  resolved_at: string | null
  resolution: string | null
  resolution_amount: number | string | null
  received_at: string | null
  created_at: string | null
  updated_at: string | null
}

interface PlatformChargebackPaymentDbRow {
  id: string
  order_id: string | null
  payment_method: string | null
  status: string | null
  total_amount: number | string | null
  card_last_four: string | null
  authorization_code: string | null
  reference_number: string | null
  initiated_at: string | null
  captured_at: string | null
}

interface PlatformChargebackOrderDbRow {
  id: string
  order_number: string | null
  display_number: string | null
  customer_name: string | null
}

export interface PlatformChargebackDocument {
  name: string
  url?: string
  uploaded_at?: string
}

export interface PlatformChargebackOriginalPaymentInfo {
  payment_id: string
  order_id?: string
  order_number?: string
  customer_name?: string
  payment_method?: string
  payment_status?: string
  total_amount: number
  card_last_four?: string
  authorization_code?: string
  reference_number?: string
  initiated_at?: string
  captured_at?: string
}

export interface PlatformChargebackRow {
  id: string
  original_payment_id: string
  dispute_psp_reference?: string
  merchant_id: string
  merchant_name?: string
  location_id?: string
  amount: number
  reason_code: string
  reason_description?: string
  card_network?: string
  status: PlatformChargebackStatus | string
  defendable: boolean
  defense_deadline?: string
  defense_submitted_at?: string
  defense_documents: PlatformChargebackDocument[]
  defense_documents_raw?: unknown
  resolved_at?: string
  resolution?: string
  resolution_amount: number
  received_at?: string
  created_at?: string
  updated_at?: string
  original_payment?: PlatformChargebackOriginalPaymentInfo
}

export interface PlatformChargebacksResult {
  data: PlatformChargebackRow[]
  total: number
  pendingCount: number
  urgentCount: number
  errorCode?: string
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

interface PlatformTransactionRpcRow {
  id: string
  order_id: string
  order_number: string | null
  display_number: string | null
  merchant_id: string | null
  merchant_name: string | null
  location_id: string | null
  location_name: string | null
  customer_name: string | null
  payment_method: string | null
  card_type: string | null
  card_last_four: string | null
  authorization_code: string | null
  reference_number: string | null
  amount: number | string | null
  tip_amount: number | string | null
  total_amount: number | string | null
  subtotal_amount: number | string | null
  tax_amount: number | string | null
  discount_amount: number | string | null
  status: string | null
  order_status: string | null
  payment_status: string | null
  staff_id: string | null
  staff_name: string | null
  entry_mode: string | null
  created_at: string | null
  total_count: number | string | null
}

interface PlatformTransactionDetailsRpcPayload {
  order?: unknown
  payments?: unknown
  order_items?: unknown
  order_discounts?: unknown
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', 't', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', 'f', '0', 'no', 'n', ''].includes(normalized)) return false
  }
  return Boolean(value)
}

type PlatformPaymentAuditAction = PlatformPaymentAuditActionType

interface PlatformPaymentAuditLogInput {
  action: PlatformPaymentAuditAction
  resourceType: string
  resourceId?: string | null
  merchantId?: string | null
  locationId?: string | null
  fieldsAccessed?: readonly string[]
  success: boolean
  errorMessage?: string
  requestPath?: string
}

function normalizeAuditErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    const message = error.message.trim()
    return message ? message.slice(0, 400) : undefined
  }
  if (typeof error === 'string') {
    const message = error.trim()
    return message ? message.slice(0, 400) : undefined
  }
  return undefined
}

function normalizeAuditUuid(value?: string | null): string | null {
  if (!value) return null
  const normalized = value.trim()
  if (!normalized || !UUID_REGEX.test(normalized)) return null
  return normalized
}

function getSingleUuidFilterValue(values?: string[]): string | null {
  if (!values || values.length !== 1) return null
  return normalizeAuditUuid(values[0])
}

function getCardLastFourSearchTerm(filters?: PlatformTransactionFilters): string | null {
  const search = filters?.search?.trim() ?? ''
  if (!search || !CARD_LAST_FOUR_SEARCH_REGEX.test(search)) return null
  return search
}

async function logPlatformPaymentAuditEvent(input: PlatformPaymentAuditLogInput): Promise<void> {
  try {
    const supabase = createServerSupabaseClient()
    const requestHeaders = await headers()

    const forwardedFor = requestHeaders.get('x-forwarded-for')
    const realIp = requestHeaders.get('x-real-ip')
    const candidateIp = forwardedFor?.split(',')[0]?.trim() || realIp?.trim() || null
    const userAgent = requestHeaders.get('user-agent')

    const { error } = await supabase.rpc('log_admin_payment_audit_event', {
      p_action: input.action,
      p_resource_type: input.resourceType,
      p_resource_id: input.resourceId ?? null,
      p_merchant_id: input.merchantId ?? null,
      p_location_id: input.locationId ?? null,
      p_fields_accessed: input.fieldsAccessed ?? null,
      p_success: input.success,
      p_error_message: input.errorMessage ?? null,
      p_request_path: input.requestPath ?? DEFAULT_AUDIT_REQUEST_PATH,
      p_ip_address: candidateIp,
      p_user_agent: userAgent,
    })

    if (!error) return

    if (error.code === 'PGRST202' || error.code === '42883') {
      if (!hasLoggedMissingPaymentAuditFunction) {
        hasLoggedMissingPaymentAuditFunction = true
        console.warn(
          '[logPlatformPaymentAuditEvent] RPC log_admin_payment_audit_event not found. Apply migration 029_adm_019_admin_payment_audit_logging.sql.'
        )
      }
      return
    }

    console.error('[logPlatformPaymentAuditEvent:rpc] Error:', error)
  } catch (error) {
    console.error('[logPlatformPaymentAuditEvent] Unexpected error:', error)
  }
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

function applyChargebackFilters(
  query: any,
  filters?: PlatformChargebackFilters,
  includeStatus: boolean = true
) {
  let next = query

  if (filters?.merchantIds && filters.merchantIds.length > 0) {
    next = next.in('merchant_id', filters.merchantIds)
  }

  if (includeStatus && filters?.statuses && filters.statuses.length > 0) {
    next = next.in('status', filters.statuses)
  }

  if (filters?.cardNetworks && filters.cardNetworks.length > 0) {
    next = next.in('card_network', filters.cardNetworks)
  }

  if (filters?.dateFrom) {
    next = next.gte('received_at', `${filters.dateFrom}T00:00:00`)
  }

  if (filters?.dateTo) {
    next = next.lte('received_at', `${filters.dateTo}T23:59:59`)
  }

  return next
}

async function getAssignedMerchantScope(
  userId: string,
  roleCode?: string | null
): Promise<string[] | null> {
  // Super admin keeps global visibility.
  if (roleCode === 'hq.super_admin') {
    return null
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('admin_merchant_access')
    .select('merchant_id')
    .eq('admin_user_id', userId)
    .eq('is_active', true)

  if (error) {
    console.error('[getAssignedMerchantScope] Error:', error)
    return []
  }

  return Array.from(
    new Set(
      (data ?? [])
        .map((row: any) => row.merchant_id)
        .filter((merchantId: unknown): merchantId is string =>
          typeof merchantId === 'string' && merchantId.length > 0
        )
    )
  )
}

function applyMerchantScope(
  requestedMerchantIds: string[] | undefined,
  scopedMerchantIds: string[] | null
): string[] | undefined {
  if (scopedMerchantIds === null) {
    return requestedMerchantIds
  }

  if (!requestedMerchantIds || requestedMerchantIds.length === 0) {
    return scopedMerchantIds
  }

  const allowed = new Set(scopedMerchantIds)
  return requestedMerchantIds.filter((merchantId) => allowed.has(merchantId))
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

function mapRpcRowToTransaction(row: PlatformTransactionRpcRow): PlatformTransaction {
  return {
    id: row.id,
    order_id: row.order_id,
    merchant_name: row.merchant_name || 'Unknown',
    merchant_id: row.merchant_id || '',
    location_name: row.location_name || undefined,
    location_id: row.location_id || undefined,
    customer_name: row.customer_name || undefined,
    order_number: row.order_number || row.display_number || undefined,
    payment_method: row.payment_method || 'unknown',
    card_type: row.card_type || undefined,
    card_last_four: row.card_last_four || undefined,
    authorization_code: row.authorization_code || undefined,
    reference_number: row.reference_number || undefined,
    amount: Number(row.amount || 0),
    tip_amount: Number(row.tip_amount || 0),
    total_amount: Number(row.total_amount || 0),
    subtotal_amount:
      row.subtotal_amount !== null && row.subtotal_amount !== undefined
        ? Number(row.subtotal_amount)
        : undefined,
    tax_amount:
      row.tax_amount !== null && row.tax_amount !== undefined
        ? Number(row.tax_amount)
        : undefined,
    discount_amount:
      row.discount_amount !== null && row.discount_amount !== undefined
        ? Number(row.discount_amount)
        : undefined,
    status: row.status || 'unknown',
    order_status: row.order_status || undefined,
    staff_name: row.staff_name || undefined,
    entry_mode: row.entry_mode || undefined,
    created_at: row.created_at || new Date(0).toISOString(),
  }
}

function mapRpcRowToExport(row: PlatformTransactionExportRpcRow): PlatformTransactionExportRow {
  return {
    payment_id: row.payment_id,
    order_id: row.order_id,
    order_number: row.order_number || undefined,
    display_number: row.display_number || undefined,
    created_at: row.created_at || new Date(0).toISOString(),
    merchant_id: row.merchant_id || undefined,
    merchant_name: row.merchant_name || undefined,
    location_id: row.location_id || undefined,
    location_name: row.location_name || undefined,
    customer_name: row.customer_name || undefined,
    order_type: row.order_type || undefined,
    order_status: row.order_status || undefined,
    payment_method: row.payment_method || undefined,
    card_type: row.card_type || undefined,
    card_last_four: row.card_last_four || undefined,
    entry_mode: row.entry_mode || undefined,
    authorization_code: row.authorization_code || undefined,
    reference_number: row.reference_number || undefined,
    batch_number: row.batch_number || undefined,
    subtotal_amount: Number(row.subtotal_amount || 0),
    tax_amount: Number(row.tax_amount || 0),
    tip_amount: Number(row.tip_amount || 0),
    discount_amount: Number(row.discount_amount || 0),
    service_charge_amount: Number(row.service_charge_amount || 0),
    total_amount: Number(row.total_amount || 0),
    amount_tendered: Number(row.amount_tendered || 0),
    change_given: Number(row.change_given || 0),
    payment_status: row.payment_status || undefined,
    is_voided: toBoolean(row.is_voided),
    void_reason: row.void_reason || undefined,
    is_returned: toBoolean(row.is_returned),
    return_amount: Number(row.return_amount || 0),
    return_reason: row.return_reason || undefined,
    staff_name: row.staff_name || undefined,
    terminal_serial: row.terminal_serial || undefined,
    device_id: row.device_id || undefined,
  }
}

function mapRpcRowToSummary(row: PlatformTransactionSummaryRpcRow): PlatformTransactionSummary {
  return {
    currentPeriodFrom: row.current_period_from || undefined,
    currentPeriodTo: row.current_period_to || undefined,
    previousPeriodFrom: row.previous_period_from || undefined,
    previousPeriodTo: row.previous_period_to || undefined,
    current: {
      totalTransactions: Number(row.current_total_transactions || 0),
      cardRevenue: Number(row.current_card_revenue || 0),
      cardCount: Number(row.current_card_count || 0),
      cashRevenue: Number(row.current_cash_revenue || 0),
      cashCount: Number(row.current_cash_count || 0),
      totalRevenue: Number(row.current_total_revenue || 0),
      avgTip: Number(row.current_avg_tip || 0),
      avgTipPct: Number(row.current_avg_tip_pct || 0),
      voidReturnCount: Number(row.current_void_return_count || 0),
      voidReturnAmount: Number(row.current_void_return_amount || 0),
      voidRatePct: Number(row.current_void_rate_pct || 0),
    },
    previous: {
      totalTransactions: Number(row.previous_total_transactions || 0),
      cardRevenue: Number(row.previous_card_revenue || 0),
      cardCount: Number(row.previous_card_count || 0),
      cashRevenue: Number(row.previous_cash_revenue || 0),
      cashCount: Number(row.previous_cash_count || 0),
      totalRevenue: Number(row.previous_total_revenue || 0),
      avgTip: Number(row.previous_avg_tip || 0),
      avgTipPct: Number(row.previous_avg_tip_pct || 0),
      voidReturnCount: Number(row.previous_void_return_count || 0),
      voidReturnAmount: Number(row.previous_void_return_amount || 0),
      voidRatePct: Number(row.previous_void_rate_pct || 0),
    },
  }
}

function mapRpcRowToSettlementBatch(row: PlatformSettlementBatchRpcRow): PlatformSettlementBatch {
  return {
    id: row.id,
    batch_id: row.batch_id || '',
    merchant_id: row.merchant_id || '',
    merchant_name: row.merchant_name || 'Unknown',
    location_id: row.location_id || undefined,
    location_name: row.location_name || undefined,
    business_date: row.business_date || '',
    opened_at: row.opened_at || undefined,
    closed_at: row.closed_at || undefined,
    settlement_date: row.settlement_date || undefined,
    funded_date: row.funded_date || undefined,
    transaction_count: Number(row.transaction_count || 0),
    sales_count: Number(row.sales_count || 0),
    refund_count: Number(row.refund_count || 0),
    void_count: Number(row.void_count || 0),
    gross_amount: Number(row.gross_amount || 0),
    tip_amount: Number(row.tip_amount || 0),
    refund_amount: Number(row.refund_amount || 0),
    net_deposit: Number(row.net_deposit || 0),
    status: row.status || 'unknown',
    linked_payment_count: Number(row.linked_payment_count || 0),
    linked_payment_amount: Number(row.linked_payment_amount || 0),
    discrepancy_amount: Number(row.discrepancy_amount || 0),
    has_discrepancy: toBoolean(row.has_discrepancy),
  }
}

function mapRpcRowToSettlementBatchPayment(
  row: PlatformSettlementBatchPaymentRpcRow
): PlatformSettlementBatchPayment {
  return {
    payment_id: row.payment_id,
    order_id: row.order_id,
    order_number: row.order_number || undefined,
    merchant_id: row.merchant_id || undefined,
    merchant_name: row.merchant_name || undefined,
    location_id: row.location_id || undefined,
    location_name: row.location_name || undefined,
    payment_method: row.payment_method || 'unknown',
    payment_status: row.payment_status || 'unknown',
    total_amount: Number(row.total_amount || 0),
    tip_amount: Number(row.tip_amount || 0),
    refund_amount: Number(row.refund_amount || 0),
    is_voided: toBoolean(row.is_voided),
    is_returned: toBoolean(row.is_returned),
    initiated_at: row.initiated_at || undefined,
    captured_at: row.captured_at || undefined,
  }
}

function mapRpcRowToMerchantBreakdown(
  row: PlatformMerchantBreakdownRpcRow
): PlatformMerchantBreakdown {
  const trend = asArray<any>(row.daily_revenue_trend)
    .map((point) => ({
      date: typeof point?.date === 'string' ? point.date : '',
      revenue: Number(point?.revenue || 0),
    }))
    .filter((point) => point.date.length > 0)

  return {
    merchant_id: row.merchant_id || '',
    merchant_name: row.merchant_name || 'Unknown',
    location_count: Number(row.location_count || 0),
    transaction_count: Number(row.transaction_count || 0),
    card_revenue: Number(row.card_revenue || 0),
    cash_revenue: Number(row.cash_revenue || 0),
    total_revenue: Number(row.total_revenue || 0),
    avg_ticket: Number(row.avg_ticket || 0),
    tip_total: Number(row.tip_total || 0),
    void_count: Number(row.void_count || 0),
    void_rate_pct: Number(row.void_rate_pct || 0),
    daily_revenue_trend: trend,
  }
}

function mapDbRowToPaymentAuditLog(
  row: PlatformPaymentAuditLogDbRow,
  merchantNameById: Map<string, string>
): PlatformPaymentAuditLogRow {
  const merchantId = row.merchant_id || undefined
  return {
    id: row.id,
    event_timestamp: row.event_timestamp || undefined,
    user_email: row.user_email || undefined,
    user_role: row.user_role || undefined,
    action: row.action || 'unknown_action',
    resource_type: row.resource_type || 'payment_data',
    resource_id: row.resource_id || undefined,
    success: toBoolean(row.success),
    ip_address: row.ip_address || undefined,
    fields_accessed: Array.isArray(row.fields_accessed) ? row.fields_accessed : [],
    merchant_id: merchantId,
    merchant_name: merchantId ? merchantNameById.get(merchantId) : undefined,
    location_id: row.location_id || undefined,
    request_path: row.request_path || undefined,
    error_message: row.error_message || undefined,
  }
}

function normalizeChargebackDocuments(input: unknown): PlatformChargebackDocument[] {
  if (!input) return []

  if (Array.isArray(input)) {
    return input
      .map((entry, index) => {
        if (typeof entry === 'string') {
          const name = entry.trim()
          if (!name) return null
          return { name }
        }

        const record = asRecord(entry)
        if (!record) return null

        const urlValue = typeof record.url === 'string' ? record.url.trim() : ''
        const nameValue =
          typeof record.name === 'string'
            ? record.name.trim()
            : typeof record.filename === 'string'
              ? record.filename.trim()
              : urlValue
                ? `Document ${index + 1}`
                : ''
        const uploadedAt =
          typeof record.uploaded_at === 'string'
            ? record.uploaded_at
            : typeof record.created_at === 'string'
              ? record.created_at
              : undefined

        if (!nameValue && !urlValue) return null

        return {
          name: nameValue || `Document ${index + 1}`,
          url: urlValue || undefined,
          uploaded_at: uploadedAt,
        }
      })
      .filter((entry): entry is PlatformChargebackDocument => Boolean(entry))
  }

  const record = asRecord(input)
  if (!record) return []

  const urlValue = typeof record.url === 'string' ? record.url.trim() : ''
  const nameValue =
    typeof record.name === 'string'
      ? record.name.trim()
      : typeof record.filename === 'string'
        ? record.filename.trim()
        : urlValue
          ? 'Document'
          : ''
  const uploadedAt =
    typeof record.uploaded_at === 'string'
      ? record.uploaded_at
      : typeof record.created_at === 'string'
        ? record.created_at
        : undefined

  if (!nameValue && !urlValue) return []
  return [{ name: nameValue || 'Document', url: urlValue || undefined, uploaded_at: uploadedAt }]
}

function mapDbRowToChargeback(
  row: PlatformChargebackDbRow,
  merchantNameById: Map<string, string>,
  paymentById: Map<string, PlatformChargebackPaymentDbRow>,
  orderById: Map<string, PlatformChargebackOrderDbRow>
): PlatformChargebackRow {
  const merchantId = row.merchant_id || ''
  const paymentId = row.original_payment_id || ''
  const payment = paymentById.get(paymentId)
  const order = payment?.order_id ? orderById.get(payment.order_id) : undefined
  const orderNumber = order?.order_number || order?.display_number || undefined

  return {
    id: row.id,
    original_payment_id: paymentId,
    dispute_psp_reference: row.dispute_psp_reference || undefined,
    merchant_id: merchantId,
    merchant_name: merchantId ? merchantNameById.get(merchantId) : undefined,
    location_id: row.location_id || undefined,
    amount: Number(row.amount || 0),
    reason_code: row.reason_code || 'unknown',
    reason_description: row.reason_description || undefined,
    card_network: row.card_network || undefined,
    status: row.status || 'notified',
    defendable: toBoolean(row.defendable),
    defense_deadline: row.defense_deadline || undefined,
    defense_submitted_at: row.defense_submitted_at || undefined,
    defense_documents: normalizeChargebackDocuments(row.defense_documents),
    defense_documents_raw: row.defense_documents ?? undefined,
    resolved_at: row.resolved_at || undefined,
    resolution: row.resolution || undefined,
    resolution_amount: Number(row.resolution_amount || 0),
    received_at: row.received_at || undefined,
    created_at: row.created_at || undefined,
    updated_at: row.updated_at || undefined,
    original_payment: payment
      ? {
          payment_id: payment.id,
          order_id: payment.order_id || undefined,
          order_number: orderNumber,
          customer_name: order?.customer_name || undefined,
          payment_method: payment.payment_method || undefined,
          payment_status: payment.status || undefined,
          total_amount: Number(payment.total_amount || 0),
          card_last_four: payment.card_last_four || undefined,
          authorization_code: payment.authorization_code || undefined,
          reference_number: payment.reference_number || undefined,
          initiated_at: payment.initiated_at || undefined,
          captured_at: payment.captured_at || undefined,
        }
      : undefined,
  }
}

function normalizeSortByForRpc(
  filters?: PlatformTransactionFilters
): 'initiated_at' | 'order_number' | 'total_amount' {
  if (filters?.sortBy === 'order_number') return 'order_number'
  if (filters?.sortBy === 'total_amount') return 'total_amount'
  return 'initiated_at'
}

function normalizeCardTypeFilterForRpc(cardTypes?: string[]): string | null {
  if (!cardTypes || cardTypes.length === 0) return null
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
  return tokens.length > 0 ? tokens.join(',') : null
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

async function getPlatformTransactionsFromRpc(
  limit: number,
  offset: number,
  filters?: PlatformTransactionFilters
): Promise<{ data: PlatformTransaction[]; total: number; errorCode?: string }> {
  if (limit <= 0) return { data: [], total: 0 }

  const supabase = createServerSupabaseClient()
  const page = Math.floor(offset / limit) + 1
  const search = filters?.search?.trim()

  const { data, error } = await supabase.rpc('get_admin_transactions', {
    p_merchant_ids: filters?.merchantIds ?? null,
    p_location_ids: filters?.locationIds ?? null,
    p_status: filters?.orderStatuses ?? null,
    p_payment_status: filters?.paymentStatuses ?? null,
    p_payment_method: filters?.paymentMethods ?? null,
    p_date_from: filters?.dateFrom ?? null,
    p_date_to: filters?.dateTo ?? null,
    p_min_amount: filters?.minAmount ?? null,
    p_max_amount: filters?.maxAmount ?? null,
    p_search: search && search.length >= 2 ? search : null,
    p_card_type: normalizeCardTypeFilterForRpc(filters?.cardTypes),
    p_staff_id: filters?.staffId ?? null,
    p_sort_by: normalizeSortByForRpc(filters),
    p_sort_dir: filters?.sortDir ?? 'desc',
    p_page: page,
    p_page_size: limit,
  })

  if (error) {
    console.error('[getPlatformTransactions:rpc] Error:', error)
    return { data: [], total: 0, errorCode: error.code }
  }

  const rows = (data ?? []) as PlatformTransactionRpcRow[]
  const total =
    rows.length > 0 && rows[0].total_count !== null && rows[0].total_count !== undefined
      ? Number(rows[0].total_count)
      : 0

  return {
    data: rows.map(mapRpcRowToTransaction),
    total,
  }
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
  const { userId, role } = await assertHQPermission('hq.merchant.transactions')
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
  const scopedMerchantIds = applyMerchantScope(filters?.merchantIds, merchantScope)
  const scopedFilters =
    scopedMerchantIds === undefined ? filters : { ...(filters ?? {}), merchantIds: scopedMerchantIds }

  if (scopedMerchantIds !== undefined && scopedMerchantIds.length === 0) {
    return { data: [], total: 0 }
  }

  const auditMerchantId = getSingleUuidFilterValue(scopedFilters?.merchantIds)
  const auditLocationId = getSingleUuidFilterValue(filters?.locationIds)
  const cardLastFourSearchTerm = getCardLastFourSearchTerm(scopedFilters)

  try {
    let result: { data: PlatformTransaction[]; total: number } | null = null

    const fromRpc = await getPlatformTransactionsFromRpc(limit, offset, scopedFilters)
    if (!fromRpc.errorCode) {
      result = { data: fromRpc.data, total: fromRpc.total }
    } else {
      console.warn(
        `[getPlatformTransactions] Falling back from RPC to query path due to rpc error (${fromRpc.errorCode}).`
      )

      if (USE_PLATFORM_TX_VIEW) {
        const fromView = await getPlatformTransactionsFromView(limit, offset, scopedFilters)
        if (!fromView.errorCode) {
          result = { data: fromView.data, total: fromView.total }
        } else {
          console.warn(
            `[getPlatformTransactions] Falling back to legacy query path due to view error (${fromView.errorCode}).`
          )
        }
      }

      if (!result) {
        const legacyResult = await getPlatformTransactionsLegacy(limit, offset, scopedFilters)
        result = { data: legacyResult.data, total: legacyResult.total }
      }
    }

    void logPlatformPaymentAuditEvent({
      action: 'view_transaction_list',
      resourceType: 'transaction_list',
      merchantId: auditMerchantId,
      locationId: auditLocationId,
      fieldsAccessed: AUDIT_LOG_FIELDS_TRANSACTION_LIST,
      success: true,
    })

    if (cardLastFourSearchTerm) {
      void logPlatformPaymentAuditEvent({
        action: 'search_card_last_four',
        resourceType: 'transaction_search',
        merchantId: auditMerchantId,
        locationId: auditLocationId,
        fieldsAccessed: ['card_last_four'],
        success: true,
      })
    }

    return result
  } catch (error) {
    const errorMessage = normalizeAuditErrorMessage(error)

    void logPlatformPaymentAuditEvent({
      action: 'view_transaction_list',
      resourceType: 'transaction_list',
      merchantId: auditMerchantId,
      locationId: auditLocationId,
      fieldsAccessed: AUDIT_LOG_FIELDS_TRANSACTION_LIST,
      success: false,
      errorMessage,
    })

    if (cardLastFourSearchTerm) {
      void logPlatformPaymentAuditEvent({
        action: 'search_card_last_four',
        resourceType: 'transaction_search',
        merchantId: auditMerchantId,
        locationId: auditLocationId,
        fieldsAccessed: ['card_last_four'],
        success: false,
        errorMessage,
      })
    }

    throw error
  }
}

export async function getPlatformTransactionsExport(
  filters?: PlatformTransactionFilters
): Promise<PlatformTransactionExportResult> {
  const { userId, role } = await assertHQPermission('hq.merchant.transactions')
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
  const scopedMerchantIds = applyMerchantScope(filters?.merchantIds, merchantScope)
  const scopedFilters =
    scopedMerchantIds === undefined ? filters : { ...(filters ?? {}), merchantIds: scopedMerchantIds }

  if (scopedMerchantIds !== undefined && scopedMerchantIds.length === 0) {
    return {
      rows: [],
      total: 0,
      cap: 10000,
      capped: false,
    }
  }

  const supabase = createServerSupabaseClient()
  const exportCap = 10000
  const search = scopedFilters?.search?.trim()
  const auditMerchantId = getSingleUuidFilterValue(scopedFilters?.merchantIds)
  const auditLocationId = getSingleUuidFilterValue(scopedFilters?.locationIds)
  const cardLastFourSearchTerm = getCardLastFourSearchTerm(scopedFilters)

  try {
    const { data, error } = await supabase.rpc('get_admin_transactions_export', {
      p_merchant_ids: scopedFilters?.merchantIds ?? null,
      p_location_ids: scopedFilters?.locationIds ?? null,
      p_status: scopedFilters?.orderStatuses ?? null,
      p_payment_status: scopedFilters?.paymentStatuses ?? null,
      p_payment_method: scopedFilters?.paymentMethods ?? null,
      p_date_from: scopedFilters?.dateFrom ?? null,
      p_date_to: scopedFilters?.dateTo ?? null,
      p_min_amount: scopedFilters?.minAmount ?? null,
      p_max_amount: scopedFilters?.maxAmount ?? null,
      p_search: search && search.length >= 2 ? search : null,
      p_card_type: normalizeCardTypeFilterForRpc(scopedFilters?.cardTypes),
      p_staff_id: scopedFilters?.staffId ?? null,
      p_sort_by: normalizeSortByForRpc(scopedFilters),
      p_sort_dir: scopedFilters?.sortDir ?? 'desc',
      p_limit: exportCap,
    })

    if (error) {
      console.error('[getPlatformTransactionsExport:rpc] Error:', error)

      const errorMessage = normalizeAuditErrorMessage(error.message ?? error.details ?? error.code)
      void logPlatformPaymentAuditEvent({
        action: 'export_data',
        resourceType: 'transaction_export',
        merchantId: auditMerchantId,
        locationId: auditLocationId,
        fieldsAccessed: AUDIT_LOG_FIELDS_TRANSACTION_LIST,
        success: false,
        errorMessage,
      })

      if (cardLastFourSearchTerm) {
        void logPlatformPaymentAuditEvent({
          action: 'search_card_last_four',
          resourceType: 'transaction_search',
          merchantId: auditMerchantId,
          locationId: auditLocationId,
          fieldsAccessed: ['card_last_four'],
          success: false,
          errorMessage,
        })
      }

      return {
        rows: [],
        total: 0,
        cap: exportCap,
        capped: false,
        errorCode: error.code,
      }
    }

    const rows = (data ?? []) as PlatformTransactionExportRpcRow[]
    const mappedRows = rows.map(mapRpcRowToExport)
    const total =
      rows.length > 0 && rows[0].total_count !== null && rows[0].total_count !== undefined
        ? Number(rows[0].total_count)
        : 0

    void logPlatformPaymentAuditEvent({
      action: 'export_data',
      resourceType: 'transaction_export',
      merchantId: auditMerchantId,
      locationId: auditLocationId,
      fieldsAccessed: AUDIT_LOG_FIELDS_TRANSACTION_LIST,
      success: true,
    })

    if (cardLastFourSearchTerm) {
      void logPlatformPaymentAuditEvent({
        action: 'search_card_last_four',
        resourceType: 'transaction_search',
        merchantId: auditMerchantId,
        locationId: auditLocationId,
        fieldsAccessed: ['card_last_four'],
        success: true,
      })
    }

    return {
      rows: mappedRows,
      total,
      cap: exportCap,
      capped: total > mappedRows.length,
    }
  } catch (error) {
    const errorMessage = normalizeAuditErrorMessage(error)

    void logPlatformPaymentAuditEvent({
      action: 'export_data',
      resourceType: 'transaction_export',
      merchantId: auditMerchantId,
      locationId: auditLocationId,
      fieldsAccessed: AUDIT_LOG_FIELDS_TRANSACTION_LIST,
      success: false,
      errorMessage,
    })

    if (cardLastFourSearchTerm) {
      void logPlatformPaymentAuditEvent({
        action: 'search_card_last_four',
        resourceType: 'transaction_search',
        merchantId: auditMerchantId,
        locationId: auditLocationId,
        fieldsAccessed: ['card_last_four'],
        success: false,
        errorMessage,
      })
    }

    throw error
  }
}

export async function getPlatformTransactionSummary(
  filters?: PlatformTransactionFilters
): Promise<PlatformTransactionSummary | null> {
  const { userId, role } = await assertHQPermission('hq.merchant.transactions')
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
  const scopedMerchantIds = applyMerchantScope(filters?.merchantIds, merchantScope)
  const scopedFilters =
    scopedMerchantIds === undefined ? filters : { ...(filters ?? {}), merchantIds: scopedMerchantIds }

  if (scopedMerchantIds !== undefined && scopedMerchantIds.length === 0) {
    return null
  }

  const supabase = createServerSupabaseClient()
  const search = scopedFilters?.search?.trim()

  const { data, error } = await supabase.rpc('get_admin_transaction_summary', {
    p_merchant_ids: scopedFilters?.merchantIds ?? null,
    p_location_ids: scopedFilters?.locationIds ?? null,
    p_status: scopedFilters?.orderStatuses ?? null,
    p_payment_status: scopedFilters?.paymentStatuses ?? null,
    p_payment_method: scopedFilters?.paymentMethods ?? null,
    p_date_from: scopedFilters?.dateFrom ?? null,
    p_date_to: scopedFilters?.dateTo ?? null,
    p_min_amount: scopedFilters?.minAmount ?? null,
    p_max_amount: scopedFilters?.maxAmount ?? null,
    p_search: search && search.length >= 2 ? search : null,
    p_card_type: normalizeCardTypeFilterForRpc(scopedFilters?.cardTypes),
    p_staff_id: scopedFilters?.staffId ?? null,
    p_sort_by: normalizeSortByForRpc(scopedFilters),
    p_sort_dir: scopedFilters?.sortDir ?? 'desc',
  })

  if (error) {
    console.error('[getPlatformTransactionSummary:rpc] Error:', error)
    return null
  }

  const row = ((data ?? []) as PlatformTransactionSummaryRpcRow[])[0]
  if (!row) {
    return null
  }

  return mapRpcRowToSummary(row)
}

export async function getPlatformSettlementBatches(
  filters?: PlatformSettlementBatchFilters
): Promise<PlatformSettlementBatchResult> {
  await assertHQPermission('hq.merchant.transactions')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_admin_settlement_batches', {
    p_merchant_ids: filters?.merchantIds ?? null,
    p_status: filters?.statuses ?? null,
    p_date_from: filters?.dateFrom ?? null,
    p_date_to: filters?.dateTo ?? null,
    p_limit: filters?.limit ?? 200,
  })

  if (error) {
    console.error('[getPlatformSettlementBatches:rpc] Error:', error)
    return {
      data: [],
      errorCode: error.code,
    }
  }

  const rows = (data ?? []) as PlatformSettlementBatchRpcRow[]
  return {
    data: rows.map(mapRpcRowToSettlementBatch),
  }
}

export async function getPlatformSettlementBatchPayments(
  batchId: string,
  merchantId?: string
): Promise<PlatformSettlementBatchPaymentsResult> {
  await assertHQPermission('hq.merchant.transactions')

  const normalizedBatchId = batchId.trim()
  if (!normalizedBatchId) {
    return { data: [] }
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('get_admin_settlement_batch_payments', {
    p_batch_id: normalizedBatchId,
    p_merchant_id: merchantId ?? null,
  })

  if (error) {
    console.error('[getPlatformSettlementBatchPayments:rpc] Error:', error)
    return {
      data: [],
      errorCode: error.code,
    }
  }

  const rows = (data ?? []) as PlatformSettlementBatchPaymentRpcRow[]
  return {
    data: rows.map(mapRpcRowToSettlementBatchPayment),
  }
}

export async function getPlatformMerchantBreakdown(
  filters?: PlatformMerchantBreakdownFilters
): Promise<PlatformMerchantBreakdown[]> {
  await assertHQPermission('hq.merchant.transactions')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_admin_merchant_breakdown', {
    p_merchant_ids: filters?.merchantIds ?? null,
    p_location_ids: filters?.locationIds ?? null,
    p_payment_status: filters?.paymentStatuses ?? null,
    p_date_from: filters?.dateFrom ?? null,
    p_date_to: filters?.dateTo ?? null,
  })

  if (error) {
    console.error('[getPlatformMerchantBreakdown:rpc] Error:', error)
    throw new Error(`MERCHANT_BREAKDOWN_RPC_${error.code || 'unknown'}`)
  }

  const rows = (data ?? []) as PlatformMerchantBreakdownRpcRow[]
  return rows.map(mapRpcRowToMerchantBreakdown)
}

export async function getPlatformPaymentAuditLogs(
  filters?: PlatformPaymentAuditLogFilters,
  limit: number = 50,
  offset: number = 0
): Promise<PlatformPaymentAuditLogsResult> {
  const { userId, role } = await assertHQPermission('hq.merchant.transactions')
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
  const scopedMerchantIds = applyMerchantScope(filters?.merchantIds, merchantScope)
  const scopedFilters =
    scopedMerchantIds === undefined ? filters : { ...(filters ?? {}), merchantIds: scopedMerchantIds }

  if (scopedMerchantIds !== undefined && scopedMerchantIds.length === 0) {
    return {
      data: [],
      total: 0,
    }
  }

  const supabase = createServerSupabaseClient()
  const safeLimit = Math.min(Math.max(limit, 1), 200)
  const safeOffset = Math.max(offset, 0)

  let query = supabase
    .from('payment_audit_log')
    .select(
      `
      id,
      event_timestamp,
      user_email,
      user_role,
      action,
      resource_type,
      resource_id,
      success,
      ip_address,
      fields_accessed,
      merchant_id,
      location_id,
      request_path,
      error_message
      `,
      { count: 'exact' }
    )
    .order('event_timestamp', { ascending: false })

  if (scopedFilters?.merchantIds && scopedFilters.merchantIds.length > 0) {
    query = query.in('merchant_id', scopedFilters.merchantIds)
  }

  if (scopedFilters?.action) {
    query = query.eq('action', scopedFilters.action)
  }

  if (scopedFilters?.outcome === 'success') {
    query = query.eq('success', true)
  } else if (scopedFilters?.outcome === 'failed') {
    query = query.eq('success', false)
  }

  if (scopedFilters?.user && scopedFilters.user.trim().length > 0) {
    const userTerm = sanitizeSearchTerm(scopedFilters.user).trim()
    if (userTerm.length > 0) {
      query = query.ilike('user_email', `%${userTerm}%`)
    }
  }

  if (scopedFilters?.dateFrom) {
    query = query.gte('event_timestamp', `${scopedFilters.dateFrom}T00:00:00`)
  }

  if (scopedFilters?.dateTo) {
    query = query.lte('event_timestamp', `${scopedFilters.dateTo}T23:59:59`)
  }

  const searchTerm = scopedFilters?.search?.trim() || ''
  if (searchTerm.length >= 2) {
    if (UUID_REGEX.test(searchTerm)) {
      query = query.eq('resource_id', searchTerm)
    } else if (searchTerm.includes('@')) {
      const normalized = sanitizeSearchTerm(searchTerm)
      query = query.ilike('user_email', `%${normalized}%`)
    } else {
      const normalized = sanitizeSearchTerm(searchTerm)
      query = query.or(
        `user_email.ilike.%${normalized}%,action.ilike.%${normalized}%,resource_type.ilike.%${normalized}%`
      )
    }
  }

  query = query.range(safeOffset, safeOffset + safeLimit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getPlatformPaymentAuditLogs] Error:', error)
    return {
      data: [],
      total: 0,
      errorCode: error.code,
    }
  }

  const rows = (data ?? []) as PlatformPaymentAuditLogDbRow[]
  const merchantIds = Array.from(
    new Set(rows.map((row) => row.merchant_id).filter((value): value is string => Boolean(value)))
  )

  const merchantNameById = new Map<string, string>()
  if (merchantIds.length > 0) {
    const { data: merchantsData, error: merchantsError } = await supabase
      .from('merchants')
      .select('id, name')
      .in('id', merchantIds)

    if (merchantsError) {
      console.error('[getPlatformPaymentAuditLogs:merchants] Error:', merchantsError)
    } else {
      for (const merchant of merchantsData ?? []) {
        if (merchant.id) {
          merchantNameById.set(merchant.id, merchant.name || 'Unknown')
        }
      }
    }
  }

  return {
    data: rows.map((row) => mapDbRowToPaymentAuditLog(row, merchantNameById)),
    total: count || 0,
  }
}

export async function getPlatformChargebacks(
  filters?: PlatformChargebackFilters,
  limit: number = 50,
  offset: number = 0
): Promise<PlatformChargebacksResult> {
  const { userId, role } = await assertHQPermission('hq.merchant.transactions')
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
  const scopedMerchantIds = applyMerchantScope(filters?.merchantIds, merchantScope)
  const scopedFilters =
    scopedMerchantIds === undefined ? filters : { ...(filters ?? {}), merchantIds: scopedMerchantIds }

  if (scopedMerchantIds !== undefined && scopedMerchantIds.length === 0) {
    return {
      data: [],
      total: 0,
      pendingCount: 0,
      urgentCount: 0,
    }
  }

  const supabase = createServerSupabaseClient()
  const safeLimit = Math.min(Math.max(limit, 1), 200)
  const safeOffset = Math.max(offset, 0)

  let baseQuery = supabase
    .from('chargebacks')
    .select(
      `
      id,
      original_payment_id,
      dispute_psp_reference,
      merchant_id,
      location_id,
      amount,
      reason_code,
      reason_description,
      card_network,
      status,
      defendable,
      defense_deadline,
      defense_submitted_at,
      defense_documents,
      resolved_at,
      resolution,
      resolution_amount,
      received_at,
      created_at,
      updated_at
      `,
      { count: 'exact' }
    )
    .order('defense_deadline', { ascending: true, nullsFirst: false })
    .order('received_at', { ascending: false })

  baseQuery = applyChargebackFilters(baseQuery, scopedFilters, true)
  baseQuery = baseQuery.range(safeOffset, safeOffset + safeLimit - 1)

  const { data, error, count } = await baseQuery

  if (error) {
    console.error('[getPlatformChargebacks] Error:', error)
    return {
      data: [],
      total: 0,
      pendingCount: 0,
      urgentCount: 0,
      errorCode: error.code,
    }
  }

  const rows = (data ?? []) as PlatformChargebackDbRow[]

  const merchantIds = Array.from(
    new Set(rows.map((row) => row.merchant_id).filter((value): value is string => Boolean(value)))
  )
  const paymentIds = Array.from(
    new Set(rows.map((row) => row.original_payment_id).filter((value): value is string => Boolean(value)))
  )

  const merchantNameById = new Map<string, string>()
  if (merchantIds.length > 0) {
    const { data: merchantsData, error: merchantsError } = await supabase
      .from('merchants')
      .select('id, name')
      .in('id', merchantIds)

    if (merchantsError) {
      console.error('[getPlatformChargebacks:merchants] Error:', merchantsError)
    } else {
      for (const merchant of merchantsData ?? []) {
        if (merchant.id) {
          merchantNameById.set(merchant.id, merchant.name || 'Unknown')
        }
      }
    }
  }

  const paymentById = new Map<string, PlatformChargebackPaymentDbRow>()
  if (paymentIds.length > 0) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('order_payments')
      .select(
        `
        id,
        order_id,
        payment_method,
        status,
        total_amount,
        card_last_four,
        authorization_code,
        reference_number,
        initiated_at,
        captured_at
        `
      )
      .in('id', paymentIds)

    if (paymentsError) {
      console.error('[getPlatformChargebacks:payments] Error:', paymentsError)
    } else {
      for (const payment of (paymentsData ?? []) as PlatformChargebackPaymentDbRow[]) {
        paymentById.set(payment.id, payment)
      }
    }
  }

  const orderIds = Array.from(
    new Set(
      Array.from(paymentById.values())
        .map((payment) => payment.order_id)
        .filter((value): value is string => Boolean(value))
    )
  )
  const orderById = new Map<string, PlatformChargebackOrderDbRow>()
  if (orderIds.length > 0) {
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, display_number, customer_name')
      .in('id', orderIds)

    if (ordersError) {
      console.error('[getPlatformChargebacks:orders] Error:', ordersError)
    } else {
      for (const order of (ordersData ?? []) as PlatformChargebackOrderDbRow[]) {
        orderById.set(order.id, order)
      }
    }
  }

  const pendingStatuses: PlatformChargebackStatus[] = ['notified', 'under_review']

  let pendingQuery = supabase
    .from('chargebacks')
    .select('id', { count: 'exact', head: true })
    .in('status', pendingStatuses)
  pendingQuery = applyChargebackFilters(pendingQuery, scopedFilters, false)

  const { count: pendingCountRaw, error: pendingCountError } = await pendingQuery
  if (pendingCountError) {
    console.error('[getPlatformChargebacks:pendingCount] Error:', pendingCountError)
  }

  const now = new Date()
  const cutoff = new Date(now.getTime() + 72 * 60 * 60 * 1000)

  let urgentQuery = supabase
    .from('chargebacks')
    .select('id', { count: 'exact', head: true })
    .in('status', pendingStatuses)
    .not('defense_deadline', 'is', null)
    .gte('defense_deadline', now.toISOString())
    .lte('defense_deadline', cutoff.toISOString())
  urgentQuery = applyChargebackFilters(urgentQuery, scopedFilters, false)

  const { count: urgentCountRaw, error: urgentCountError } = await urgentQuery
  if (urgentCountError) {
    console.error('[getPlatformChargebacks:urgentCount] Error:', urgentCountError)
  }

  return {
    data: rows.map((row) => mapDbRowToChargeback(row, merchantNameById, paymentById, orderById)),
    total: count || 0,
    pendingCount: pendingCountRaw || 0,
    urgentCount: urgentCountRaw || 0,
  }
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
  const { userId, role } = await assertHQPermission('hq.merchant.transactions')
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
  const scopedMerchantIds = applyMerchantScope(filters?.merchantIds, merchantScope)
  const scopedFilters =
    scopedMerchantIds === undefined ? filters : { ...(filters ?? {}), merchantIds: scopedMerchantIds }

  if (scopedMerchantIds !== undefined && scopedMerchantIds.length === 0) {
    return {
      totalTransactions: 0,
      capturedTransactions: 0,
      authorizedTransactions: 0,
      refundedTransactions: 0,
      totalRevenue: 0,
      totalTips: 0,
      averageTicket: 0,
    }
  }

  const batchSize = 1000
  let offset = 0
  let source: 'rpc' | 'view' | 'legacy' = 'rpc'

  let totalTransactions = 0
  let capturedTransactions = 0
  let authorizedTransactions = 0
  let refundedTransactions = 0
  let totalRevenue = 0
  let totalTips = 0

  while (true) {
    let rows: PlatformTransaction[] = []

    if (source === 'rpc') {
      const fromRpc = await getPlatformTransactionsFromRpc(batchSize, offset, scopedFilters)
      if (fromRpc.errorCode) {
        console.warn(
          `[getPlatformTransactionStats] Falling back from rpc due to error (${fromRpc.errorCode}).`
        )
        source = USE_PLATFORM_TX_VIEW ? 'view' : 'legacy'
        continue
      }
      rows = fromRpc.data
    } else if (source === 'view') {
      const fromView = await getPlatformTransactionsFromView(batchSize, offset, scopedFilters)
      if (fromView.errorCode) {
        console.warn(
          `[getPlatformTransactionStats] Falling back to legacy query path due to view error (${fromView.errorCode}).`
        )
        source = 'legacy'
        continue
      }
      rows = fromView.data
    } else {
      const fromLegacy = await getPlatformTransactionsLegacy(batchSize, offset, scopedFilters)
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

export interface PlatformTransactionOrderItemModifier {
  id: string
  modifier_group_name?: string
  modifier_name?: string
  quantity: number
  price_modifier: number
  total_price: number
}

export interface PlatformTransactionOrderItem {
  id: string
  item_name: string
  size_name?: string
  quantity: number
  unit_price: number
  subtotal: number
  tax?: number
  discount?: number
  is_voided: boolean
  void_reason?: string
  is_open_item: boolean
  is_tax_exempt: boolean
  modifiers: PlatformTransactionOrderItemModifier[]
}

export interface PlatformTransactionOrderDiscount {
  id: string
  discount_name?: string
  discount_type?: string
  discount_value?: number
  amount: number
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

export interface PlatformTransactionSegment {
  id: string
  payment_method: string
  status: string
  amount: number
  tip_amount: number
  total_amount: number
  card_type?: string
  card_last_four?: string
  authorization_code?: string
  reference_number?: string
  transaction_id?: string
  terminal_type?: string
  terminal_id?: string
  card_entry_mode?: string
  batch_number?: string
  invoice_number?: string
  split_sequence?: number
  is_split_payment?: boolean
  is_voided: boolean
  void_reason?: string
  voided_at?: string
  voided_by?: string
  is_returned?: boolean
  return_amount?: number
  return_reason?: string
  returned_at?: string
  returned_by?: string
  refunded_amount?: number
  refund_reason?: string
  refunded_at?: string
  original_tip_amount?: number
  tip_adjusted_at?: string
  tip_adjusted_by?: string
  initiated_at?: string
  authorized_at?: string
  captured_at?: string
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
  returned_by?: string
  is_returned?: boolean
  is_voided: boolean
  void_reason?: string
  voided_by?: string
  original_tip_amount?: number
  tip_adjusted_at?: string
  tip_adjusted_by?: string
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
  order_items_full: PlatformTransactionOrderItem[]
  order_discounts: PlatformTransactionOrderDiscount[]
  payment_events: PlatformTransactionPaymentEvent[]
  payment_segments: PlatformTransactionSegment[]
}

function mapRpcPaymentEvent(event: any, fallbackId: string): PlatformTransactionPaymentEvent {
  const timestamp =
    event?.event_timestamp ||
    event?.created_at ||
    event?.occurred_at ||
    event?.event_at ||
    event?.timestamp ||
    undefined

  return {
    id: String(event?.id || fallbackId),
    event_type: event?.event_type || event?.type || event?.action || 'event',
    previous_status: event?.previous_status || event?.from_status || event?.old_status || undefined,
    new_status: event?.new_status || event?.to_status || event?.status || undefined,
    timestamp,
    terminal_id: event?.terminal_id || event?.device_id || undefined,
    result_code: event?.result_code || event?.response_code || event?.code || undefined,
    response_message:
      event?.response_message || event?.result_message || event?.message || event?.error_message || undefined,
    raw_response: asRecord(event?.raw_response || event?.processor_response || event?.response_json || event?.payload),
  }
}

function mapRpcSegment(segment: any, index: number): PlatformTransactionSegment {
  const processorResponse = asRecord(segment?.processor_response)
  const segmentEntry = [
    segment?.card_entry_mode,
    processorResponse?.entry_type,
    processorResponse?.entryType,
    processorResponse?.entry_mode,
    processorResponse?.entryMode,
  ].find((value) => typeof value === 'string') as string | undefined

  const splitSequence =
    segment?.split_sequence !== null && segment?.split_sequence !== undefined
      ? Number(segment.split_sequence)
      : segment?.split_index !== null && segment?.split_index !== undefined
        ? Number(segment.split_index)
        : segment?.split_portion_index !== null && segment?.split_portion_index !== undefined
          ? Number(segment.split_portion_index)
          : index + 1

  return {
    id: String(segment?.id || `segment-${index + 1}`),
    payment_method: segment?.payment_method || 'unknown',
    status: segment?.status || 'unknown',
    amount: Number(segment?.amount || 0),
    tip_amount: Number(segment?.tip_amount || 0),
    total_amount: Number(segment?.total_amount || 0),
    card_type: segment?.card_type || undefined,
    card_last_four: segment?.card_last_four || undefined,
    authorization_code: segment?.authorization_code || segment?.auth_code || undefined,
    reference_number: segment?.reference_number || undefined,
    transaction_id: segment?.transaction_id || undefined,
    terminal_type: segment?.terminal_type || undefined,
    terminal_id: segment?.terminal_id || undefined,
    card_entry_mode: segmentEntry,
    batch_number: segment?.batch_number || segment?.dejavoo_batch_number || undefined,
    invoice_number: segment?.invoice_number || segment?.dejavoo_invoice_number || undefined,
    split_sequence: splitSequence,
    is_split_payment:
      segment?.is_split_payment ??
      (segment?.split_total !== null && segment?.split_total !== undefined
        ? Number(segment.split_total) > 1
        : undefined),
    is_voided: toBoolean(segment?.is_voided),
    void_reason: segment?.void_reason || undefined,
    voided_at: segment?.voided_at || undefined,
    voided_by: segment?.voided_by || undefined,
    is_returned: segment?.is_returned ?? (segment?.returned_at ? true : undefined),
    return_amount: segment?.return_amount !== null ? Number(segment?.return_amount) : undefined,
    return_reason: segment?.return_reason || undefined,
    returned_at: segment?.returned_at || undefined,
    returned_by: segment?.returned_by || undefined,
    refunded_amount: segment?.refunded_amount !== null ? Number(segment?.refunded_amount) : undefined,
    refund_reason: segment?.refund_reason || undefined,
    refunded_at: segment?.refunded_at || undefined,
    original_tip_amount: segment?.original_tip_amount !== null ? Number(segment?.original_tip_amount) : undefined,
    tip_adjusted_at: segment?.tip_adjusted_at || undefined,
    tip_adjusted_by: segment?.tip_adjusted_by || undefined,
    initiated_at: segment?.initiated_at || undefined,
    authorized_at: segment?.authorized_at || undefined,
    captured_at: segment?.captured_at || undefined,
  }
}

async function getPlatformTransactionDetailsFromRpc(
  transactionId: string
): Promise<{ data: PlatformTransactionDetails | null; errorCode?: string }> {
  const supabase = createServerSupabaseClient()

  const { data: paymentLookup, error: paymentLookupError } = await supabase
    .from('order_payments')
    .select('id, order_id')
    .eq('id', transactionId)
    .single()

  if (paymentLookupError || !paymentLookup) {
    if (paymentLookupError) {
      console.error('[getPlatformTransactionDetails:rpc:lookup] Error:', paymentLookupError)
      return { data: null, errorCode: paymentLookupError.code }
    }
    return { data: null }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('get_admin_transaction_detail', {
    p_order_id: paymentLookup.order_id,
  })

  if (rpcError) {
    console.error('[getPlatformTransactionDetails:rpc] Error:', rpcError)
    return { data: null, errorCode: rpcError.code }
  }

  if (!rpcData) return { data: null }

  const payload = asRecord(rpcData) as PlatformTransactionDetailsRpcPayload | null
  if (!payload) return { data: null, errorCode: 'INVALID_RPC_PAYLOAD' }

  const order = (asRecord(payload.order) || {}) as any
  const payments = asArray<any>(payload.payments)
  const orderItemsAll = asArray<any>(payload.order_items)
  const orderDiscountsRaw = asArray<any>(payload.order_discounts)

  if (payments.length === 0) {
    return { data: null }
  }

  const selectedPayment = payments.find((payment) => String(payment?.id || '') === transactionId) || payments[0]
  const selectedSettlement = asRecord(selectedPayment?.settlement) || null
  const processorResponse = asRecord(selectedPayment?.processor_response)

  const entryFromProcessor = [
    selectedPayment?.card_entry_mode,
    processorResponse?.entry_type,
    processorResponse?.entryType,
    processorResponse?.entry_mode,
    processorResponse?.entryMode,
  ].find((value) => typeof value === 'string') as string | undefined

  const primaryEvents = asArray<any>(selectedPayment?.payment_events)
  const fallbackEvents = payments.flatMap((payment, paymentIndex) =>
    asArray<any>(payment?.payment_events).map((event: any, eventIndex: number) => ({
      ...event,
      _fallback_id: `${payment?.id || transactionId}-event-${paymentIndex}-${eventIndex}`,
    }))
  )
  const paymentEventsSource = primaryEvents.length > 0 ? primaryEvents : fallbackEvents
  const paymentEvents = paymentEventsSource.map((event: any, index: number) =>
    mapRpcPaymentEvent(event, String(event?._fallback_id || `${transactionId}-event-${index}`))
  )

  const paymentSegments = payments.map((segment, index) => mapRpcSegment(segment, index))

  const paidItems = asArray<any>(selectedPayment?.items_paid).map((item: any, index: number) => {
    const nestedItem = asRecord(item?.item) || null
    return {
      id: String(item?.id || `${transactionId}-paid-${index}`),
      order_item_id: item?.order_item_id || undefined,
      item_name: (nestedItem?.item_name as string | undefined) || item?.item_name || undefined,
      quantity_paid: Number(item?.quantity_paid || 0),
      unit_price_paid: Number(item?.unit_price_paid || 0),
      subtotal_paid: Number(item?.subtotal_paid || 0),
      tax_paid: Number(item?.tax_paid || 0),
    }
  })

  const items = orderItemsAll.map((item: any, index: number) => ({
    id: String(item?.id || `${paymentLookup.order_id}-item-${index}`),
    item_name: item?.item_name || 'Item',
    quantity: Number(item?.quantity || 0),
    unit_price: Number(item?.unit_price || 0),
    subtotal: Number(item?.subtotal || 0),
    special_instructions: item?.special_instructions || undefined,
  }))

  const orderItemsFull = orderItemsAll.map((item: any, index: number) => {
    const metadata = asRecord(item?.metadata)
    const taxValue = item?.tax_amount ?? item?.tax_paid ?? item?.tax ?? metadata?.tax_amount ?? undefined
    const discountValue =
      item?.discount_amount ?? item?.discount ?? metadata?.discount_amount ?? undefined
    const taxExemptFlag =
      item?.is_tax_exempt ??
      item?.effective_is_tax_exempt ??
      metadata?.is_tax_exempt ??
      metadata?.tax_exempt ??
      false
    const openItemFlag =
      item?.is_open_item ??
      metadata?.is_open_item ??
      metadata?.open_item ??
      (item?.menu_item_id === null && item?.location_exclusive_item_id === null)

    return {
      id: String(item?.id || `${paymentLookup.order_id}-full-item-${index}`),
      item_name: item?.item_name || 'Item',
      size_name: item?.selected_size_name || undefined,
      quantity: Number(item?.quantity || 0),
      unit_price: Number(item?.unit_price || 0),
      subtotal: Number(item?.subtotal || 0),
      tax: taxValue !== null && taxValue !== undefined ? Number(taxValue) : undefined,
      discount: discountValue !== null && discountValue !== undefined ? Number(discountValue) : undefined,
      is_voided: toBoolean(item?.is_voided),
      void_reason: item?.void_reason || undefined,
      is_open_item: toBoolean(openItemFlag),
      is_tax_exempt: toBoolean(taxExemptFlag),
      modifiers: asArray<any>(item?.modifiers).map((modifier: any, modifierIndex: number) => ({
        id: String(modifier?.id || `${item?.id || index}-modifier-${modifierIndex}`),
        modifier_group_name: modifier?.modifier_group_name || undefined,
        modifier_name: modifier?.modifier_name || undefined,
        quantity: Number(modifier?.quantity || 1),
        price_modifier: Number(modifier?.price_modifier || 0),
        total_price: Number(modifier?.total_price || 0),
      })),
    }
  })

  const orderDiscounts = orderDiscountsRaw.map((discount: any, index: number) => ({
    id: String(discount?.id || `${paymentLookup.order_id}-discount-${index}`),
    discount_name: discount?.discount_name || discount?.name || undefined,
    discount_type: discount?.discount_type || undefined,
    discount_value:
      discount?.discount_value !== null && discount?.discount_value !== undefined
        ? Number(discount.discount_value)
        : undefined,
    amount: Number(discount?.calculated_amount || discount?.amount || discount?.discount_amount || 0),
  }))

  const splitSequence =
    selectedPayment?.split_sequence !== null && selectedPayment?.split_sequence !== undefined
      ? Number(selectedPayment.split_sequence)
      : selectedPayment?.split_index !== null && selectedPayment?.split_index !== undefined
        ? Number(selectedPayment.split_index)
        : selectedPayment?.split_portion_index !== null && selectedPayment?.split_portion_index !== undefined
          ? Number(selectedPayment.split_portion_index)
          : undefined

  const data: PlatformTransactionDetails = {
    id: String(selectedPayment?.id || transactionId),
    order_id: String(selectedPayment?.order_id || order?.id || paymentLookup.order_id),
    order_number: order?.order_number || undefined,
    display_number: order?.display_number || undefined,
    merchant_id: String(selectedPayment?.merchant_id || order?.merchant_id || ''),
    merchant_name: order?.merchant_name || 'Unknown',
    location_id: selectedPayment?.location_id || order?.location_id || undefined,
    location_name: order?.location_name || undefined,
    customer_name: order?.customer_name || undefined,
    customer_phone: order?.customer_phone || undefined,
    customer_email: order?.customer_email || undefined,
    order_type: order?.order_type || undefined,
    order_status: order?.status || undefined,
    payment_status: order?.payment_status || undefined,
    table_number: order?.table_number || undefined,
    staff_name: selectedPayment?.staff_name || order?.staff_name || undefined,
    notes: order?.special_instructions || order?.internal_notes || undefined,
    payment_method: selectedPayment?.payment_method || 'unknown',
    status: selectedPayment?.status || 'unknown',
    amount: Number(selectedPayment?.amount || 0),
    tip_amount: Number(selectedPayment?.tip_amount || 0),
    total_amount: Number(selectedPayment?.total_amount || 0),
    order_subtotal: Number(order?.subtotal || 0),
    order_tax_amount: Number(order?.tax_amount || 0),
    order_tip_amount: Number(order?.tip_amount || 0),
    order_discount_amount: Number(order?.discount_amount || 0),
    order_service_charge: Number(order?.service_charge || 0),
    order_total_amount: Number(order?.total_amount || 0),
    card_type: selectedPayment?.card_type || undefined,
    card_last_four: selectedPayment?.card_last_four || undefined,
    authorization_code: selectedPayment?.authorization_code || selectedPayment?.auth_code || undefined,
    reference_number: selectedPayment?.reference_number || undefined,
    transaction_id: selectedPayment?.transaction_id || undefined,
    processor_name: selectedPayment?.processor_name || undefined,
    terminal_id: selectedPayment?.terminal_id || undefined,
    terminal_type: selectedPayment?.terminal_type || undefined,
    device_id: selectedPayment?.device_id || undefined,
    card_entry_mode: selectedPayment?.card_entry_mode || entryFromProcessor || undefined,
    dejavoo_response_code: selectedPayment?.dejavoo_response_code || selectedPayment?.result_code || undefined,
    batch_number: selectedPayment?.batch_number || selectedPayment?.dejavoo_batch_number || undefined,
    invoice_number: selectedPayment?.invoice_number || selectedPayment?.dejavoo_invoice_number || undefined,
    is_split_payment:
      selectedPayment?.is_split_payment ??
      (selectedPayment?.split_total !== null && selectedPayment?.split_total !== undefined
        ? Number(selectedPayment.split_total) > 1
        : undefined),
    split_sequence: splitSequence,
    settled_at: selectedPayment?.settled_at || (selectedSettlement as any)?.settled_at || undefined,
    settlement_batch_id:
      selectedPayment?.settlement_batch_id || (selectedSettlement as any)?.settlement_batch_id || undefined,
    gateway_fee: selectedPayment?.gateway_fee !== null ? Number(selectedPayment?.gateway_fee) : undefined,
    original_amount: selectedPayment?.original_amount !== null ? Number(selectedPayment?.original_amount) : undefined,
    refunded_amount: selectedPayment?.refunded_amount !== null ? Number(selectedPayment?.refunded_amount) : undefined,
    refund_reason: selectedPayment?.refund_reason || undefined,
    return_amount: selectedPayment?.return_amount !== null ? Number(selectedPayment?.return_amount) : undefined,
    return_reason: selectedPayment?.return_reason || undefined,
    returned_by: selectedPayment?.returned_by || undefined,
    is_returned: selectedPayment?.is_returned ?? (selectedPayment?.returned_at ? true : undefined),
    is_voided: toBoolean(selectedPayment?.is_voided),
    void_reason: selectedPayment?.void_reason || undefined,
    voided_by: selectedPayment?.voided_by || undefined,
    original_tip_amount:
      selectedPayment?.original_tip_amount !== null ? Number(selectedPayment?.original_tip_amount) : undefined,
    tip_adjusted_at: selectedPayment?.tip_adjusted_at || undefined,
    tip_adjusted_by: selectedPayment?.tip_adjusted_by || undefined,
    error_code: selectedPayment?.error_code || undefined,
    error_message: selectedPayment?.error_message || undefined,
    created_at:
      selectedPayment?.captured_at ||
      selectedPayment?.initiated_at ||
      order?.created_at ||
      new Date(0).toISOString(),
    initiated_at: selectedPayment?.initiated_at || undefined,
    authorized_at: selectedPayment?.authorized_at || undefined,
    approved_at: selectedPayment?.approved_at || undefined,
    captured_at: selectedPayment?.captured_at || undefined,
    refunded_at: selectedPayment?.refunded_at || undefined,
    returned_at: selectedPayment?.returned_at || undefined,
    voided_at: selectedPayment?.voided_at || undefined,
    failed_at: selectedPayment?.failed_at || undefined,
    completed_at: order?.completed_at || undefined,
    emv_data: asRecord(selectedPayment?.emv_data),
    processor_response: processorResponse,
    metadata: asRecord(selectedPayment?.metadata) || undefined,
    items,
    paid_items: paidItems,
    order_items_full: orderItemsFull,
    order_discounts: orderDiscounts,
    payment_events: paymentEvents,
    payment_segments: paymentSegments,
  }

  return { data }
}

export async function getPlatformTransactionDetails(
  transactionId: string
): Promise<PlatformTransactionDetails | null> {
  await assertHQPermission('hq.merchant.transactions')

  const auditTransactionId = normalizeAuditUuid(transactionId)

  try {
    const fromRpc = await getPlatformTransactionDetailsFromRpc(transactionId)
    if (!fromRpc.errorCode) {
      void logPlatformPaymentAuditEvent({
        action: 'view_payment_detail',
        resourceType: 'order_payment',
        resourceId: auditTransactionId,
        merchantId: normalizeAuditUuid(fromRpc.data?.merchant_id),
        locationId: normalizeAuditUuid(fromRpc.data?.location_id),
        fieldsAccessed: AUDIT_LOG_FIELDS_TRANSACTION_DETAIL,
        success: Boolean(fromRpc.data),
        errorMessage: fromRpc.data ? undefined : 'Transaction detail not found',
      })
      return fromRpc.data
    }

    console.warn(
      `[getPlatformTransactionDetails] Falling back to legacy query path due to rpc error (${fromRpc.errorCode}).`
    )

    const fromLegacy = await getPlatformTransactionDetailsLegacy(transactionId, true)
    void logPlatformPaymentAuditEvent({
      action: 'view_payment_detail',
      resourceType: 'order_payment',
      resourceId: auditTransactionId,
      merchantId: normalizeAuditUuid(fromLegacy?.merchant_id),
      locationId: normalizeAuditUuid(fromLegacy?.location_id),
      fieldsAccessed: AUDIT_LOG_FIELDS_TRANSACTION_DETAIL,
      success: Boolean(fromLegacy),
      errorMessage: fromLegacy ? undefined : `Transaction detail fallback failed (${fromRpc.errorCode})`,
    })
    return fromLegacy
  } catch (error) {
    void logPlatformPaymentAuditEvent({
      action: 'view_payment_detail',
      resourceType: 'order_payment',
      resourceId: auditTransactionId,
      fieldsAccessed: AUDIT_LOG_FIELDS_TRANSACTION_DETAIL,
      success: false,
      errorMessage: normalizeAuditErrorMessage(error),
    })
    throw error
  }
}

async function getPlatformTransactionDetailsLegacy(
  transactionId: string,
  skipPermissionCheck: boolean = false
): Promise<PlatformTransactionDetails | null> {
  if (!skipPermissionCheck) {
    await assertHQPermission('hq.merchant.transactions')
  }

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
          *,
          order_item_modifiers(*)
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

  let orderDiscounts: PlatformTransactionOrderDiscount[] = []
  const { data: discountsData, error: discountsError } = await supabase
    .from('order_discounts')
    .select('*')
    .eq('order_id', data.order_id)
    .order('created_at', { ascending: true })

  if (discountsError) {
    // Backward compatibility for environments where order_discounts is not provisioned yet.
    if (discountsError.code !== 'PGRST205' && discountsError.code !== '42P01') {
      console.error('[getPlatformTransactionDetails:order_discounts] Error:', discountsError)
    }
  } else {
    orderDiscounts = (discountsData ?? []).map((discount: any, index: number) => ({
      id: discount.id || `${data.order_id}-discount-${index}`,
      discount_name: discount.discount_name || discount.name || undefined,
      discount_type: discount.discount_type || undefined,
      discount_value:
        discount.discount_value !== null && discount.discount_value !== undefined
          ? Number(discount.discount_value)
          : undefined,
      amount: Number(discount.amount || discount.discount_amount || 0),
    }))
  }

  const { data: segmentRows, error: segmentsError } = await supabase
    .from('order_payments')
    .select('*')
    .eq('order_id', data.order_id)
    .order('initiated_at', { ascending: true })

  if (segmentsError) {
    console.error('[getPlatformTransactionDetails:segments] Error:', segmentsError)
  }

  const paymentSegments: PlatformTransactionSegment[] = (segmentRows ?? []).map((segment: any) => {
    const segmentProcessorResponse =
      segment.processor_response && typeof segment.processor_response === 'object'
        ? (segment.processor_response as Record<string, unknown>)
        : null
    const segmentEntry = [
      segment.card_entry_mode,
      segmentProcessorResponse?.entry_type,
      segmentProcessorResponse?.entryType,
      segmentProcessorResponse?.entry_mode,
      segmentProcessorResponse?.entryMode,
    ].find((value) => typeof value === 'string') as string | undefined

    const splitSequence =
      segment.split_sequence !== null && segment.split_sequence !== undefined
        ? Number(segment.split_sequence)
        : segment.split_index !== null && segment.split_index !== undefined
          ? Number(segment.split_index)
          : segment.split_portion_index !== null && segment.split_portion_index !== undefined
            ? Number(segment.split_portion_index)
            : undefined

    return {
      id: segment.id,
      payment_method: segment.payment_method || 'unknown',
      status: segment.status || 'unknown',
      amount: Number(segment.amount || 0),
      tip_amount: Number(segment.tip_amount || 0),
      total_amount: Number(segment.total_amount || 0),
      card_type: segment.card_type || undefined,
      card_last_four: segment.card_last_four || undefined,
      authorization_code: segment.authorization_code || undefined,
      reference_number: segment.reference_number || undefined,
      transaction_id: segment.transaction_id || undefined,
      terminal_type: segment.terminal_type || undefined,
      terminal_id: segment.terminal_id || undefined,
      card_entry_mode: segmentEntry,
      batch_number: segment.batch_number || segment.dejavoo_batch_number || undefined,
      invoice_number: segment.invoice_number || segment.dejavoo_invoice_number || undefined,
      split_sequence: splitSequence,
      is_split_payment:
        segment.is_split_payment ?? (
          segment.split_total !== null &&
          segment.split_total !== undefined &&
          Number(segment.split_total) > 1
            ? true
            : undefined
        ),
      is_voided: Boolean(segment.is_voided),
      void_reason: segment.void_reason || undefined,
      voided_at: segment.voided_at || undefined,
      voided_by: segment.voided_by || undefined,
      is_returned: segment.is_returned ?? (segment.returned_at ? true : undefined),
      return_amount: segment.return_amount !== null ? Number(segment.return_amount) : undefined,
      return_reason: segment.return_reason || undefined,
      returned_at: segment.returned_at || undefined,
      returned_by: segment.returned_by || undefined,
      refunded_amount: segment.refunded_amount !== null ? Number(segment.refunded_amount) : undefined,
      refund_reason: segment.refund_reason || undefined,
      refunded_at: segment.refunded_at || undefined,
      original_tip_amount:
        segment.original_tip_amount !== null ? Number(segment.original_tip_amount) : undefined,
      tip_adjusted_at: segment.tip_adjusted_at || undefined,
      tip_adjusted_by: segment.tip_adjusted_by || undefined,
      initiated_at: segment.initiated_at || undefined,
      authorized_at: segment.authorized_at || undefined,
      captured_at: segment.captured_at || undefined,
    }
  })

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
    returned_by: data.returned_by || undefined,
    is_returned: data.is_returned ?? (data.returned_at ? true : undefined),
    is_voided: Boolean(data.is_voided),
    void_reason: data.void_reason || undefined,
    voided_by: data.voided_by || undefined,
    original_tip_amount: data.original_tip_amount !== null ? Number(data.original_tip_amount) : undefined,
    tip_adjusted_at: data.tip_adjusted_at || undefined,
    tip_adjusted_by: data.tip_adjusted_by || undefined,
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
    order_items_full: (order.order_items || []).map((item: any) => {
      const metadata = item.metadata && typeof item.metadata === 'object'
        ? (item.metadata as Record<string, unknown>)
        : null
      const taxValue =
        item.tax_amount ??
        item.tax_paid ??
        item.tax ??
        metadata?.tax_amount ??
        undefined
      const discountValue =
        item.discount_amount ??
        item.discount ??
        metadata?.discount_amount ??
        undefined
      const taxExemptFlag =
        item.is_tax_exempt ??
        item.effective_is_tax_exempt ??
        metadata?.is_tax_exempt ??
        metadata?.tax_exempt ??
        false
      const openItemFlag =
        metadata?.is_open_item ??
        metadata?.open_item ??
        (item.menu_item_id === null && item.location_exclusive_item_id === null)

      return {
        id: item.id,
        item_name: item.item_name || 'Item',
        size_name: item.selected_size_name || undefined,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        subtotal: Number(item.subtotal || 0),
        tax:
          taxValue !== null && taxValue !== undefined
            ? Number(taxValue)
            : undefined,
        discount:
          discountValue !== null && discountValue !== undefined
            ? Number(discountValue)
            : undefined,
        is_voided: toBoolean(item.is_voided),
        void_reason: item.void_reason || undefined,
        is_open_item: toBoolean(openItemFlag),
        is_tax_exempt: toBoolean(taxExemptFlag),
        modifiers: (item.order_item_modifiers || []).map((modifier: any) => ({
          id: modifier.id,
          modifier_group_name: modifier.modifier_group_name || undefined,
          modifier_name: modifier.modifier_name || undefined,
          quantity: Number(modifier.quantity || 1),
          price_modifier: Number(modifier.price_modifier || 0),
          total_price: Number(modifier.total_price || 0),
        })),
      }
    }),
    order_discounts: orderDiscounts,
    payment_events: paymentEvents,
    payment_segments: paymentSegments,
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
  const { userId, role } = await assertHQPermission('hq.merchant.view')
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('merchants')
    .select('id, name')
    .order('name')

  if (merchantScope !== null) {
    if (merchantScope.length === 0) return []
    query = query.in('id', merchantScope)
  }

  const { data, error } = await query

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
  const { userId, role } = await assertHQPermission('hq.merchant.view')
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
  const effectiveMerchantIds = applyMerchantScope(merchantIds, merchantScope)

  if (effectiveMerchantIds !== undefined && effectiveMerchantIds.length === 0) {
    return []
  }

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('locations')
    .select('id, name, merchant_id')
    .order('name')

  if (effectiveMerchantIds && effectiveMerchantIds.length > 0) {
    query = query.in('merchant_id', effectiveMerchantIds)
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
  const { userId, role } = await assertHQPermission('hq.merchant.view')
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
  const effectiveMerchantIds = applyMerchantScope(merchantIds, merchantScope)

  if (effectiveMerchantIds !== undefined && effectiveMerchantIds.length === 0) {
    return []
  }

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

  if (effectiveMerchantIds && effectiveMerchantIds.length > 0) {
    query = query.in('merchant_id', effectiveMerchantIds)
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
