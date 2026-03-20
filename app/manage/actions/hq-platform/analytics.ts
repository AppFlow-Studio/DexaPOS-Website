'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

// ============================================================================
// TYPES
// ============================================================================

export interface PlatformKPIs {
  // Revenue (30d vs prior 30d)
  totalGPV30d: number
  prevGPV30d: number
  gpvChange: number // percentage change
  // Orders (30d vs prior 30d)
  totalOrders30d: number
  prevOrders30d: number
  ordersChange: number
  // Merchants
  totalMerchants: number
  activeMerchants7d: number
  newMerchantsThisMonth: number
  merchantsOnboarding: number
  // Platform Health
  activeDevices: number
  totalLocations: number
  voidRate: number // percentage
  avgOrderValue: number
  // Payment mix
  cashPercent: number
  cardPercent: number
  // Legacy aliases kept for backward compatibility
  totalRevenue: number
  activeAccounts: number
  growthRate: number
  revenueChange: string
  merchantChange: string
  activeChange: string
  growthChange: string
}

export interface PlatformSalesTrend {
  date: string          // current period date (YYYY-MM-DD)
  revenue: number       // current period GPV
  prevRevenue: number   // prior period GPV (shifted by 30d for overlay)
  orderCount: number    // current period order count
  prevOrderCount: number // prior period order count
  merchants: number     // unique active merchants on this day
}

export interface PlatformTopMerchant {
  id: string
  name: string
  revenue: number
  transactions: number
  growth: number
}

export interface GPVConcentrationPoint {
  merchantPercentile: number
  gpvPercentile: number
  equalityLine: number
  merchantCount: number
}

export type ConcentrationRisk = 'low' | 'medium' | 'high'

export interface WhaleListMerchant {
  id: string
  name: string
  monthlyGPV: number
  percentOfTotal: number
  transactions: number
  locationCount: number
  trend: number | null
  accountManager: string | null
}

export interface GPVConcentrationData {
  lorenzCurve: GPVConcentrationPoint[]
  topTenPercentGPVShare: number
  riskLevel: ConcentrationRisk
  whaleList: WhaleListMerchant[]
  totalGPV: number
  totalMerchants: number
  averageGPV: number
  medianGPV: number
  periodDays: number
}

// ============================================================================
// TICKET-003: LANDI Device Stability Index Types
// ============================================================================

export interface VersionStabilityBar {
  version: string
  healthy: number
  degraded: number    // online but low battery/RAM/storage
  unhealthy: number
  total: number
  instabilityRate: number // percentage (unhealthy only — degraded is a warning, not instability)
}

export interface HardwareModelBreakdown {
  model: string
  healthy: number
  degraded: number    // online but low battery/RAM/storage
  unhealthy: number
  total: number
  instabilityRate: number
  deviceCount: number
}

export interface VersionDrillDown {
  version: string
  models: HardwareModelBreakdown[]
  totalDevices: number
  overallInstabilityRate: number
}

export interface DeviceStabilityData {
  versionBars: VersionStabilityBar[]
  totalDevices: number
  totalHeartbeats: number
  overallInstabilityRate: number
  rolloutWarning: string | null // e.g. "v2.1.9 has 2.3% instability — do not roll out v2.2.0"
  periodDays: number
}

// ============================================================================
// TICKET-004: Terminal Utilization Heatmap Types
// ============================================================================

export type UtilizationTier = 'healthy' | 'underutilized' | 'critical'

/** A single station (tablet) with its usage data */
export interface StationUtilization {
  stationId: string
  stationName: string
  stationType: string
  locationId: string
  merchantId: string
  totalOrders: number          // in the period
  activeDays: number           // days with ≥1 txn
  lastTransactionAt: string | null
  daysSinceLastTxn: number | null
  isZombie: boolean            // no txn in ≥30 days
  avgOrdersPerActiveDay: number
}

/** Per-merchant summary */
export interface MerchantTerminalUtilization {
  merchantId: string
  merchantName: string
  totalStations: number
  activeStations: number       // stations with ≥1 txn/day average
  zombieStations: number       // stations with no txn in ≥30 days
  utilizationRate: number      // pct: activeStations / totalStations * 100
  tier: UtilizationTier
  stations: StationUtilization[]
  totalOrders: number
  reclaimableStations: number  // zombie stations that could be reclaimed
}

/** Top-level response */
export interface TerminalUtilizationData {
  merchants: MerchantTerminalUtilization[]
  summary: {
    totalMerchants: number
    totalStations: number
    totalActiveStations: number
    totalZombieStations: number
    overallUtilizationRate: number
    underutilizedMerchantCount: number  // utilization < 50%
    criticalMerchantCount: number       // utilization < 25%
    totalReclaimableStations: number
    /** Zombie tablets × HARDWARE_COST_PER_UNIT. Used for the wasted-value insight card. */
    estimatedWastedHardwareValue: number
    /** The assumed per-unit cost used (exposed so the UI can show the assumption). */
    hardwareCostPerUnit: number
  }
  periodDays: number
}

export type ChurnSeverity = 'critical' | 'high' | 'medium'

export interface ChurnWarningMerchant {
  id: string
  name: string
  lastSevenDaysGPV: number
  prevSevenDaysGPV: number
  dropPercentage: number
  severity: ChurnSeverity
  lastOrderDate: string
  transactionsLast7Days: number
  transactionsPrev7Days: number
}

export interface ChurnWarningData {
  atRiskMerchants: ChurnWarningMerchant[]
  totalAtRisk: number
  criticalCount: number
  highCount: number
  mediumCount: number
  totalGPVAtRisk: number
}

export interface PlatformAuditLogFilters {
  search?: string
  actionCategory?: string
  severity?: string
  actor?: string
  merchantIds?: string[]
  dateFrom?: string
  dateTo?: string
  status?: 'success' | 'failed'
  resourceType?: string
  /** Filter to rows that have a non-null error_message */
  hasError?: boolean
}

export interface PlatformAuditLogRow {
  id: string
  created_at: string
  actor_user_id?: string
  actor_email?: string
  actor_name?: string
  actor_role?: string
  action: string
  action_category?: string
  severity?: string
  resource_type?: string
  resource_id?: string
  resource_name?: string
  status?: string
  error_message?: string
  merchant_id?: string
  merchant_name?: string
  location_id?: string
  location_name?: string
  organization_type?: string
  organization_name?: string
  changes?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export interface PlatformAuditLogsResult {
  data: PlatformAuditLogRow[]
  total: number
}

export interface PlatformAuditLogsExportResult {
  data: PlatformAuditLogRow[]
  total: number
  cap: number
  capped: boolean
}

async function getAssignedMerchantScope(
  userId: string,
  roleCode?: string | null
): Promise<string[] | null> {
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
    console.error('[getAssignedMerchantScope:analytics] Error:', error)
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

// ============================================================================
// PLATFORM ACTIONS
// ============================================================================

/**
 * Get platform-wide KPIs for the main dashboard (TICKET-005)
 * All metrics derived from real DB data — no mocked values.
 */
export async function getPlatformKPIs(): Promise<PlatformKPIs> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 30)
  const sixtyDaysAgo = new Date(now)
  sixtyDaysAgo.setDate(now.getDate() - 60)
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(now.getDate() - 7)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)

  // Run all non-dependent queries in parallel
  const [
    currentOrdersRes,
    prevOrdersRes,
    allOrders30dRes,
    activeMerchantsRes,
    totalMerchantsRes,
    activeDevicesRes,
    totalLocationsRes,
    newMerchantsRes,
    onboardingRes,
    paymentMethodsRes,
  ] = await Promise.all([
    // Current 30d completed orders (for GPV + order count + avg value)
    supabase
      .from('orders')
      .select('total_amount')
      .not('status', 'in', '(draft,cancelled,void)')
      .gte('created_at', thirtyDaysAgo.toISOString()),
    // Prior 30d completed orders (for period-over-period change)
    supabase
      .from('orders')
      .select('total_amount')
      .not('status', 'in', '(draft,cancelled,void)')
      .gte('created_at', sixtyDaysAgo.toISOString())
      .lt('created_at', thirtyDaysAgo.toISOString()),
    // All 30d orders including voided — for void rate
    supabase
      .from('orders')
      .select('status')
      .not('status', 'in', '(draft,cancelled)')
      .gte('created_at', thirtyDaysAgo.toISOString()),
    // Active merchant IDs (≥1 txn in last 7d)
    supabase
      .from('orders')
      .select('merchant_id')
      .not('status', 'in', '(draft,cancelled,void)')
      .gte('created_at', sevenDaysAgo.toISOString()),
    // Total merchants count
    supabase
      .from('merchants')
      .select('*', { count: 'exact', head: true }),
    // Active devices (is_online=true with heartbeat in last 10 min)
    supabase
      .from('stations')
      .select('*', { count: 'exact', head: true })
      .eq('is_online', true)
      .gte('last_heartbeat_at', tenMinutesAgo.toISOString()),
    // Total active locations
    supabase
      .from('locations')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),
    // New merchants created this calendar month
    supabase
      .from('merchants')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString()),
    // Merchants currently in onboarding
    supabase
      .from('merchants')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'onboarding'),
    // Payment method split (30d) — for cash vs card %
    supabase
      .from('order_payments')
      .select('payment_method, amount')
      .gte('created_at', thirtyDaysAgo.toISOString()),
  ])

  // --- Revenue metrics ---
  const currentOrders = currentOrdersRes.data || []
  const prevOrders = prevOrdersRes.data || []

  const totalGPV30d = currentOrders.reduce((sum, o) => sum + Number(o.total_amount), 0)
  const prevGPV30d = prevOrders.reduce((sum, o) => sum + Number(o.total_amount), 0)
  const totalOrders30d = currentOrders.length
  const prevOrders30d = prevOrders.length

  const gpvChange = prevGPV30d > 0
    ? Math.round(((totalGPV30d - prevGPV30d) / prevGPV30d) * 1000) / 10
    : 0
  const ordersChange = prevOrders30d > 0
    ? Math.round(((totalOrders30d - prevOrders30d) / prevOrders30d) * 1000) / 10
    : 0
  const avgOrderValue = totalOrders30d > 0
    ? Math.round((totalGPV30d / totalOrders30d) * 100) / 100
    : 0

  // --- Void rate ---
  const allOrders30d = allOrders30dRes.data || []
  const voidedCount = allOrders30d.filter(o => o.status === 'void').length
  const voidRate = allOrders30d.length > 0
    ? Math.round((voidedCount / allOrders30d.length) * 10000) / 100
    : 0

  // --- Active merchants ---
  const activeMerchantSet = new Set(
    (activeMerchantsRes.data || []).map(o => o.merchant_id)
  )
  const activeMerchants7d = activeMerchantSet.size

  // --- Payment method mix ---
  const payments = paymentMethodsRes.data || []
  const totalPaymentAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const cashAmount = payments
    .filter(p => p.payment_method === 'cash')
    .reduce((sum, p) => sum + Number(p.amount), 0)
  const cardAmount = payments
    .filter(p => typeof p.payment_method === 'string' && p.payment_method.startsWith('card'))
    .reduce((sum, p) => sum + Number(p.amount), 0)
  const cashPercent = totalPaymentAmount > 0
    ? Math.round((cashAmount / totalPaymentAmount) * 1000) / 10
    : 0
  const cardPercent = totalPaymentAmount > 0
    ? Math.round((cardAmount / totalPaymentAmount) * 1000) / 10
    : 0

  // --- Build formatted change strings for legacy consumers ---
  const fmtChange = (pct: number) => `${pct >= 0 ? '+' : ''}${pct}%`

  return {
    totalGPV30d: Math.round(totalGPV30d * 100) / 100,
    prevGPV30d: Math.round(prevGPV30d * 100) / 100,
    gpvChange,
    totalOrders30d,
    prevOrders30d,
    ordersChange,
    totalMerchants: totalMerchantsRes.count || 0,
    activeMerchants7d,
    newMerchantsThisMonth: newMerchantsRes.count || 0,
    merchantsOnboarding: onboardingRes.count || 0,
    activeDevices: activeDevicesRes.count || 0,
    totalLocations: totalLocationsRes.count || 0,
    voidRate,
    avgOrderValue,
    cashPercent,
    cardPercent,
    // Legacy aliases
    totalRevenue: Math.round(totalGPV30d * 100) / 100,
    activeAccounts: activeMerchants7d,
    growthRate: gpvChange,
    revenueChange: fmtChange(gpvChange),
    merchantChange: fmtChange(0), // requires snapshot table for accurate MoM merchant count
    activeChange: fmtChange(0),
    growthChange: fmtChange(gpvChange),
  }
}

/**
 * Get platform-wide daily sales trend for the last 30 days.
 * Each data point includes current period + prior period (shifted) for overlay.
 * Also carries order count for GPV/Order Count chart toggle.
 */
export async function getPlatformSalesTrend(): Promise<PlatformSalesTrend[]> {
  const { userId, role } = await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 30)
  const sixtyDaysAgo = new Date(now)
  sixtyDaysAgo.setDate(now.getDate() - 60)

  const [currentRes, prevRes] = await Promise.all([
    supabase
      .from('orders')
      .select('created_at, total_amount, merchant_id')
      .not('status', 'in', '(draft,cancelled,void)')
      .gte('created_at', thirtyDaysAgo.toISOString()),
    supabase
      .from('orders')
      .select('created_at, total_amount')
      .not('status', 'in', '(draft,cancelled,void)')
      .gte('created_at', sixtyDaysAgo.toISOString())
      .lt('created_at', thirtyDaysAgo.toISOString()),
  ])

  const currentData = currentRes.data || []
  const prevData = prevRes.data || []

  // Aggregate current period by date
  const currentMap = new Map<string, { revenue: number; orderCount: number; merchants: Set<string> }>()
  currentData.forEach(order => {
    const date = new Date(order.created_at).toISOString().split('T')[0]
    if (!currentMap.has(date)) {
      currentMap.set(date, { revenue: 0, orderCount: 0, merchants: new Set() })
    }
    const entry = currentMap.get(date)!
    entry.revenue += Number(order.total_amount)
    entry.orderCount += 1
    entry.merchants.add(order.merchant_id)
  })

  // Aggregate prior period by date (shift forward by 30 days for overlay)
  const prevMap = new Map<string, { revenue: number; orderCount: number }>()
  prevData.forEach(order => {
    const originalDate = new Date(order.created_at)
    // Shift 30 days forward so it aligns with current period dates on the chart
    originalDate.setDate(originalDate.getDate() + 30)
    const shiftedDate = originalDate.toISOString().split('T')[0]
    if (!prevMap.has(shiftedDate)) {
      prevMap.set(shiftedDate, { revenue: 0, orderCount: 0 })
    }
    const entry = prevMap.get(shiftedDate)!
    entry.revenue += Number(order.total_amount)
    entry.orderCount += 1
  })

  // Build a complete 30-day date range so chart never has gaps
  const result: PlatformSalesTrend[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const cur = currentMap.get(dateStr)
    const prev = prevMap.get(dateStr)
    result.push({
      date: dateStr,
      revenue: cur ? Math.round(cur.revenue * 100) / 100 : 0,
      prevRevenue: prev ? Math.round(prev.revenue * 100) / 100 : 0,
      orderCount: cur?.orderCount || 0,
      prevOrderCount: prev?.orderCount || 0,
      merchants: cur?.merchants.size || 0,
    })
  }

  return result
}

/**
 * Get top merchants by revenue
 */
export async function getTopMerchants(limit: number = 5): Promise<PlatformTopMerchant[]> {
  const { userId, role } = await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
  if (merchantScope !== null && merchantScope.length === 0) {
    return []
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  let ordersQuery = supabase
    .from('orders')
    .select('merchant_id, total_amount')
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('created_at', thirtyDaysAgo.toISOString())

  if (merchantScope !== null) {
    ordersQuery = ordersQuery.in('merchant_id', merchantScope)
  }

  const { data: ordersData, error: ordersError } = await ordersQuery
  if (ordersError || !ordersData) {
    console.error('[getTopMerchants:orders] Error:', ordersError)
    return []
  }

  const byMerchant = new Map<string, { revenue: number; transactions: number }>()
  for (const row of ordersData) {
    const merchantId = row.merchant_id
    if (!merchantId) continue
    const entry = byMerchant.get(merchantId) ?? { revenue: 0, transactions: 0 }
    entry.revenue += Number(row.total_amount || 0)
    entry.transactions += 1
    byMerchant.set(merchantId, entry)
  }

  const merchantIds = Array.from(byMerchant.keys())
  if (merchantIds.length === 0) return []

  const { data: merchantsData, error: merchantsError } = await supabase
    .from('merchants')
    .select('id, name')
    .in('id', merchantIds)

  if (merchantsError) {
    console.error('[getTopMerchants:merchants] Error:', merchantsError)
  }

  const merchantNameById = new Map<string, string>(
    (merchantsData ?? []).map((merchant) => [merchant.id, merchant.name || 'Unknown'])
  )

  return merchantIds
    .map((merchantId) => {
      const stats = byMerchant.get(merchantId)!
      return {
        id: merchantId,
        name: merchantNameById.get(merchantId) || 'Unknown',
        revenue: stats.revenue,
        transactions: stats.transactions,
        growth: 0,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, Math.max(1, limit))
}

/**
 * Get platform-wide audit logs
 */
export async function getPlatformAuditLogs(
  filters?: PlatformAuditLogFilters,
  limit: number = 50,
  offset: number = 0
): Promise<PlatformAuditLogsResult> {
  await assertHQPermission('system.audit.view')

  let supabase = createServerSupabaseClient()
  try {
    supabase = createServiceRoleClient()
  } catch (error) {
    console.warn('[getPlatformAuditLogs] Service-role client unavailable, falling back to user-scoped client.')
  }

  let query = supabase
    .from('audit_logs')
    .select(`
      id,
      created_at,
      actor_user_id,
      actor_email,
      actor_name,
      actor_role,
      action,
      action_category,
      severity,
      resource_type,
      resource_id,
      resource_name,
      status,
      error_message,
      merchant_id,
      location_id,
      organization_type,
      organization_name,
      changes,
      metadata,
      merchants(name),
      location:locations(id, name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filters?.search) {
    const term = filters.search.trim()
    if (term.length > 0) {
      query = query.or(
        `action.ilike.%${term}%,actor_name.ilike.%${term}%,actor_email.ilike.%${term}%,resource_name.ilike.%${term}%,resource_type.ilike.%${term}%`
      )
    }
  }

  if (filters?.actionCategory) {
    query = query.eq('action_category', filters.actionCategory)
  }

  if (filters?.severity) {
    query = query.eq('severity', filters.severity)
  }

  if (filters?.actor) {
    const actorTerm = filters.actor.trim()
    if (actorTerm.length > 0) {
      query = query.or(
        `actor_name.ilike.%${actorTerm}%,actor_email.ilike.%${actorTerm}%,actor_user_id.ilike.%${actorTerm}%`
      )
    }
  }

  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom)
  }

  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo)
  }

  if (filters?.status === 'success') {
    query = query.or('status.eq.success,status.is.null')
  } else if (filters?.status === 'failed') {
    query = query.or('status.eq.failed,status.eq.error')
  }

  if (filters?.resourceType) {
    query = query.eq('resource_type', filters.resourceType)
  }

  if (filters?.merchantIds && filters.merchantIds.length > 0) {
    query = query.in('merchant_id', filters.merchantIds)
  }

  if (filters?.hasError) {
    query = query.not('error_message', 'is', null)
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getPlatformAuditLogs] Error:', error)
    return { data: [], total: 0 }
  }

  const rows: PlatformAuditLogRow[] = (data || []).map((row: any) => {
    const merchantRaw = row.merchants
    const locationRaw = row.location
    const merchant = Array.isArray(merchantRaw) ? merchantRaw[0] : merchantRaw
    const location = Array.isArray(locationRaw) ? locationRaw[0] : locationRaw

    return {
      id: row.id,
      created_at: row.created_at,
      actor_user_id: row.actor_user_id || undefined,
      actor_email: row.actor_email || undefined,
      actor_name: row.actor_name || undefined,
      actor_role: row.actor_role || undefined,
      action: row.action || 'unknown_action',
      action_category: row.action_category || undefined,
      severity: row.severity || undefined,
      resource_type: row.resource_type || undefined,
      resource_id: row.resource_id || undefined,
      resource_name: row.resource_name || undefined,
      status: row.status || undefined,
      error_message: row.error_message || undefined,
      merchant_id: row.merchant_id || undefined,
      merchant_name: merchant?.name || undefined,
      location_id: row.location_id || undefined,
      location_name: location?.name || undefined,
      organization_type: row.organization_type || undefined,
      organization_name: row.organization_name || undefined,
      changes: row.changes || null,
      metadata: row.metadata || null,
    }
  })

  return {
    data: rows,
    total: count || 0
  }
}

/**
 * Get GPV concentration data for the Whale Watch (Pareto / Lorenz Curve)
 * Aggregates orders.total_amount grouped by merchant_id over a configurable period
 */
export async function getGPVConcentration(days: number = 30): Promise<GPVConcentrationData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()

  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - days)

  const prevPeriodStart = new Date()
  prevPeriodStart.setDate(prevPeriodStart.getDate() - days * 2)

  const emptyResult: GPVConcentrationData = {
    lorenzCurve: [
      { merchantPercentile: 0, gpvPercentile: 0, equalityLine: 0, merchantCount: 0 },
      { merchantPercentile: 100, gpvPercentile: 100, equalityLine: 100, merchantCount: 0 },
    ],
    topTenPercentGPVShare: 0,
    riskLevel: 'low',
    whaleList: [],
    totalGPV: 0,
    totalMerchants: 0,
    averageGPV: 0,
    medianGPV: 0,
    periodDays: days,
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('merchant_id, total_amount')
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('created_at', periodStart.toISOString())

  if (error || !orders || orders.length === 0) return emptyResult

  const { data: prevOrders } = await supabase
    .from('orders')
    .select('merchant_id, total_amount')
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('created_at', prevPeriodStart.toISOString())
    .lt('created_at', periodStart.toISOString())

  // Aggregate GPV per merchant — current period
  const merchantGPV = new Map<string, { gpv: number; txCount: number }>()
  orders.forEach(order => {
    const amount = Number(order.total_amount)
    const existing = merchantGPV.get(order.merchant_id)
    if (existing) {
      existing.gpv += amount
      existing.txCount += 1
    } else {
      merchantGPV.set(order.merchant_id, { gpv: amount, txCount: 1 })
    }
  })

  // Aggregate GPV per merchant — previous period
  const prevMerchantGPV = new Map<string, number>()
  prevOrders?.forEach(order => {
    const amount = Number(order.total_amount)
    prevMerchantGPV.set(order.merchant_id, (prevMerchantGPV.get(order.merchant_id) || 0) + amount)
  })

  const sorted = Array.from(merchantGPV.entries())
    .map(([id, stats]) => ({ id, gpv: stats.gpv, txCount: stats.txCount }))
    .sort((a, b) => b.gpv - a.gpv)

  const totalGPV = sorted.reduce((sum, m) => sum + m.gpv, 0)
  const totalMerchants = sorted.length

  const gpvValues = sorted.map(m => m.gpv)
  const averageGPV = totalGPV / totalMerchants
  const mid = Math.floor(totalMerchants / 2)
  const medianGPV = totalMerchants % 2 === 0
    ? (gpvValues[mid - 1] + gpvValues[mid]) / 2
    : gpvValues[mid]

  // Build Lorenz curve (smallest to largest)
  const sortedAsc = [...sorted].reverse()
  const lorenzCurve: GPVConcentrationPoint[] = [
    { merchantPercentile: 0, gpvPercentile: 0, equalityLine: 0, merchantCount: 0 },
  ]
  let cumulativeGPV = 0
  sortedAsc.forEach((merchant, index) => {
    cumulativeGPV += merchant.gpv
    const merchantPct = Math.round(((index + 1) / totalMerchants) * 100)
    const gpvPct = Math.round((cumulativeGPV / totalGPV) * 1000) / 10
    lorenzCurve.push({
      merchantPercentile: merchantPct,
      gpvPercentile: gpvPct,
      equalityLine: merchantPct,
      merchantCount: index + 1,
    })
  })

  const top10Count = Math.max(1, Math.ceil(totalMerchants * 0.1))
  const top10GPV = sorted.slice(0, top10Count).reduce((sum, m) => sum + m.gpv, 0)
  const topTenPercentGPVShare = Math.round((top10GPV / totalGPV) * 1000) / 10

  const riskLevel: ConcentrationRisk =
    topTenPercentGPVShare > 60 ? 'high' : topTenPercentGPVShare >= 40 ? 'medium' : 'low'

  const WHALE_THRESHOLD = 100_000 * (days / 30)
  const whaleIds = sorted.filter(m => m.gpv >= WHALE_THRESHOLD).map(m => m.id)

  let whaleList: WhaleListMerchant[] = []
  if (whaleIds.length > 0) {
    const [{ data: merchantNames }, { data: locationRows }] = await Promise.all([
      supabase.from('merchants').select('id, name').in('id', whaleIds),
      supabase.from('locations').select('merchant_id').in('merchant_id', whaleIds).eq('is_active', true),
    ])

    const nameMap = new Map(merchantNames?.map(m => [m.id, m.name]) || [])
    const amMap = new Map(merchantNames?.map(m => [m.id, null as string | null]) || [])

    const locationCountMap = new Map<string, number>()
    locationRows?.forEach(l => {
      locationCountMap.set(l.merchant_id, (locationCountMap.get(l.merchant_id) || 0) + 1)
    })

    whaleList = sorted
      .filter(m => m.gpv >= WHALE_THRESHOLD)
      .map(m => {
        const prevGPV = prevMerchantGPV.get(m.id)
        const trend = prevGPV != null && prevGPV > 0
          ? Math.round(((m.gpv - prevGPV) / prevGPV) * 1000) / 10
          : null

        return {
          id: m.id,
          name: nameMap.get(m.id) || 'Unknown Merchant',
          monthlyGPV: Math.round(m.gpv * 100) / 100,
          percentOfTotal: Math.round((m.gpv / totalGPV) * 1000) / 10,
          transactions: m.txCount,
          locationCount: locationCountMap.get(m.id) || 0,
          trend,
          accountManager: amMap.get(m.id) || null,
        }
      })
  }

  return {
    lorenzCurve,
    topTenPercentGPVShare,
    riskLevel,
    whaleList,
    totalGPV: Math.round(totalGPV * 100) / 100,
    totalMerchants,
    averageGPV: Math.round(averageGPV * 100) / 100,
    medianGPV: Math.round(medianGPV * 100) / 100,
    periodDays: days,
  }
}

/**
 * TICKET-002: Get merchants with significant GPV drops (churn warning)
 * Compares Last 7 Days vs Previous 7 Days GPV
 * Flags merchants with >30% drop as "At Risk"
 */
export async function getChurnWarnings(): Promise<ChurnWarningData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()

  const now = new Date()
  const last7DaysStart = new Date(now)
  last7DaysStart.setDate(last7DaysStart.getDate() - 7)

  const prev7DaysStart = new Date(now)
  prev7DaysStart.setDate(prev7DaysStart.getDate() - 14)

  const emptyResult: ChurnWarningData = {
    atRiskMerchants: [],
    totalAtRisk: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    totalGPVAtRisk: 0,
  }

  // Fetch orders for last 14 days
  const { data: orders, error } = await supabase
    .from('orders')
    .select('merchant_id, total_amount, created_at')
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('created_at', prev7DaysStart.toISOString())

  if (error || !orders || orders.length === 0) return emptyResult

  // Aggregate by merchant for both periods
  const last7DaysData = new Map<string, { gpv: number; txCount: number; lastOrderDate: string }>()
  const prev7DaysData = new Map<string, { gpv: number; txCount: number }>()

  orders.forEach(order => {
    const orderDate = new Date(order.created_at)
    const amount = Number(order.total_amount)
    const isLast7Days = orderDate >= last7DaysStart

    if (isLast7Days) {
      const existing = last7DaysData.get(order.merchant_id)
      if (existing) {
        existing.gpv += amount
        existing.txCount += 1
        if (orderDate > new Date(existing.lastOrderDate)) {
          existing.lastOrderDate = order.created_at
        }
      } else {
        last7DaysData.set(order.merchant_id, {
          gpv: amount,
          txCount: 1,
          lastOrderDate: order.created_at,
        })
      }
    } else {
      const existing = prev7DaysData.get(order.merchant_id)
      if (existing) {
        existing.gpv += amount
        existing.txCount += 1
      } else {
        prev7DaysData.set(order.merchant_id, { gpv: amount, txCount: 1 })
      }
    }
  })

  // Calculate drops and filter at-risk merchants
  const atRiskMerchantIds: string[] = []
  const merchantDropData = new Map<string, {
    lastGPV: number
    prevGPV: number
    dropPct: number
    lastOrderDate: string
    lastTx: number
    prevTx: number
  }>()

  last7DaysData.forEach((lastStats, merchantId) => {
    const prevStats = prev7DaysData.get(merchantId)

    // Only compare if merchant had activity in previous period
    if (prevStats && prevStats.gpv > 0) {
      const dropAmount = prevStats.gpv - lastStats.gpv
      const dropPercentage = Math.round((dropAmount / prevStats.gpv) * 1000) / 10

      // Flag if drop > 30%
      if (dropPercentage > 30) {
        atRiskMerchantIds.push(merchantId)
        merchantDropData.set(merchantId, {
          lastGPV: lastStats.gpv,
          prevGPV: prevStats.gpv,
          dropPct: dropPercentage,
          lastOrderDate: lastStats.lastOrderDate,
          lastTx: lastStats.txCount,
          prevTx: prevStats.txCount,
        })
      }
    }
  })

  if (atRiskMerchantIds.length === 0) return emptyResult

  // Fetch merchant details (only active merchants)
  const { data: merchants } = await supabase
    .from('merchants')
    .select('id, name, onboarding_status')
    .in('id', atRiskMerchantIds)

  if (!merchants || merchants.length === 0) return emptyResult

  // Build final result
  const atRiskMerchants: ChurnWarningMerchant[] = merchants
    .map(merchant => {
      const dropData = merchantDropData.get(merchant.id)
      if (!dropData) return null

      // Classify severity
      let severity: ChurnSeverity = 'medium'
      if (dropData.dropPct >= 80) severity = 'critical'
      else if (dropData.dropPct >= 55) severity = 'high'

      return {
        id: merchant.id,
        name: merchant.name || 'Unknown Merchant',
        lastSevenDaysGPV: Math.round(dropData.lastGPV * 100) / 100,
        prevSevenDaysGPV: Math.round(dropData.prevGPV * 100) / 100,
        dropPercentage: dropData.dropPct,
        severity,
        lastOrderDate: dropData.lastOrderDate,
        transactionsLast7Days: dropData.lastTx,
        transactionsPrev7Days: dropData.prevTx,
      }
    })
    .filter((m): m is ChurnWarningMerchant => m !== null)
    .sort((a, b) => b.dropPercentage - a.dropPercentage) // Sort by severity

  const criticalCount = atRiskMerchants.filter(m => m.severity === 'critical').length
  const highCount = atRiskMerchants.filter(m => m.severity === 'high').length
  const mediumCount = atRiskMerchants.filter(m => m.severity === 'medium').length
  const totalGPVAtRisk = atRiskMerchants.reduce((sum, m) => sum + m.prevSevenDaysGPV, 0)

  // Slack alerts are sent explicitly via sendChurnSlackAlert() — not here.
  // Firing in the data-fetch function would spam the channel on every page load / query refresh.

  return {
    atRiskMerchants,
    totalAtRisk: atRiskMerchants.length,
    criticalCount,
    highCount,
    mediumCount,
    totalGPVAtRisk: Math.round(totalGPVAtRisk * 100) / 100,
  }
}

// ============================================================================
// TICKET-002: Slack Churn Alert (explicit / on-demand)
// ============================================================================
// Called from the UI when an admin clicks "Notify #merchant-health".
// Never auto-fires — keeps the channel clean and alert-worthy.
//
// Required env var: SLACK_CHURN_WEBHOOK_URL
//   Add to .env.local:  SLACK_CHURN_WEBHOOK_URL=https://hooks.slack.com/services/...
// ============================================================================

export type SlackAlertStatus = 'sent' | 'no_webhook' | 'no_critical' | 'error'

export interface SendChurnSlackAlertResult {
  status: SlackAlertStatus
  criticalCount: number
  message: string
}

export async function sendChurnSlackAlert(
  merchants: ChurnWarningMerchant[],
  summary: { totalAtRisk: number; highCount: number; mediumCount: number; totalGPVAtRisk: number }
): Promise<SendChurnSlackAlertResult> {
  await assertHQPermission('hq.org.view')

  const criticalMerchants = merchants.filter(m => m.severity === 'critical')

  if (criticalMerchants.length === 0) {
    return { status: 'no_critical', criticalCount: 0, message: 'No critical merchants to alert.' }
  }

  const webhookUrl = process.env.SLACK_CHURN_WEBHOOK_URL
  if (!webhookUrl) {
    return {
      status: 'no_webhook',
      criticalCount: criticalMerchants.length,
      message: 'SLACK_CHURN_WEBHOOK_URL is not configured. Add it to your .env.local file.',
    }
  }

  const bulletLines = criticalMerchants.map(m =>
    `• *${m.name}* — ${m.dropPercentage}% drop · last txn: ${new Date(m.lastOrderDate).toLocaleDateString()} · prev week $${m.prevSevenDaysGPV.toLocaleString()}`
  )

  const payload = {
    text: `:rotating_light: Churn Alert — ${criticalMerchants.length} Critical Merchant${criticalMerchants.length !== 1 ? 's' : ''}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🚨 Churn Alert: ${criticalMerchants.length} Critical Merchant${criticalMerchants.length !== 1 ? 's' : ''}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `These merchants have dropped *>80% GPV week-over-week* and may be switching to a competitor (Toast / Clover).\n\n${bulletLines.join('\n')}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Total GPV At Risk:*\n$${Math.round(summary.totalGPVAtRisk).toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*All At-Risk Merchants:*\n${summary.totalAtRisk} total (${criticalMerchants.length} critical · ${summary.highCount} high · ${summary.mediumCount} medium)`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '📊 Open Analytics Dashboard', emoji: true },
            url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/manage/analytics`,
            action_id: 'open_analytics',
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sent at ${new Date().toUTCString()} · Triggered manually by a DexaPOS admin`,
          },
        ],
      },
    ],
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[sendChurnSlackAlert] Slack returned ${res.status}: ${body}`)
      return { status: 'error', criticalCount: criticalMerchants.length, message: `Slack returned HTTP ${res.status}` }
    }

    return {
      status: 'sent',
      criticalCount: criticalMerchants.length,
      message: `Alert sent for ${criticalMerchants.length} critical merchant${criticalMerchants.length !== 1 ? 's' : ''}.`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[sendChurnSlackAlert] fetch failed:', err)
    return { status: 'error', criticalCount: criticalMerchants.length, message: msg }
  }
}

// ============================================================================
// TICKET-003: LANDI Device Stability Index
// ============================================================================
// Uses existing tables as proxy signals:
//   device_heartbeats.is_online = false  → "unhealthy" signal
//   station_sessions.session_status = 'kicked' → "unhealthy" signal
//   Grouped by app_version from heartbeats + stations for hardware_model
// ============================================================================

/**
 * Paginated fetch to bypass Supabase's default 1000-row limit.
 * Fetches all matching rows in batches.
 */
async function fetchAllRows<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  table: string,
  selectCols: string,
  filters: (query: any) => any,
  pageSize: number = 1000
): Promise<T[]> {
  const allRows: T[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    let query = supabase.from(table).select(selectCols)
    query = filters(query)
    query = query.range(offset, offset + pageSize - 1)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error }: { data: any[] | null; error: any } = await query
    if (error || !data || data.length === 0) {
      hasMore = false
    } else {
      allRows.push(...(data as T[]))
      offset += pageSize
      if (data.length < pageSize) hasMore = false
    }
  }

  return allRows
}

/**
 * Get device stability data grouped by app version.
 * Healthy = online heartbeats, Unhealthy = offline heartbeats + kicked sessions.
 */
export async function getDeviceStabilityIndex(days: number = 30): Promise<DeviceStabilityData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()

  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - days)

  const emptyResult: DeviceStabilityData = {
    versionBars: [],
    totalDevices: 0,
    totalHeartbeats: 0,
    overallInstabilityRate: 0,
    rolloutWarning: null,
    periodDays: days,
  }

  // 1. Fetch ALL heartbeats within period — include resource metrics for degraded detection
  const heartbeats = await fetchAllRows<{
    station_id: string; is_online: boolean; app_version: string | null
    battery_level: number | null; ram_free_mb: number | null; storage_free_mb: number | null
  }>(supabase, 'device_heartbeats', 'station_id, is_online, app_version, battery_level, ram_free_mb, storage_free_mb', (q) =>
    q.gte('heartbeat_at', periodStart.toISOString())
  )

  if (heartbeats.length === 0) return emptyResult

  // 2. Fetch kicked sessions within period as additional instability signal (paginated)
  const kickedSessions = await fetchAllRows<{
    station_id: string; app_version: string | null
  }>(supabase, 'station_sessions', 'station_id, app_version', (q) =>
    q.eq('session_status', 'kicked').gte('started_at', periodStart.toISOString())
  )

  // 3. Get station details for hardware model mapping
  const stationIds = [...new Set(heartbeats.map(h => h.station_id))]
  const { data: stations } = await supabase
    .from('stations')
    .select('id, device_model, hardware_model, device_manufacturer')
    .in('id', stationIds)

  const stationMap = new Map(
    stations?.map(s => [s.id, {
      device_model: s.device_model || 'Unknown',
      hardware_model: s.hardware_model || s.device_model || 'Unknown',
      manufacturer: s.device_manufacturer || 'Unknown',
    }]) || []
  )

  // 4. Aggregate heartbeats by version — three-state classification:
  //    healthy  = online + all resources OK
  //    degraded = online but low battery (<20%), RAM (<200MB), or storage (<500MB)
  //    unhealthy = offline heartbeat
  const versionMap = new Map<string, { healthy: number; degraded: number; unhealthy: number; devices: Set<string> }>()

  heartbeats.forEach(hb => {
    const version = hb.app_version || 'Unknown'
    if (!versionMap.has(version)) {
      versionMap.set(version, { healthy: 0, degraded: 0, unhealthy: 0, devices: new Set() })
    }
    const entry = versionMap.get(version)!
    entry.devices.add(hb.station_id)
    if (!hb.is_online) {
      entry.unhealthy += 1
    } else {
      const isLowBattery = hb.battery_level !== null && hb.battery_level < 20
      const isLowRam = hb.ram_free_mb !== null && hb.ram_free_mb < 200
      const isLowStorage = hb.storage_free_mb !== null && hb.storage_free_mb < 500
      if (isLowBattery || isLowRam || isLowStorage) {
        entry.degraded += 1
      } else {
        entry.healthy += 1
      }
    }
  })

  // Add kicked sessions as unhealthy signals
  kickedSessions?.forEach(sess => {
    const version = sess.app_version || 'Unknown'
    if (!versionMap.has(version)) {
      versionMap.set(version, { healthy: 0, degraded: 0, unhealthy: 0, devices: new Set() })
    }
    const entry = versionMap.get(version)!
    entry.devices.add(sess.station_id)
    entry.unhealthy += 1
  })

  // 5. Build version bars sorted by version ascending
  //    instabilityRate = unhealthy / total — degraded is a warning, not counted as instability
  const versionBars: VersionStabilityBar[] = Array.from(versionMap.entries())
    .map(([version, data]) => {
      const total = data.healthy + data.degraded + data.unhealthy
      return {
        version,
        healthy: data.healthy,
        degraded: data.degraded,
        unhealthy: data.unhealthy,
        total,
        instabilityRate: total > 0 ? Math.round((data.unhealthy / total) * 10000) / 100 : 0,
      }
    })
    .sort((a, b) => {
      // Sort semantically by version if possible, fallback to string sort
      const parseVersion = (v: string) => {
        const parts = v.replace(/^v/i, '').split('.').map(Number)
        return parts[0] * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0)
      }
      const aNum = parseVersion(a.version)
      const bNum = parseVersion(b.version)
      if (isNaN(aNum) || isNaN(bNum)) return a.version.localeCompare(b.version)
      return aNum - bNum
    })

  const totalDevices = new Set(heartbeats.map(h => h.station_id)).size
  const totalHeartbeats = heartbeats.length + (kickedSessions?.length || 0)
  const totalUnhealthy = versionBars.reduce((sum, v) => sum + v.unhealthy, 0)
  const overallInstabilityRate = totalHeartbeats > 0
    ? Math.round((totalUnhealthy / totalHeartbeats) * 10000) / 100
    : 0

  // 6. Check rollout warning — flag ANY version above 1% threshold (worst first)
  let rolloutWarning: string | null = null
  if (versionBars.length > 0) {
    const riskyVersions = versionBars
      .filter(v => v.instabilityRate > 1 && v.version !== 'Unknown')
      .sort((a, b) => b.instabilityRate - a.instabilityRate)

    if (riskyVersions.length === 1) {
      rolloutWarning = `${riskyVersions[0].version} has ${riskyVersions[0].instabilityRate}% instability rate — hold rollout of next version`
    } else if (riskyVersions.length > 1) {
      const worst = riskyVersions[0]
      rolloutWarning = `${riskyVersions.length} versions above 1% threshold — ${worst.version} is worst at ${worst.instabilityRate}%. Hold rollout until resolved.`
    }
  }

  return {
    versionBars,
    totalDevices,
    totalHeartbeats,
    overallInstabilityRate,
    rolloutWarning,
    periodDays: days,
  }
}

/**
 * Get hardware model breakdown for a specific app version (drill-down).
 */
export async function getVersionDrillDown(version: string, days: number = 30): Promise<VersionDrillDown> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()

  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - days)

  const emptyResult: VersionDrillDown = {
    version,
    models: [],
    totalDevices: 0,
    overallInstabilityRate: 0,
  }

  // 1. Get heartbeats for this version — include resource metrics for degraded detection
  const heartbeats = await fetchAllRows<{
    station_id: string; is_online: boolean
    battery_level: number | null; ram_free_mb: number | null; storage_free_mb: number | null
  }>(supabase, 'device_heartbeats', 'station_id, is_online, battery_level, ram_free_mb, storage_free_mb', (q) =>
    q.eq('app_version', version).gte('heartbeat_at', periodStart.toISOString())
  )

  if (heartbeats.length === 0) return emptyResult

  // 2. Get kicked sessions for this version (paginated)
  const kickedSessions = await fetchAllRows<{
    station_id: string
  }>(supabase, 'station_sessions', 'station_id', (q) =>
    q.eq('app_version', version).eq('session_status', 'kicked').gte('started_at', periodStart.toISOString())
  )

  // 3. Get station hardware info (with manufacturer for "Landi C20" style labels)
  const stationIds = [...new Set([
    ...heartbeats.map(h => h.station_id),
    ...kickedSessions.map(s => s.station_id),
  ])]

  const { data: stations } = await supabase
    .from('stations')
    .select('id, device_model, hardware_model, device_manufacturer')
    .in('id', stationIds)

  const stationModelMap = new Map(
    stations?.map(s => {
      const model = s.hardware_model || s.device_model || 'Unknown Model'
      const manufacturer = s.device_manufacturer
      // Produce labels like "Landi C20" instead of just "C20"
      const label = manufacturer && !model.toLowerCase().startsWith(manufacturer.toLowerCase())
        ? `${manufacturer} ${model}`
        : model
      return [s.id, label]
    }) || []
  )

  // 4. Aggregate by hardware model — three-state classification matching getDeviceStabilityIndex
  const modelMap = new Map<string, { healthy: number; degraded: number; unhealthy: number; devices: Set<string> }>()

  heartbeats.forEach(hb => {
    const model = stationModelMap.get(hb.station_id) || 'Unknown Model'
    if (!modelMap.has(model)) {
      modelMap.set(model, { healthy: 0, degraded: 0, unhealthy: 0, devices: new Set() })
    }
    const entry = modelMap.get(model)!
    entry.devices.add(hb.station_id)
    if (!hb.is_online) {
      entry.unhealthy += 1
    } else {
      const isLowBattery = hb.battery_level !== null && hb.battery_level < 20
      const isLowRam = hb.ram_free_mb !== null && hb.ram_free_mb < 200
      const isLowStorage = hb.storage_free_mb !== null && hb.storage_free_mb < 500
      if (isLowBattery || isLowRam || isLowStorage) {
        entry.degraded += 1
      } else {
        entry.healthy += 1
      }
    }
  })

  kickedSessions.forEach(sess => {
    const model = stationModelMap.get(sess.station_id) || 'Unknown Model'
    if (!modelMap.has(model)) {
      modelMap.set(model, { healthy: 0, degraded: 0, unhealthy: 0, devices: new Set() })
    }
    const entry = modelMap.get(model)!
    entry.devices.add(sess.station_id)
    entry.unhealthy += 1
  })

  // 5. Build model breakdown — instabilityRate uses unhealthy only (degraded is a warning)
  const models: HardwareModelBreakdown[] = Array.from(modelMap.entries())
    .map(([model, data]) => {
      const total = data.healthy + data.degraded + data.unhealthy
      return {
        model,
        healthy: data.healthy,
        degraded: data.degraded,
        unhealthy: data.unhealthy,
        total,
        instabilityRate: total > 0 ? Math.round((data.unhealthy / total) * 10000) / 100 : 0,
        deviceCount: data.devices.size,
      }
    })
    .sort((a, b) => b.instabilityRate - a.instabilityRate) // Worst first

  const totalDevices = stationIds.length
  const totalSignals = models.reduce((sum, m) => sum + m.total, 0)
  const totalUnhealthy = models.reduce((sum, m) => sum + m.unhealthy, 0)

  return {
    version,
    models,
    totalDevices,
    overallInstabilityRate: totalSignals > 0
      ? Math.round((totalUnhealthy / totalSignals) * 10000) / 100
      : 0,
  }
}

// ============================================================================
// TICKET-004: Terminal Utilization Heatmap
// ============================================================================
// Goal: Identify merchants paying for N terminals but only using a fraction.
// Metric: Active Utilization Rate = (Stations with ≥1 txn/day avg) / Total Stations
// Zombie: Station with 0 transactions in the last 30 days
// ============================================================================

/**
 * Get terminal (station) utilization data across all merchants.
 * Joins stations → orders to calculate per-station activity, then rolls up per merchant.
 */
export async function getTerminalUtilization(days: number = 30): Promise<TerminalUtilizationData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()

  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - days)

  // ── Per-unit hardware cost assumption (LANDI C20 / A8 tablet) ─────────────
  // Adjust this constant if device pricing changes. Exposed in the response so
  // the UI can render "based on ~$X/unit assumption" transparently.
  const HARDWARE_COST_PER_UNIT = 499

  const emptyResult: TerminalUtilizationData = {
    merchants: [],
    summary: {
      totalMerchants: 0,
      totalStations: 0,
      totalActiveStations: 0,
      totalZombieStations: 0,
      overallUtilizationRate: 0,
      underutilizedMerchantCount: 0,
      criticalMerchantCount: 0,
      totalReclaimableStations: 0,
      estimatedWastedHardwareValue: 0,
      hardwareCostPerUnit: HARDWARE_COST_PER_UNIT,
    },
    periodDays: days,
  }

  // 1. Fetch all active stations (tablets) across all merchants
  const allStations = await fetchAllRows<{
    id: string
    station_name: string
    station_type: string
    merchant_id: string
    location_id: string
    is_active: boolean
  }>(supabase, 'stations', 'id, station_name, station_type, merchant_id, location_id, is_active', (q) =>
    q.eq('is_active', true)
  )

  if (allStations.length === 0) return emptyResult

  // 2. Fetch all orders within the period that have a station_id (paginated)
  const orders = await fetchAllRows<{
    station_id: string
    created_at: string
    merchant_id: string
  }>(supabase, 'orders', 'station_id, created_at, merchant_id', (q) =>
    q
      .not('status', 'in', '(draft,cancelled,void)')
      .not('station_id', 'is', null)
      .gte('created_at', periodStart.toISOString())
  )

  // 3. Aggregate orders per station: total count + distinct active days
  const stationOrderMap = new Map<string, { totalOrders: number; activeDays: Set<string>; lastTxnAt: string }>()

  orders.forEach(order => {
    if (!order.station_id) return
    const dateKey = new Date(order.created_at).toISOString().split('T')[0]

    if (!stationOrderMap.has(order.station_id)) {
      stationOrderMap.set(order.station_id, { totalOrders: 0, activeDays: new Set(), lastTxnAt: order.created_at })
    }
    const entry = stationOrderMap.get(order.station_id)!
    entry.totalOrders += 1
    entry.activeDays.add(dateKey)
    if (new Date(order.created_at) > new Date(entry.lastTxnAt)) {
      entry.lastTxnAt = order.created_at
    }
  })

  // 4. Fetch merchant names in one batch
  const merchantIds = [...new Set(allStations.map(s => s.merchant_id))]
  const { data: merchantRows } = await supabase
    .from('merchants')
    .select('id, name')
    .in('id', merchantIds)

  const merchantNameMap = new Map(merchantRows?.map(m => [m.id, m.name || 'Unknown Merchant']) || [])

  // 5. Build per-station utilization
  const now = new Date()
  const ZOMBIE_THRESHOLD_DAYS = 30

  const stationUtils: StationUtilization[] = allStations.map(station => {
    const orderData = stationOrderMap.get(station.id)
    const totalOrders = orderData?.totalOrders || 0
    const activeDays = orderData?.activeDays.size || 0
    const lastTxnAt = orderData?.lastTxnAt || null

    let daysSinceLastTxn: number | null = null
    if (lastTxnAt) {
      daysSinceLastTxn = Math.floor((now.getTime() - new Date(lastTxnAt).getTime()) / (1000 * 60 * 60 * 24))
    }

    const isZombie = lastTxnAt === null || (daysSinceLastTxn !== null && daysSinceLastTxn >= ZOMBIE_THRESHOLD_DAYS)

    return {
      stationId: station.id,
      stationName: station.station_name,
      stationType: station.station_type,
      locationId: station.location_id,
      merchantId: station.merchant_id,
      totalOrders,
      activeDays,
      lastTransactionAt: lastTxnAt,
      daysSinceLastTxn,
      isZombie,
      avgOrdersPerActiveDay: activeDays > 0 ? Math.round((totalOrders / activeDays) * 10) / 10 : 0,
    }
  })

  // 6. Group by merchant and calculate utilization
  const merchantGroupMap = new Map<string, StationUtilization[]>()
  stationUtils.forEach(su => {
    if (!merchantGroupMap.has(su.merchantId)) {
      merchantGroupMap.set(su.merchantId, [])
    }
    merchantGroupMap.get(su.merchantId)!.push(su)
  })

  // A station is "active" if it averaged ≥1 txn/day over the period
  const merchantUtilizations: MerchantTerminalUtilization[] = Array.from(merchantGroupMap.entries())
    .filter(([, stations]) => stations.length > 0)
    .map(([merchantId, stations]) => {
      const totalStations = stations.length
      // Active = station processed orders on average at least 1/day
      // More practically: station was active on at least 1 day (had any txn)
      const activeStations = stations.filter(s => s.activeDays > 0 && s.avgOrdersPerActiveDay >= 1).length
      const zombieStations = stations.filter(s => s.isZombie).length
      const utilizationRate = totalStations > 0 ? Math.round((activeStations / totalStations) * 1000) / 10 : 0
      const totalOrders = stations.reduce((sum, s) => sum + s.totalOrders, 0)

      let tier: UtilizationTier = 'healthy'
      if (utilizationRate < 25) tier = 'critical'
      else if (utilizationRate < 50) tier = 'underutilized'

      return {
        merchantId,
        merchantName: merchantNameMap.get(merchantId) || 'Unknown Merchant',
        totalStations,
        activeStations,
        zombieStations,
        utilizationRate,
        tier,
        stations: stations.sort((a, b) => b.totalOrders - a.totalOrders), // most active first
        totalOrders,
        reclaimableStations: zombieStations,
      }
    })
    .sort((a, b) => a.utilizationRate - b.utilizationRate) // worst first

  // 7. Build summary
  const totalStations = stationUtils.length
  const totalActiveStations = stationUtils.filter(s => s.activeDays > 0 && s.avgOrdersPerActiveDay >= 1).length
  const totalZombieStations = stationUtils.filter(s => s.isZombie).length
  const underutilizedMerchantCount = merchantUtilizations.filter(m => m.utilizationRate < 50).length
  const criticalMerchantCount = merchantUtilizations.filter(m => m.utilizationRate < 25).length
  const totalReclaimableStations = merchantUtilizations.reduce((sum, m) => sum + m.reclaimableStations, 0)
  const estimatedWastedHardwareValue = totalReclaimableStations * HARDWARE_COST_PER_UNIT

  return {
    merchants: merchantUtilizations,
    summary: {
      totalMerchants: merchantUtilizations.length,
      totalStations,
      totalActiveStations,
      totalZombieStations,
      overallUtilizationRate: totalStations > 0
        ? Math.round((totalActiveStations / totalStations) * 1000) / 10
        : 0,
      underutilizedMerchantCount,
      criticalMerchantCount,
      totalReclaimableStations,
      estimatedWastedHardwareValue,
      hardwareCostPerUnit: HARDWARE_COST_PER_UNIT,
    },
    periodDays: days,
  }
}

// ============================================================================
// TICKET-010: Fleet Health Dashboard
// ============================================================================

export type DeviceHealthStatus = 'online' | 'degraded' | 'offline'

export interface FleetDevice {
  stationId: string
  stationName: string
  deviceModel: string
  merchantId: string
  merchantName: string
  locationId: string | null
  locationName: string | null
  isOnline: boolean
  healthStatus: DeviceHealthStatus
  batteryLevel: number | null
  ramFreeMb: number | null
  storageFreeMb: number | null
  appVersion: string | null
  lastHeartbeatAt: string | null
  minutesSinceHeartbeat: number | null
}

export interface FleetAlertItem {
  stationId: string
  stationName: string
  merchantName: string
  eventType: 'offline' | 'low_battery' | 'low_ram' | 'low_storage' | 'degraded'
  message: string
  severity: 'warning' | 'critical'
  at: string
}

export interface HardwareCensusItem {
  model: string
  manufacturer: string
  count: number
}

export interface FleetHealthData {
  onlineCount: number
  degradedCount: number
  offlineCount: number
  totalDevices: number
  devices: FleetDevice[]
  hardwareCensus: HardwareCensusItem[]
  alertFeed: FleetAlertItem[]
  lastUpdated: string
}

/**
 * Get real-time fleet health status across all active stations.
 * Uses device_heartbeats from the last 60 minutes for current health signals.
 */
export async function getFleetHealth(): Promise<FleetHealthData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()
  const now = new Date()
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)
  const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000)

  const empty: FleetHealthData = {
    onlineCount: 0, degradedCount: 0, offlineCount: 0, totalDevices: 0,
    devices: [], hardwareCensus: [], alertFeed: [], lastUpdated: now.toISOString(),
  }

  const { data: stations } = await supabase
    .from('stations')
    .select('id, station_name, merchant_id, location_id, device_model, device_manufacturer, hardware_model, is_online, last_heartbeat_at, app_version')
    .eq('is_active', true)

  if (!stations || stations.length === 0) return empty

  const stationIds = stations.map(s => s.id)
  const heartbeats = await fetchAllRows<{
    station_id: string; is_online: boolean; app_version: string | null;
    battery_level: number | null; ram_free_mb: number | null;
    storage_free_mb: number | null; heartbeat_at: string
  }>(supabase, 'device_heartbeats',
    'station_id, is_online, app_version, battery_level, ram_free_mb, storage_free_mb, heartbeat_at',
    (q) => q.in('station_id', stationIds).gte('heartbeat_at', sixtyMinutesAgo.toISOString())
  )

  const latestHeartbeatMap = new Map<string, typeof heartbeats[0]>()
  heartbeats.forEach(hb => {
    const existing = latestHeartbeatMap.get(hb.station_id)
    if (!existing || new Date(hb.heartbeat_at) > new Date(existing.heartbeat_at)) {
      latestHeartbeatMap.set(hb.station_id, hb)
    }
  })

  const merchantIds = [...new Set(stations.map(s => s.merchant_id))]
  const locationIds = [...new Set(stations.map(s => s.location_id).filter(Boolean))] as string[]

  const [{ data: merchantRows }, { data: locationRows }] = await Promise.all([
    supabase.from('merchants').select('id, name').in('id', merchantIds),
    locationIds.length > 0
      ? supabase.from('locations').select('id, name').in('id', locationIds)
      : Promise.resolve({ data: [] }),
  ])

  const merchantNameMap = new Map(merchantRows?.map(m => [m.id, m.name || 'Unknown']) || [])
  const locationNameMap = new Map(locationRows?.map(l => [l.id, l.name || 'Unknown']) || [])

  const devices: FleetDevice[] = stations.map(station => {
    const hb = latestHeartbeatMap.get(station.id)
    const lastHbAt = hb?.heartbeat_at || station.last_heartbeat_at || null
    const minutesSince = lastHbAt
      ? Math.floor((now.getTime() - new Date(lastHbAt).getTime()) / (60 * 1000))
      : null

    let healthStatus: DeviceHealthStatus = 'offline'
    if (lastHbAt && new Date(lastHbAt) >= tenMinutesAgo && hb?.is_online) {
      const isLowBattery = hb.battery_level !== null && hb.battery_level < 20
      const isLowRam = hb.ram_free_mb !== null && hb.ram_free_mb < 200
      const isLowStorage = hb.storage_free_mb !== null && hb.storage_free_mb < 500
      healthStatus = (isLowBattery || isLowRam || isLowStorage) ? 'degraded' : 'online'
    } else if (lastHbAt && new Date(lastHbAt) >= thirtyMinutesAgo && hb?.is_online) {
      healthStatus = 'degraded'
    }

    const modelLabel = (() => {
      const model = station.hardware_model || station.device_model || 'Unknown'
      const mfr = station.device_manufacturer
      return mfr && !model.toLowerCase().startsWith(mfr.toLowerCase())
        ? `${mfr} ${model}`
        : model
    })()

    return {
      stationId: station.id,
      stationName: station.station_name,
      deviceModel: modelLabel,
      merchantId: station.merchant_id,
      merchantName: merchantNameMap.get(station.merchant_id) || 'Unknown',
      locationId: station.location_id,
      locationName: station.location_id ? (locationNameMap.get(station.location_id) || null) : null,
      isOnline: healthStatus !== 'offline',
      healthStatus,
      batteryLevel: hb?.battery_level ?? null,
      ramFreeMb: hb?.ram_free_mb ?? null,
      storageFreeMb: hb?.storage_free_mb ?? null,
      appVersion: hb?.app_version || station.app_version || null,
      lastHeartbeatAt: lastHbAt,
      minutesSinceHeartbeat: minutesSince,
    }
  })

  const onlineCount = devices.filter(d => d.healthStatus === 'online').length
  const degradedCount = devices.filter(d => d.healthStatus === 'degraded').length
  const offlineCount = devices.filter(d => d.healthStatus === 'offline').length

  const censusMap = new Map<string, number>()
  devices.forEach(d => censusMap.set(d.deviceModel, (censusMap.get(d.deviceModel) || 0) + 1))
  const hardwareCensus: HardwareCensusItem[] = Array.from(censusMap.entries())
    .map(([model, count]) => ({ model, manufacturer: '', count }))
    .sort((a, b) => b.count - a.count)

  const alertFeed: FleetAlertItem[] = []
  devices.forEach(d => {
    const at = d.lastHeartbeatAt || now.toISOString()
    if (d.healthStatus === 'offline') {
      alertFeed.push({
        stationId: d.stationId, stationName: d.stationName, merchantName: d.merchantName,
        eventType: 'offline',
        message: d.minutesSinceHeartbeat !== null
          ? `No heartbeat for ${d.minutesSinceHeartbeat} minutes`
          : 'No heartbeat data — device may never have connected',
        severity: 'critical', at,
      })
    } else if (d.healthStatus === 'degraded') {
      if (d.batteryLevel !== null && d.batteryLevel < 20) {
        alertFeed.push({
          stationId: d.stationId, stationName: d.stationName, merchantName: d.merchantName,
          eventType: 'low_battery', message: `Battery at ${d.batteryLevel}% — needs charging`,
          severity: d.batteryLevel < 10 ? 'critical' : 'warning', at,
        })
      }
      if (d.ramFreeMb !== null && d.ramFreeMb < 200) {
        alertFeed.push({
          stationId: d.stationId, stationName: d.stationName, merchantName: d.merchantName,
          eventType: 'low_ram', message: `Only ${d.ramFreeMb}MB RAM free — performance may be impacted`,
          severity: 'warning', at,
        })
      }
      if (d.storageFreeMb !== null && d.storageFreeMb < 500) {
        alertFeed.push({
          stationId: d.stationId, stationName: d.stationName, merchantName: d.merchantName,
          eventType: 'low_storage', message: `Only ${d.storageFreeMb}MB storage free — update installs may fail`,
          severity: 'warning', at,
        })
      }
    }
  })

  alertFeed.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1))

  return {
    onlineCount, degradedCount, offlineCount, totalDevices: devices.length,
    devices: devices.sort((a, b) => (['offline', 'degraded', 'online'].indexOf(a.healthStatus)) - (['offline', 'degraded', 'online'].indexOf(b.healthStatus))),
    hardwareCensus,
    alertFeed: alertFeed.slice(0, 50),
    lastUpdated: now.toISOString(),
  }
}

// ============================================================================
// TICKET-006: Merchant Onboarding Funnel
// ============================================================================

export interface OnboardingFunnelStage {
  stage: string
  label: string
  count: number
  conversionFromPrev: number | null
}

export interface StuckMerchant {
  id: string
  name: string
  createdAt: string
  daysInOnboarding: number
  lastActivity: string | null
  assignedAdmin: string | null
}

export interface MonthlyOnboardingTrend {
  month: string
  newCount: number
  activeCount: number
}

export interface MerchantOnboardingFunnelData {
  funnel: OnboardingFunnelStage[]
  stuckMerchants: StuckMerchant[]
  monthlyTrend: MonthlyOnboardingTrend[]
  avgDaysToActive: number | null
  conversionRate: number
}

export async function getMerchantOnboardingFunnel(): Promise<MerchantOnboardingFunnelData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()
  const now = new Date()
  const fourteenDaysAgo = new Date(now); fourteenDaysAgo.setDate(now.getDate() - 14)
  const twelveMonthsAgo = new Date(now); twelveMonthsAgo.setMonth(now.getMonth() - 12)

  const [merchantsRes, auditRes] = await Promise.all([
    supabase.from('merchants').select('id, name, onboarding_status, created_at'),
    supabase.from('audit_logs').select('resource_id, created_at')
      .eq('resource_type', 'merchant')
      .order('created_at', { ascending: false })
      .limit(5000),
  ])

  const merchants = merchantsRes.data || []
  const audits = auditRes.data || []

  const lastActivityMap = new Map<string, string>()
  audits.forEach(a => {
    if (a.resource_id && !lastActivityMap.has(a.resource_id)) {
      lastActivityMap.set(a.resource_id, a.created_at)
    }
  })

  const statusCounts = {
    created: merchants.filter(m => m.onboarding_status === 'created').length,
    onboarding: merchants.filter(m => m.onboarding_status === 'onboarding').length,
    active: merchants.filter(m => m.onboarding_status === 'active' || m.onboarding_status === 'completed').length,
    suspended: merchants.filter(m => m.onboarding_status === 'suspended' || m.onboarding_status === 'churned').length,
  }

  const fmtConv = (num: number, denom: number) =>
    denom > 0 ? Math.round((num / denom) * 1000) / 10 : null

  const funnel: OnboardingFunnelStage[] = [
    { stage: 'created', label: 'Created', count: statusCounts.created, conversionFromPrev: null },
    { stage: 'onboarding', label: 'Onboarding', count: statusCounts.onboarding, conversionFromPrev: fmtConv(statusCounts.onboarding, merchants.length) },
    { stage: 'active', label: 'Active', count: statusCounts.active, conversionFromPrev: fmtConv(statusCounts.active, statusCounts.onboarding + statusCounts.active) },
    { stage: 'churned', label: 'Churned / Suspended', count: statusCounts.suspended, conversionFromPrev: null },
  ]

  const stuckMerchantList = merchants.filter(m => m.onboarding_status === 'onboarding' && new Date(m.created_at) < fourteenDaysAgo)
  const stuckIds = stuckMerchantList.map(m => m.id)

  // Fetch assigned admin names from admin_merchant_access
  const { data: accessRows } = stuckIds.length > 0
    ? await supabase.from('admin_merchant_access')
        .select('merchant_id, admin_user_id, users!inner(full_name)')
        .in('merchant_id', stuckIds)
        .eq('is_active', true)
    : { data: [] }
  const assignedAdminMap = new Map<string, string>()
  ;(accessRows || []).forEach((row: any) => {
    if (!assignedAdminMap.has(row.merchant_id) && row.users?.full_name) {
      assignedAdminMap.set(row.merchant_id, row.users.full_name)
    }
  })

  const stuckMerchants: StuckMerchant[] = stuckMerchantList
    .map(m => ({
      id: m.id,
      name: m.name || 'Unknown',
      createdAt: m.created_at,
      daysInOnboarding: Math.floor((now.getTime() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      lastActivity: lastActivityMap.get(m.id) || null,
      assignedAdmin: assignedAdminMap.get(m.id) || null,
    }))
    .sort((a, b) => b.daysInOnboarding - a.daysInOnboarding)

  const monthlyMap = new Map<string, { newCount: number; activeCount: number }>()
  merchants.forEach(m => {
    const date = new Date(m.created_at)
    if (date < twelveMonthsAgo) return
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    if (!monthlyMap.has(key)) monthlyMap.set(key, { newCount: 0, activeCount: 0 })
    const entry = monthlyMap.get(key)!
    entry.newCount += 1
    if (m.onboarding_status === 'active' || m.onboarding_status === 'completed') entry.activeCount += 1
  })

  const monthlyTrend: MonthlyOnboardingTrend[] = Array.from(monthlyMap.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return {
    funnel, stuckMerchants, monthlyTrend,
    avgDaysToActive: null,
    conversionRate: fmtConv(statusCounts.active, merchants.length) ?? 0,
  }
}

// ============================================================================
// TICKET-016: Merchant Activation Timeline
// ============================================================================

export interface ActivationHistogramBucket {
  label: string
  count: number
  minDays: number
  maxDays: number
}

export interface NeverActivatedMerchant {
  id: string
  name: string
  createdAt: string
  daysSinceCreation: number
  hasLogo: boolean
  hasLocation: boolean
  hasMenu: boolean
  hasStaff: boolean
  hasDevice: boolean
  onboardingScore: number // 0-6 checklist items (logo, location, menu, staff, device, order)
}

export interface MerchantActivationData {
  histogram: ActivationHistogramBucket[]
  neverActivated: NeverActivatedMerchant[]
  avgDaysToActivate: number | null
  medianDaysToActivate: number | null
  activatedThisMonth: number
  totalMerchantsWithOrders: number
  momImprovement: {
    thisMonthAvgDays: number | null
    lastMonthAvgDays: number | null
    /** Negative = improved (faster activation). Null if either month has no data. */
    delta: number | null
  }
}

export async function getMerchantActivationTimeline(): Promise<MerchantActivationData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()
  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [merchantsRes, firstOrdersRes] = await Promise.all([
    supabase.from('merchants').select('id, name, created_at'),
    supabase.from('orders')
      .select('merchant_id, created_at')
      .in('status', ['completed', 'paid'])
      .order('created_at', { ascending: true }),
  ])

  const merchants = merchantsRes.data || []
  const orders = firstOrdersRes.data || []

  const firstOrderMap = new Map<string, string>()
  orders.forEach(o => {
    if (!firstOrderMap.has(o.merchant_id)) firstOrderMap.set(o.merchant_id, o.created_at)
  })

  const buckets: ActivationHistogramBucket[] = [
    { label: '<1 day', count: 0, minDays: 0, maxDays: 1 },
    { label: '1–3 days', count: 0, minDays: 1, maxDays: 3 },
    { label: '3–7 days', count: 0, minDays: 3, maxDays: 7 },
    { label: '7–14 days', count: 0, minDays: 7, maxDays: 14 },
    { label: '14–30 days', count: 0, minDays: 14, maxDays: 30 },
    { label: '30+ days', count: 0, minDays: 30, maxDays: Infinity },
  ]

  const daysToActivate: number[] = []
  let activatedThisMonth = 0
  const thisMonthDays: number[] = []
  const lastMonthDays: number[] = []

  merchants.forEach(m => {
    const firstOrderAt = firstOrderMap.get(m.id)
    if (!firstOrderAt) return
    const days = Math.floor((new Date(firstOrderAt).getTime() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24))
    if (days < 0) return
    daysToActivate.push(days)
    const bucket = buckets.find(b => days >= b.minDays && days < b.maxDays)
    if (bucket) bucket.count += 1
    const firstOrderDate = new Date(firstOrderAt)
    if (firstOrderDate >= startOfThisMonth) {
      activatedThisMonth += 1
      thisMonthDays.push(days)
    } else if (firstOrderDate >= startOfLastMonth && firstOrderDate < startOfThisMonth) {
      lastMonthDays.push(days)
    }
  })

  const avgDaysToActivate = daysToActivate.length > 0
    ? Math.round(daysToActivate.reduce((a, b) => a + b, 0) / daysToActivate.length * 10) / 10
    : null
  const sortedDays = [...daysToActivate].sort((a, b) => a - b)
  const midIdx = Math.floor(sortedDays.length / 2)
  const medianDaysToActivate = sortedDays.length > 0
    ? sortedDays.length % 2 === 0 ? (sortedDays[midIdx - 1] + sortedDays[midIdx]) / 2 : sortedDays[midIdx]
    : null

  const thisMonthAvgDays = thisMonthDays.length > 0
    ? Math.round(thisMonthDays.reduce((a, b) => a + b, 0) / thisMonthDays.length * 10) / 10
    : null
  const lastMonthAvgDays = lastMonthDays.length > 0
    ? Math.round(lastMonthDays.reduce((a, b) => a + b, 0) / lastMonthDays.length * 10) / 10
    : null
  const momDelta = thisMonthAvgDays !== null && lastMonthAvgDays !== null
    ? Math.round((thisMonthAvgDays - lastMonthAvgDays) * 10) / 10
    : null

  const neverActivatedRaw = merchants.filter(m => {
    const days = Math.floor((now.getTime() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24))
    return days > 30 && !firstOrderMap.has(m.id)
  })

  const naIds = neverActivatedRaw.slice(0, 50).map(m => m.id)
  const [menuRes, staffRes, stationsRes, locationsRes] = naIds.length > 0
    ? await Promise.all([
        supabase.from('menu_items').select('merchant_id').in('merchant_id', naIds),
        supabase.from('location_members').select('merchant_id').in('merchant_id', naIds),
        supabase.from('stations').select('merchant_id').in('merchant_id', naIds).eq('is_active', true),
        supabase.from('locations').select('merchant_id').in('merchant_id', naIds).eq('is_active', true),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const hasMenuSet = new Set(menuRes.data?.map(r => r.merchant_id) || [])
  const hasStaffSet = new Set(staffRes.data?.map(r => r.merchant_id) || [])
  const hasDeviceSet = new Set(stationsRes.data?.map(r => r.merchant_id) || [])
  const hasLocationSet = new Set(locationsRes.data?.map(r => r.merchant_id) || [])

  const neverActivated: NeverActivatedMerchant[] = neverActivatedRaw.slice(0, 50).map(m => {
    const hasLogo = false // logo_url not in merchants table
    const hasLocation = hasLocationSet.has(m.id)
    const hasMenu = hasMenuSet.has(m.id)
    const hasStaff = hasStaffSet.has(m.id)
    const hasDevice = hasDeviceSet.has(m.id)
    // 6th criterion (has first order) is always false for never-activated list
    const onboardingScore = [hasLogo, hasLocation, hasMenu, hasStaff, hasDevice].filter(Boolean).length
    return {
      id: m.id,
      name: m.name || 'Unknown',
      createdAt: m.created_at,
      daysSinceCreation: Math.floor((now.getTime() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      hasLogo, hasLocation, hasMenu, hasStaff, hasDevice,
      onboardingScore,
    }
  }).sort((a, b) => b.daysSinceCreation - a.daysSinceCreation)

  return {
    histogram: buckets,
    neverActivated,
    avgDaysToActivate,
    medianDaysToActivate,
    activatedThisMonth,
    totalMerchantsWithOrders: firstOrderMap.size,
    momImprovement: { thisMonthAvgDays, lastMonthAvgDays, delta: momDelta },
  }
}

// ============================================================================
// TICKET-007: Payment Method Mix & Fee Analysis
// ============================================================================

export interface PaymentMethodSplit {
  method: string
  label: string
  transactionCount: number
  totalAmount: number
  percentage: number
  color: string
}

export interface MerchantFeeExposure {
  merchantId: string
  merchantName: string
  cardGPV: number
  cashGPV: number
  totalGPV: number
  cardPercent: number
  estimatedFees: number
}

export interface MonthlyPaymentTrend {
  month: string        // e.g. "2026-01"
  cashPercent: number
  cardPercent: number
  otherPercent: number
  totalGPV: number
}

export interface DualPricingAnalysis {
  merchantsWithDualPricing: number
  estimatedCardSurchargeCollected: number
  estimatedCashDiscountGiven: number
}

export interface PaymentMethodMixData {
  split: PaymentMethodSplit[]
  totalGPV: number
  totalTransactions: number
  cashPercent: number
  cardPercent: number
  feeExposureTable: MerchantFeeExposure[]
  dualPricingAnalysis: DualPricingAnalysis
  monthlyTrend: MonthlyPaymentTrend[]
  periodDays: number
}

const PAYMENT_METHOD_META: Record<string, { label: string; color: string }> = {
  cash: { label: 'Cash', color: '#22c55e' },
  card: { label: 'Card', color: '#2563eb' },
  card_spinapi: { label: 'Card (SpinAPI)', color: '#3b82f6' },
  card_dvpaylite: { label: 'Card (DvPay Lite)', color: '#6366f1' },
  card_manual: { label: 'Card (Manual)', color: '#8b5cf6' },
  gift_card: { label: 'Gift Card', color: '#f59e0b' },
  house_account: { label: 'House Account', color: '#ef4444' },
  external: { label: 'External', color: '#94a3b8' },
}

export async function getPaymentMethodMix(days: number = 30): Promise<PaymentMethodMixData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServiceRoleClient()
  const periodStart = new Date(); periodStart.setDate(periodStart.getDate() - days)

  const { data: payments } = await supabase
    .from('order_payments')
    .select('payment_method, amount, order_id')
    .gte('initiated_at', periodStart.toISOString())

  const emptyDualPricing: DualPricingAnalysis = { merchantsWithDualPricing: 0, estimatedCardSurchargeCollected: 0, estimatedCashDiscountGiven: 0 }

  if (!payments || payments.length === 0) {
    return { split: [], totalGPV: 0, totalTransactions: 0, cashPercent: 0, cardPercent: 0, feeExposureTable: [], dualPricingAnalysis: emptyDualPricing, monthlyTrend: [], periodDays: days }
  }

  const orderIds = [...new Set(payments.map(p => p.order_id).filter(Boolean))]
  const { data: orders } = await supabase
    .from('orders').select('id, merchant_id').in('id', orderIds)
  const orderMerchantMap = new Map((orders || []).map(o => [o.id, o.merchant_id]))

  const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0)

  const methodMap = new Map<string, { count: number; amount: number }>()
  payments.forEach(p => {
    const method = p.payment_method || 'unknown'
    if (!methodMap.has(method)) methodMap.set(method, { count: 0, amount: 0 })
    const e = methodMap.get(method)!; e.count += 1; e.amount += Number(p.amount)
  })

  const split: PaymentMethodSplit[] = Array.from(methodMap.entries())
    .map(([method, v]) => ({
      method, label: PAYMENT_METHOD_META[method]?.label || method,
      transactionCount: v.count, totalAmount: Math.round(v.amount * 100) / 100,
      percentage: totalAmount > 0 ? Math.round((v.amount / totalAmount) * 1000) / 10 : 0,
      color: PAYMENT_METHOD_META[method]?.color || '#94a3b8',
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)

  const cashTotal = methodMap.get('cash')?.amount || 0
  const cardTotal = Array.from(methodMap.entries()).filter(([m]) => m.startsWith('card')).reduce((s, [, v]) => s + v.amount, 0)
  const cashPercent = totalAmount > 0 ? Math.round((cashTotal / totalAmount) * 1000) / 10 : 0
  const cardPercent = totalAmount > 0 ? Math.round((cardTotal / totalAmount) * 1000) / 10 : 0

  const merchantGPVMap = new Map<string, { card: number; cash: number; total: number }>()
  payments.forEach(p => {
    const mid = orderMerchantMap.get(p.order_id); if (!mid) return
    if (!merchantGPVMap.has(mid)) merchantGPVMap.set(mid, { card: 0, cash: 0, total: 0 })
    const e = merchantGPVMap.get(mid)!; const amt = Number(p.amount); e.total += amt
    if (p.payment_method === 'cash') e.cash += amt
    else if (p.payment_method?.startsWith('card')) e.card += amt
  })

  const mids = [...merchantGPVMap.keys()]
  const { data: merchantRows } = mids.length > 0
    ? await supabase.from('merchants').select('id, name').in('id', mids)
    : { data: [] }
  const nameMap = new Map((merchantRows || []).map(m => [m.id, m.name || 'Unknown']))

  const feeExposureTable: MerchantFeeExposure[] = Array.from(merchantGPVMap.entries())
    .map(([mid, v]) => ({
      merchantId: mid, merchantName: nameMap.get(mid) || 'Unknown',
      cardGPV: Math.round(v.card * 100) / 100, cashGPV: Math.round(v.cash * 100) / 100,
      totalGPV: Math.round(v.total * 100) / 100,
      cardPercent: v.total > 0 ? Math.round((v.card / v.total) * 1000) / 10 : 0,
      estimatedFees: Math.round(v.card * 0.025 * 100) / 100,
    }))
    .sort((a, b) => b.cardPercent - a.cardPercent).slice(0, 50)

  // --- Dual pricing analysis ---
  const allMerchantIds = [...merchantGPVMap.keys()]
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [dualPricingLocationsRes, trendPaymentsRes] = await Promise.all([
    allMerchantIds.length > 0
      ? supabase.from('locations').select('merchant_id, cash_discount_percentage')
          .in('merchant_id', allMerchantIds).gt('cash_discount_percentage', 0)
      : Promise.resolve({ data: [] }),
    supabase.from('order_payments').select('payment_method, amount, initiated_at')
      .gte('initiated_at', sixMonthsAgo.toISOString()),
  ])

  const dualPricingLocations = dualPricingLocationsRes.data || []
  const dualPricingMerchantSet = new Set(dualPricingLocations.map(l => l.merchant_id))
  const avgCashDiscountRate = dualPricingLocations.length > 0
    ? dualPricingLocations.reduce((sum, l) => sum + Number(l.cash_discount_percentage || 0), 0) / dualPricingLocations.length / 100
    : 0.03

  let estimatedCardSurcharge = 0
  let estimatedCashDiscount = 0
  merchantGPVMap.forEach((v, mid) => {
    if (!dualPricingMerchantSet.has(mid)) return
    estimatedCardSurcharge += v.card * avgCashDiscountRate
    estimatedCashDiscount += v.cash * avgCashDiscountRate
  })

  const dualPricingAnalysis: DualPricingAnalysis = {
    merchantsWithDualPricing: dualPricingMerchantSet.size,
    estimatedCardSurchargeCollected: Math.round(estimatedCardSurcharge * 100) / 100,
    estimatedCashDiscountGiven: Math.round(estimatedCashDiscount * 100) / 100,
  }

  // --- 6-month payment method trend ---
  const trendPayments = trendPaymentsRes.data || []
  const trendMonthMap = new Map<string, { cash: number; card: number; other: number; total: number }>()
  trendPayments.forEach(p => {
    const d = new Date(p.initiated_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!trendMonthMap.has(key)) trendMonthMap.set(key, { cash: 0, card: 0, other: 0, total: 0 })
    const e = trendMonthMap.get(key)!; const amt = Number(p.amount)
    e.total += amt
    if (p.payment_method === 'cash') e.cash += amt
    else if (p.payment_method?.startsWith('card')) e.card += amt
    else e.other += amt
  })

  const monthlyTrend: MonthlyPaymentTrend[] = Array.from(trendMonthMap.entries())
    .map(([month, v]) => ({
      month,
      cashPercent: v.total > 0 ? Math.round((v.cash / v.total) * 1000) / 10 : 0,
      cardPercent: v.total > 0 ? Math.round((v.card / v.total) * 1000) / 10 : 0,
      otherPercent: v.total > 0 ? Math.round((v.other / v.total) * 1000) / 10 : 0,
      totalGPV: Math.round(v.total * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6) // keep last 6 months

  return { split, totalGPV: Math.round(totalAmount * 100) / 100, totalTransactions: payments.length, cashPercent, cardPercent, feeExposureTable, dualPricingAnalysis, monthlyTrend, periodDays: days }
}

// ============================================================================
// TICKET-008: Void & Refund Intelligence
// ============================================================================

export interface VoidAnomalyMerchant {
  merchantId: string
  merchantName: string
  totalOrders: number
  voidedOrders: number
  refundedOrders: number
  refundAmount: number
  voidRate: number
  isAnomaly: boolean
  topVoidReason: string | null
}

export interface VoidReasonBreakdown {
  reason: string
  count: number
  percentage: number
}

export interface StaffVoidEntry {
  staffId: string
  staffName: string
  merchantName: string
  voidCount: number
}

export interface VoidRefundData {
  platformVoidRate: number
  platformRefundRate: number
  merchantAnomalies: VoidAnomalyMerchant[]
  voidReasonBreakdown: VoidReasonBreakdown[]
  staffVoidLeaderboard: StaffVoidEntry[]
  periodDays: number
}

export async function getVoidRefundIntelligence(days: number = 30): Promise<VoidRefundData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()
  const periodStart = new Date(); periodStart.setDate(periodStart.getDate() - days)

  const [ordersRes, voidReasonsRes, voidedItemsRes] = await Promise.all([
    supabase.from('orders').select('id, merchant_id, status, total_amount')
      .not('status', 'in', '(draft,cancelled)').gte('created_at', periodStart.toISOString()),
    supabase.from('order_status_history').select('reason, to_status, order_id')
      .in('to_status', ['void', 'refunded']).gte('created_at', periodStart.toISOString()),
    supabase.from('order_items').select('voided_by, order_id')
      .not('voided_by', 'is', null).gte('created_at', periodStart.toISOString()),
  ])

  const orders = ordersRes.data || []
  const totalOrders = orders.length
  const totalVoided = orders.filter(o => o.status === 'void').length
  const totalRefunded = orders.filter(o => o.status === 'refunded').length

  const platformVoidRate = totalOrders > 0 ? Math.round((totalVoided / totalOrders) * 10000) / 100 : 0
  const platformRefundRate = totalOrders > 0 ? Math.round((totalRefunded / totalOrders) * 10000) / 100 : 0

  // Build order_id → merchant_id lookup (needed for joining void reasons and voided items)
  const orderMerchantMap = new Map(orders.map(o => [o.id, o.merchant_id]))

  const merchantMap = new Map<string, { total: number; voided: number; refunded: number; refundedAmount: number }>()
  orders.forEach(o => {
    if (!merchantMap.has(o.merchant_id)) merchantMap.set(o.merchant_id, { total: 0, voided: 0, refunded: 0, refundedAmount: 0 })
    const e = merchantMap.get(o.merchant_id)!; e.total += 1
    if (o.status === 'void') e.voided += 1
    if (o.status === 'refunded') { e.refunded += 1; e.refundedAmount += Number(o.total_amount || 0) }
  })

  const mids = [...merchantMap.keys()]
  const { data: merchantRows } = mids.length > 0
    ? await supabase.from('merchants').select('id, name').in('id', mids)
    : { data: [] }
  const nameMap = new Map((merchantRows || []).map(m => [m.id, m.name || 'Unknown']))

  // Build per-merchant top void reason map
  const merchantReasonMap = new Map<string, Map<string, number>>()
  const voidReasons = voidReasonsRes.data || []
  voidReasons.forEach(r => {
    const mid = r.order_id ? orderMerchantMap.get(r.order_id) : null
    if (!mid) return
    if (!merchantReasonMap.has(mid)) merchantReasonMap.set(mid, new Map())
    const key = r.reason || 'unknown'
    const byReason = merchantReasonMap.get(mid)!
    byReason.set(key, (byReason.get(key) || 0) + 1)
  })

  const ANOMALY_THRESHOLD = platformVoidRate * 2
  const merchantAnomalies: VoidAnomalyMerchant[] = Array.from(merchantMap.entries())
    .map(([mid, v]) => {
      const voidRate = v.total > 0 ? Math.round((v.voided / v.total) * 10000) / 100 : 0
      const byReason = merchantReasonMap.get(mid)
      const topVoidReason = byReason && byReason.size > 0
        ? [...byReason.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : null
      return {
        merchantId: mid, merchantName: nameMap.get(mid) || 'Unknown',
        totalOrders: v.total, voidedOrders: v.voided, refundedOrders: v.refunded,
        refundAmount: Math.round(v.refundedAmount * 100) / 100,
        voidRate, isAnomaly: voidRate > ANOMALY_THRESHOLD && voidRate > 0,
        topVoidReason,
      }
    })
    .filter(m => m.voidedOrders > 0 || m.refundedOrders > 0)
    .sort((a, b) => b.voidRate - a.voidRate).slice(0, 50)

  // Platform-wide void reason breakdown
  const reasonMap = new Map<string, number>()
  voidReasons.forEach(r => { const k = r.reason || 'unknown'; reasonMap.set(k, (reasonMap.get(k) || 0) + 1) })
  const totalReasonCount = voidReasons.length
  const voidReasonBreakdown: VoidReasonBreakdown[] = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count, percentage: totalReasonCount > 0 ? Math.round((count / totalReasonCount) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count)

  // Staff void leaderboard (from order_items.voided_by)
  const voidedItems = voidedItemsRes.data || []
  const staffVoidMap = new Map<string, { merchantIds: Set<string>; count: number }>()
  voidedItems.forEach(item => {
    if (!item.voided_by) return
    const mid = item.order_id ? orderMerchantMap.get(item.order_id) : null
    if (!staffVoidMap.has(item.voided_by)) staffVoidMap.set(item.voided_by, { merchantIds: new Set(), count: 0 })
    const e = staffVoidMap.get(item.voided_by)!
    e.count += 1
    if (mid) e.merchantIds.add(mid)
  })

  const staffIds = [...staffVoidMap.keys()]
  const serviceSupabase = createServiceRoleClient()
  const { data: staffRows } = staffIds.length > 0
    ? await serviceSupabase.from('staff_profiles').select('id, first_name, last_name, display_name, merchant_id').in('id', staffIds)
    : { data: [] }
  const staffNameMap = new Map((staffRows || []).map(s => [
    s.id,
    s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
  ]))

  const staffVoidLeaderboard: StaffVoidEntry[] = Array.from(staffVoidMap.entries())
    .map(([staffId, v]) => {
      const staffRow = staffRows?.find(s => s.id === staffId)
      const primaryMerchantId = staffRow?.merchant_id ?? [...v.merchantIds][0]
      return {
        staffId,
        staffName: staffNameMap.get(staffId) || 'Unknown',
        merchantName: primaryMerchantId ? (nameMap.get(primaryMerchantId) || 'Unknown') : 'Unknown',
        voidCount: v.count,
      }
    })
    .sort((a, b) => b.voidCount - a.voidCount)
    .slice(0, 15)

  return { platformVoidRate, platformRefundRate, merchantAnomalies, voidReasonBreakdown, staffVoidLeaderboard, periodDays: days }
}

// ============================================================================
// TICKET-009: Discount Usage & Abuse Detection
// ============================================================================

export interface MerchantDiscountRate {
  merchantId: string
  merchantName: string
  discountCount: number
  discountAmount: number
  grossRevenue: number
  discountRate: number
  isFlagged: boolean
}

export interface StaffDiscountEntry {
  staffId: string
  staffName: string
  merchantName: string
  discountCount: number
  totalDiscountAmount: number
  requiresManagerApprovalCount: number
}

export interface DiscountTypeBreakdown {
  type: string
  count: number
  percentage: number
}

export interface DiscountScopeBreakdown {
  scope: 'item' | 'order' | 'both' | 'unknown'
  count: number
  percentage: number
}

export interface DiscountAbuseData {
  totalDiscountAmount30d: number
  discountAsPercentOfRevenue: number
  discountedOrdersCount: number
  totalOrdersCount: number
  merchantDiscountRates: MerchantDiscountRate[]
  staffLeaderboard: StaffDiscountEntry[]
  typeBreakdown: DiscountTypeBreakdown[]
  scopeBreakdown: DiscountScopeBreakdown[]
  periodDays: number
}

export async function getDiscountUsageAnalysis(days: number = 30): Promise<DiscountAbuseData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()
  const periodStart = new Date(); periodStart.setDate(periodStart.getDate() - days)

  // discount_usage_log has no merchant_id or created_at — use applied_at and join via order_id
  const [discountLogsRes, ordersRes] = await Promise.all([
    supabase.from('discount_usage_log')
      .select('order_id, discount_amount, applied_by_staff_profiles_id, discount_id')
      .gte('applied_at', periodStart.toISOString()),
    supabase.from('orders').select('id, merchant_id, total_amount')
      .not('status', 'in', '(draft,cancelled,void)').gte('created_at', periodStart.toISOString()),
  ])

  const discountLogs = discountLogsRes.data || []
  const orders = ordersRes.data || []

  // Build order_id → merchant_id lookup from the orders we have
  const orderMerchantMap = new Map(orders.map(o => [o.id, o.merchant_id]))

  // Enrich discount logs with merchant_id
  const enrichedLogs = discountLogs.map(d => ({
    ...d,
    merchant_id: d.order_id ? (orderMerchantMap.get(d.order_id) ?? null) : null,
  })).filter(d => d.merchant_id !== null)

  const totalDiscountAmount30d = enrichedLogs.reduce((sum, d) => sum + Number(d.discount_amount || 0), 0)
  const grossRevenue = orders.reduce((sum, o) => sum + Number(o.total_amount), 0)
  const discountAsPercentOfRevenue = grossRevenue > 0 ? Math.round((totalDiscountAmount30d / grossRevenue) * 10000) / 100 : 0

  const merchantDiscountMap = new Map<string, { count: number; amount: number }>()
  enrichedLogs.forEach(d => {
    const mid = d.merchant_id!
    if (!merchantDiscountMap.has(mid)) merchantDiscountMap.set(mid, { count: 0, amount: 0 })
    const e = merchantDiscountMap.get(mid)!; e.count += 1; e.amount += Number(d.discount_amount || 0)
  })

  const merchantRevenueMap = new Map<string, number>()
  orders.forEach(o => merchantRevenueMap.set(o.merchant_id, (merchantRevenueMap.get(o.merchant_id) || 0) + Number(o.total_amount)))

  const allMids = [...new Set([...merchantDiscountMap.keys(), ...merchantRevenueMap.keys()])]

  // Fetch discounts and merchants in parallel — discounts must come before staffMap loop
  const discountIds = [...new Set(enrichedLogs.map(d => d.discount_id).filter(Boolean))]
  const [discountRes, merchantRes] = await Promise.all([
    discountIds.length > 0
      ? supabase.from('discounts').select('id, discount_type, scope, requires_manager_approval').in('id', discountIds)
      : Promise.resolve({ data: [] }),
    allMids.length > 0
      ? supabase.from('merchants').select('id, name').in('id', allMids)
      : Promise.resolve({ data: [] }),
  ])
  const discountRows = discountRes.data || []
  const discountTypeMap = new Map(discountRows.map(d => [d.id, d.discount_type || 'unknown']))
  const discountScopeMap = new Map(discountRows.map(d => [d.id, (d.scope as string) || 'unknown']))
  const discountApprovalMap = new Map(discountRows.map(d => [d.id, !!d.requires_manager_approval]))
  const nameMap = new Map((merchantRes.data || []).map(m => [m.id, m.name || 'Unknown']))

  const merchantDiscountRates: MerchantDiscountRate[] = allMids
    .filter(mid => merchantDiscountMap.has(mid))
    .map(mid => {
      const dv = merchantDiscountMap.get(mid)!
      const rev = merchantRevenueMap.get(mid) || 0
      const rate = rev > 0 ? Math.round((dv.amount / rev) * 10000) / 100 : 0
      return {
        merchantId: mid, merchantName: nameMap.get(mid) || 'Unknown',
        discountCount: dv.count, discountAmount: Math.round(dv.amount * 100) / 100,
        grossRevenue: Math.round(rev * 100) / 100, discountRate: rate, isFlagged: rate > 10,
      }
    })
    .sort((a, b) => b.discountRate - a.discountRate).slice(0, 50)

  const staffMap = new Map<string, { merchantId: string; count: number; amount: number; approvalCount: number }>()
  enrichedLogs.forEach(d => {
    if (!d.applied_by_staff_profiles_id) return
    if (!staffMap.has(d.applied_by_staff_profiles_id)) staffMap.set(d.applied_by_staff_profiles_id, { merchantId: d.merchant_id!, count: 0, amount: 0, approvalCount: 0 })
    const e = staffMap.get(d.applied_by_staff_profiles_id)!
    e.count += 1
    e.amount += Number(d.discount_amount || 0)
    if (d.discount_id && discountApprovalMap.get(d.discount_id)) e.approvalCount += 1
  })

  const staffIds = [...staffMap.keys()]
  const serviceSupabase = createServiceRoleClient()
  const { data: staffRows } = staffIds.length > 0
    ? await serviceSupabase.from('staff_profiles').select('id, first_name, last_name, display_name, merchant_id').in('id', staffIds)
    : { data: [] }
  const staffNameMap = new Map((staffRows || []).map(s => [
    s.id,
    s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
  ]))

  const staffLeaderboard: StaffDiscountEntry[] = Array.from(staffMap.entries())
    .map(([staffId, v]) => ({
      staffId, staffName: staffNameMap.get(staffId) || 'Unknown',
      merchantName: nameMap.get(v.merchantId) || 'Unknown',
      discountCount: v.count, totalDiscountAmount: Math.round(v.amount * 100) / 100,
      requiresManagerApprovalCount: v.approvalCount,
    }))
    .sort((a, b) => b.totalDiscountAmount - a.totalDiscountAmount).slice(0, 20)

  const typeCountMap = new Map<string, number>()
  enrichedLogs.forEach(d => {
    const type = discountTypeMap.get(d.discount_id) || 'unknown'
    typeCountMap.set(type, (typeCountMap.get(type) || 0) + 1)
  })
  const typeBreakdown: DiscountTypeBreakdown[] = Array.from(typeCountMap.entries())
    .map(([type, count]) => ({
      type, count,
      percentage: enrichedLogs.length > 0 ? Math.round((count / enrichedLogs.length) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)

  const scopeCountMap = new Map<string, number>()
  enrichedLogs.forEach(d => {
    const scope = discountScopeMap.get(d.discount_id) || 'unknown'
    scopeCountMap.set(scope, (scopeCountMap.get(scope) || 0) + 1)
  })
  const scopeBreakdown: DiscountScopeBreakdown[] = Array.from(scopeCountMap.entries())
    .map(([scope, count]) => ({
      scope: scope as DiscountScopeBreakdown['scope'], count,
      percentage: enrichedLogs.length > 0 ? Math.round((count / enrichedLogs.length) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    totalDiscountAmount30d: Math.round(totalDiscountAmount30d * 100) / 100,
    discountAsPercentOfRevenue, discountedOrdersCount: enrichedLogs.length,
    totalOrdersCount: orders.length, merchantDiscountRates, staffLeaderboard, typeBreakdown, scopeBreakdown, periodDays: days,
  }
}

// ============================================================================
// TICKET-012: Staff Session & Labor Analytics
// ============================================================================

export interface MerchantLaborStat {
  merchantId: string
  merchantName: string
  activeStaff: number
  totalHours: number
  totalOrders: number
  hoursPerOrder: number | null
  openShiftsCount: number
}

export interface HourlyStaffPattern {
  hour: number        // 0-23
  label: string       // "12am", "6am", "12pm", "6pm", etc.
  shiftCount: number  // total shifts that started in this hour across the period
}

export interface DayOfWeekPattern {
  day: string         // "Sun", "Mon", ..., "Sat"
  dayIndex: number    // 0=Sun, 6=Sat
  shiftCount: number
}

export interface SessionHealthSummary {
  totalSessions: number
  avgSessionMinutes: number | null
  kickedSessions: number
  kickedPercent: number
  crashedSessions: number
  crashedPercent: number
}

export interface StaffLaborData {
  totalStaffHours: number
  totalActiveStaff: number
  avgHoursPerStaffPerWeek: number
  openShiftsCount: number
  merchantStats: MerchantLaborStat[]
  hourlyPattern: HourlyStaffPattern[]
  dayOfWeekPattern: DayOfWeekPattern[]
  sessionHealth: SessionHealthSummary
  periodDays: number
}

const HOUR_LABELS = [
  '12am','1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am',
  '12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm',
]

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export async function getStaffLaborAnalytics(days: number = 30): Promise<StaffLaborData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()

  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - days)

  const emptyResult: StaffLaborData = {
    totalStaffHours: 0,
    totalActiveStaff: 0,
    avgHoursPerStaffPerWeek: 0,
    openShiftsCount: 0,
    merchantStats: [],
    hourlyPattern: HOUR_LABELS.map((label, hour) => ({ hour, label, shiftCount: 0 })),
    dayOfWeekPattern: DAY_LABELS.map((day, dayIndex) => ({ day, dayIndex, shiftCount: 0 })),
    sessionHealth: { totalSessions: 0, avgSessionMinutes: null, kickedSessions: 0, kickedPercent: 0, crashedSessions: 0, crashedPercent: 0 },
    periodDays: days,
  }

  // Parallel fetch: shifts, orders, merchants, sessions
  const [shiftsRes, ordersRes, merchantsRes, sessionsRes] = await Promise.all([
    supabase
      .from('staff_shifts')
      .select('staff_profile_id, merchant_id, clock_in_time, clock_out_time, status')
      .gte('clock_in_time', periodStart.toISOString())
      .neq('status', 'cancelled'),
    supabase
      .from('orders')
      .select('id, merchant_id')
      .in('status', ['completed', 'paid'])
      .gte('created_at', periodStart.toISOString()),
    supabase
      .from('merchants')
      .select('id, name'),
    supabase
      .from('station_sessions')
      .select('id, session_status, kick_reason, started_at, ended_at')
      .gte('started_at', periodStart.toISOString()),
  ])

  const shifts = shiftsRes.data || []
  const orders = ordersRes.data || []
  const merchants = merchantsRes.data || []
  const sessions = sessionsRes.data || []

  if (shifts.length === 0 && sessions.length === 0) return emptyResult

  const merchantNameMap = new Map(merchants.map(m => [m.id, m.name]))

  // ── Per-merchant aggregation ──────────────────────────────────────────────
  // Only count hours from COMPLETED shifts (clock_out_time present).
  // Open/active shifts have no finalized duration — using NOW() as end time
  // inflates totals with stuck/forgotten clock-ins.
  const merchantMap = new Map<string, { staffIds: Set<string>; totalHours: number; openShifts: number }>()

  shifts.forEach(shift => {
    const mid = shift.merchant_id
    if (!merchantMap.has(mid)) {
      merchantMap.set(mid, { staffIds: new Set(), totalHours: 0, openShifts: 0 })
    }
    const entry = merchantMap.get(mid)!
    if (shift.staff_profile_id) entry.staffIds.add(shift.staff_profile_id)
    if (shift.clock_out_time) {
      // Completed shift — count actual hours, cap at 24h for data integrity
      const hours = Math.max(0, (new Date(shift.clock_out_time).getTime() - new Date(shift.clock_in_time).getTime()) / (1000 * 60 * 60))
      entry.totalHours += Math.min(hours, 24)
    } else {
      // Still open (active) — track count for the warning badge, skip hours
      entry.openShifts += 1
    }
  })

  // Order counts per merchant
  const merchantOrderCount = new Map<string, number>()
  orders.forEach(o => {
    merchantOrderCount.set(o.merchant_id, (merchantOrderCount.get(o.merchant_id) || 0) + 1)
  })

  const merchantStats: MerchantLaborStat[] = Array.from(merchantMap.entries())
    .map(([merchantId, v]) => {
      const totalOrders = merchantOrderCount.get(merchantId) || 0
      const totalHours = Math.round(v.totalHours * 10) / 10
      return {
        merchantId,
        merchantName: merchantNameMap.get(merchantId) || 'Unknown',
        activeStaff: v.staffIds.size,
        totalHours,
        totalOrders,
        hoursPerOrder: totalOrders > 0 ? Math.round((totalHours / totalOrders) * 100) / 100 : null,
        openShiftsCount: v.openShifts,
      }
    })
    .sort((a, b) => b.totalHours - a.totalHours)

  // ── Platform totals ───────────────────────────────────────────────────────
  const totalStaffHours = Math.round(merchantStats.reduce((s, m) => s + m.totalHours, 0) * 10) / 10
  const totalActiveStaff = new Set(
    shifts.filter(s => s.staff_profile_id).map(s => s.staff_profile_id)
  ).size
  const openShiftsCount = shifts.filter(s => !s.clock_out_time).length
  const weeks = days / 7
  // Use only staff who have at least one completed shift for the avg calculation
  const staffWithCompletedShifts = new Set(
    shifts.filter(s => s.staff_profile_id && s.clock_out_time).map(s => s.staff_profile_id)
  ).size
  const avgHoursPerStaffPerWeek = staffWithCompletedShifts > 0 && weeks > 0
    ? Math.round((totalStaffHours / staffWithCompletedShifts / weeks) * 10) / 10
    : 0

  // ── Hourly pattern (by clock-in hour) ────────────────────────────────────
  const hourCounts = new Array(24).fill(0)
  shifts.forEach(shift => {
    const h = new Date(shift.clock_in_time).getHours()
    hourCounts[h] += 1
  })
  const hourlyPattern: HourlyStaffPattern[] = HOUR_LABELS.map((label, hour) => ({
    hour, label, shiftCount: hourCounts[hour],
  }))

  // ── Day of week pattern ───────────────────────────────────────────────────
  const dayCounts = new Array(7).fill(0)
  shifts.forEach(shift => {
    const d = new Date(shift.clock_in_time).getDay() // 0=Sun
    dayCounts[d] += 1
  })
  const dayOfWeekPattern: DayOfWeekPattern[] = DAY_LABELS.map((day, dayIndex) => ({
    day, dayIndex, shiftCount: dayCounts[dayIndex],
  }))

  // ── Session health ────────────────────────────────────────────────────────
  const totalSessions = sessions.length
  const kickedSessions = sessions.filter(s => s.session_status === 'kicked').length
  const crashedSessions = sessions.filter(s => s.kick_reason !== null && s.session_status !== 'kicked').length

  const completedWithDuration = sessions.filter(s => s.ended_at && s.started_at)
  const avgSessionMinutes = completedWithDuration.length > 0
    ? Math.round(
        completedWithDuration.reduce((sum, s) => {
          const mins = (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 60000
          return sum + Math.max(0, mins)
        }, 0) / completedWithDuration.length
      )
    : null

  const sessionHealth: SessionHealthSummary = {
    totalSessions,
    avgSessionMinutes,
    kickedSessions,
    kickedPercent: totalSessions > 0 ? Math.round((kickedSessions / totalSessions) * 1000) / 10 : 0,
    crashedSessions,
    crashedPercent: totalSessions > 0 ? Math.round((crashedSessions / totalSessions) * 1000) / 10 : 0,
  }

  return {
    totalStaffHours,
    totalActiveStaff,
    avgHoursPerStaffPerWeek,
    openShiftsCount,
    merchantStats,
    hourlyPattern,
    dayOfWeekPattern,
    sessionHealth,
    periodDays: days,
  }
}

// ============================================================================
// TICKET-013: Order Type Intelligence
// ============================================================================

export interface OrderTypeStat {
  type: string
  label: string
  orderCount: number
  totalGPV: number
  avgOrderValue: number
  percentage: number    // % of total orders by count
  gpvPercentage: number // % of total GPV
  color: string
}

export interface OrderTypeTrendPoint {
  date: string
  dine_in: number
  takeout: number
  delivery: number
  online: number
}

export interface OrderTypeMerchantRow {
  merchantId: string
  merchantName: string
  dominantType: string
  dineInCount: number
  takeoutCount: number
  deliveryCount: number
  onlineCount: number
  totalOrders: number
  dineInPct: number
  takeoutPct: number
  deliveryPct: number
  onlinePct: number
}

export interface ChannelStat {
  channel: string
  label: string
  orderCount: number
  totalGPV: number
  avgOrderValue: number
  percentage: number
  color: string
}

export interface OrderTypeIntelligenceData {
  breakdown: OrderTypeStat[]
  totalOrders: number
  totalGPV: number
  weeklyTrend: OrderTypeTrendPoint[]
  merchantBreakdown: OrderTypeMerchantRow[]
  periodDays: number
  channelBreakdown?: ChannelStat[]
}

const ORDER_TYPE_META: Record<string, { label: string; color: string }> = {
  dine_in:  { label: 'Dine In',  color: '#3b82f6' },
  takeout:  { label: 'Takeout',  color: '#22c55e' },
  delivery: { label: 'Delivery', color: '#f59e0b' },
  online:   { label: 'Online',   color: '#8b5cf6' },
  catering: { label: 'Catering', color: '#ec4899' },
}

export async function getOrderTypeIntelligence(days: number = 30): Promise<OrderTypeIntelligenceData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()
  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - days)

  const empty: OrderTypeIntelligenceData = {
    breakdown: [], totalOrders: 0, totalGPV: 0, weeklyTrend: [], merchantBreakdown: [], periodDays: days,
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_type, total_amount, merchant_id, created_at')
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('created_at', periodStart.toISOString())

  if (error || !orders || orders.length === 0) return empty

  const totalOrders = orders.length
  const totalGPV = orders.reduce((s, o) => s + Number(o.total_amount), 0)

  // ── Aggregate by type ────────────────────────────────────────────────────
  const typeMap = new Map<string, { count: number; gpv: number }>()
  orders.forEach(o => {
    const t = (o.order_type as string) || 'unknown'
    if (!typeMap.has(t)) typeMap.set(t, { count: 0, gpv: 0 })
    const e = typeMap.get(t)!
    e.count++; e.gpv += Number(o.total_amount)
  })

  const breakdown: OrderTypeStat[] = Array.from(typeMap.entries())
    .map(([type, v]) => ({
      type,
      label: ORDER_TYPE_META[type]?.label ?? type.replace(/_/g, ' '),
      orderCount: v.count,
      totalGPV: Math.round(v.gpv * 100) / 100,
      avgOrderValue: v.count > 0 ? Math.round((v.gpv / v.count) * 100) / 100 : 0,
      percentage: totalOrders > 0 ? Math.round((v.count / totalOrders) * 1000) / 10 : 0,
      gpvPercentage: totalGPV > 0 ? Math.round((v.gpv / totalGPV) * 1000) / 10 : 0,
      color: ORDER_TYPE_META[type]?.color ?? '#94a3b8',
    }))
    .sort((a, b) => b.orderCount - a.orderCount)

  // ── Daily trend ───────────────────────────────────────────────────────────
  const trendStart = new Date()
  trendStart.setDate(trendStart.getDate() - Math.min(days, 28))
  const recentOrders = orders.filter(o => new Date(o.created_at) >= trendStart)

  const dateTypeMap = new Map<string, Record<string, number>>()
  recentOrders.forEach(o => {
    const date = o.created_at.slice(0, 10)
    if (!dateTypeMap.has(date)) dateTypeMap.set(date, { dine_in: 0, takeout: 0, delivery: 0, online: 0 })
    const e = dateTypeMap.get(date)!
    const t = (o.order_type as string) || 'unknown'
    e[t] = (e[t] ?? 0) + 1
  })

  const weeklyTrend: OrderTypeTrendPoint[] = Array.from(dateTypeMap.entries())
    .map(([date, counts]) => ({
      date,
      dine_in:  counts.dine_in  ?? 0,
      takeout:  counts.takeout  ?? 0,
      delivery: counts.delivery ?? 0,
      online:   counts.online   ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // ── Per-merchant breakdown ────────────────────────────────────────────────
  const merchantTypeMap = new Map<string, Record<string, number>>()
  orders.forEach(o => {
    const mid = o.merchant_id
    if (!merchantTypeMap.has(mid)) merchantTypeMap.set(mid, { dine_in: 0, takeout: 0, delivery: 0, online: 0 })
    const e = merchantTypeMap.get(mid)!
    const t = (o.order_type as string) || 'unknown'
    e[t] = (e[t] ?? 0) + 1
  })

  const merchantIds = [...merchantTypeMap.keys()]
  const { data: merchantRows } = merchantIds.length > 0
    ? await supabase.from('merchants').select('id, name').in('id', merchantIds)
    : { data: [] }
  const merchantNameMap = new Map((merchantRows ?? []).map(m => [m.id, m.name ?? 'Unknown']))

  const merchantBreakdown: OrderTypeMerchantRow[] = Array.from(merchantTypeMap.entries())
    .map(([mid, counts]) => {
      const total = (counts.dine_in ?? 0) + (counts.takeout ?? 0) + (counts.delivery ?? 0) + (counts.online ?? 0)
      const dominant = Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'unknown'
      return {
        merchantId: mid,
        merchantName: merchantNameMap.get(mid) ?? 'Unknown',
        dominantType: dominant,
        dineInCount:   counts.dine_in  ?? 0,
        takeoutCount:  counts.takeout  ?? 0,
        deliveryCount: counts.delivery ?? 0,
        onlineCount:   counts.online   ?? 0,
        totalOrders: total,
        dineInPct:   total > 0 ? Math.round(((counts.dine_in  ?? 0) / total) * 1000) / 10 : 0,
        takeoutPct:  total > 0 ? Math.round(((counts.takeout  ?? 0) / total) * 1000) / 10 : 0,
        deliveryPct: total > 0 ? Math.round(((counts.delivery ?? 0) / total) * 1000) / 10 : 0,
        onlinePct:   total > 0 ? Math.round(((counts.online   ?? 0) / total) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => b.totalOrders - a.totalOrders)
    .slice(0, 40)

  return { breakdown, totalOrders, totalGPV: Math.round(totalGPV * 100) / 100, weeklyTrend, merchantBreakdown, periodDays: days }
}

// ============================================================================
// TICKET-018: Multi-Location Comparison
// ============================================================================

export interface SparklinePoint {
  date: string
  gpv: number
}

export interface LocationMetrics {
  locationId: string
  locationName: string
  merchantId: string
  merchantName: string
  totalGPV: number
  orderCount: number
  avgOrderValue: number
  voidCount: number
  voidRate: number
  gpvRank: number
  trendVsPrev: number | null
  staffCount: number
  deviceCount: number
  sparkline: SparklinePoint[]
}

export interface MultiLocationComparisonData {
  locations: LocationMetrics[]
  totalLocations: number
  avgGPVPerLocation: number
  medianGPVPerLocation: number
  topLocation: LocationMetrics | null
  bottomLocation: LocationMetrics | null
  periodDays: number
}

export async function getMultiLocationComparison(days: number = 30): Promise<MultiLocationComparisonData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()
  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - days)
  const prevPeriodStart = new Date()
  prevPeriodStart.setDate(prevPeriodStart.getDate() - days * 2)

  const empty: MultiLocationComparisonData = {
    locations: [], totalLocations: 0, avgGPVPerLocation: 0, medianGPVPerLocation: 0,
    topLocation: null, bottomLocation: null, periodDays: days,
  }

  const [currentRes, prevRes, locationsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('location_id, merchant_id, total_amount, status, created_at')
      .gte('created_at', periodStart.toISOString()),
    supabase
      .from('orders')
      .select('location_id, total_amount')
      .not('status', 'in', '(draft,cancelled,void)')
      .gte('created_at', prevPeriodStart.toISOString())
      .lt('created_at', periodStart.toISOString()),
    supabase.from('locations').select('id, name, merchant_id').eq('is_active', true),
  ])

  const allOrders = currentRes.data ?? []
  const prevOrders = prevRes.data ?? []
  const locations = locationsRes.data ?? []

  if (locations.length === 0) return empty

  const locationIds = locations.map(l => l.id)

  // Fetch staff counts and device counts per location
  const [staffRes, devicesRes] = await Promise.all([
    supabase
      .from('location_members')
      .select('location_id')
      .in('location_id', locationIds),
    supabase
      .from('stations')
      .select('location_id')
      .in('location_id', locationIds)
      .eq('is_active', true),
  ])

  // Build count maps
  const staffCountMap = new Map<string, number>()
  ;(staffRes.data ?? []).forEach(r => {
    staffCountMap.set(r.location_id, (staffCountMap.get(r.location_id) ?? 0) + 1)
  })
  const deviceCountMap = new Map<string, number>()
  ;(devicesRes.data ?? []).forEach(r => {
    deviceCountMap.set(r.location_id, (deviceCountMap.get(r.location_id) ?? 0) + 1)
  })

  // Current period aggregates + sparkline daily buckets (last 7 days)
  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(now.getDate() - 6)
  const sparklineMap = new Map<string, Map<string, number>>() // locationId -> dateStr -> gpv

  const locMap = new Map<string, { gpv: number; orderCount: number; voidCount: number; merchantId: string }>()
  allOrders.forEach(o => {
    const lid = o.location_id; if (!lid) return
    if (!locMap.has(lid)) locMap.set(lid, { gpv: 0, orderCount: 0, voidCount: 0, merchantId: o.merchant_id })
    const e = locMap.get(lid)!
    if (o.status === 'void') { e.voidCount++; return }
    if (['draft', 'cancelled'].includes(o.status)) return
    e.gpv += Number(o.total_amount); e.orderCount++

    // Build sparkline for last 7 days
    const orderDate = new Date(o.created_at)
    if (orderDate >= sevenDaysAgo) {
      const dateStr = orderDate.toISOString().slice(0, 10)
      if (!sparklineMap.has(lid)) sparklineMap.set(lid, new Map())
      const dayMap = sparklineMap.get(lid)!
      dayMap.set(dateStr, (dayMap.get(dateStr) ?? 0) + Number(o.total_amount))
    }
  })

  // Build 7-day date sequence (always same length)
  const last7Days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    last7Days.push(d.toISOString().slice(0, 10))
  }

  // Previous period by location
  const prevGPVMap = new Map<string, number>()
  prevOrders.forEach(o => {
    if (!o.location_id) return
    prevGPVMap.set(o.location_id, (prevGPVMap.get(o.location_id) ?? 0) + Number(o.total_amount))
  })

  // Merchant names
  const merchantIds = [...new Set(locations.map(l => l.merchant_id))]
  const { data: merchantRows } = merchantIds.length > 0
    ? await supabase.from('merchants').select('id, name').in('id', merchantIds)
    : { data: [] }
  const merchantNameMap = new Map((merchantRows ?? []).map(m => [m.id, m.name ?? 'Unknown']))

  const metrics: LocationMetrics[] = locations
    .map(loc => {
      const s = locMap.get(loc.id) ?? { gpv: 0, orderCount: 0, voidCount: 0, merchantId: loc.merchant_id }
      const prevGPV = prevGPVMap.get(loc.id) ?? 0
      const attempted = s.orderCount + s.voidCount
      const trendVsPrev = prevGPV > 0
        ? Math.round(((s.gpv - prevGPV) / prevGPV) * 1000) / 10
        : null
      const dayMap = sparklineMap.get(loc.id) ?? new Map<string, number>()
      const sparkline: SparklinePoint[] = last7Days.map(date => ({
        date,
        gpv: Math.round((dayMap.get(date) ?? 0) * 100) / 100,
      }))
      return {
        locationId: loc.id,
        locationName: loc.name ?? 'Unnamed Location',
        merchantId: loc.merchant_id,
        merchantName: merchantNameMap.get(loc.merchant_id) ?? 'Unknown',
        totalGPV: Math.round(s.gpv * 100) / 100,
        orderCount: s.orderCount,
        avgOrderValue: s.orderCount > 0 ? Math.round((s.gpv / s.orderCount) * 100) / 100 : 0,
        voidCount: s.voidCount,
        voidRate: attempted > 0 ? Math.round((s.voidCount / attempted) * 10000) / 100 : 0,
        gpvRank: 0,
        trendVsPrev,
        staffCount: staffCountMap.get(loc.id) ?? 0,
        deviceCount: deviceCountMap.get(loc.id) ?? 0,
        sparkline,
      }
    })
    .sort((a, b) => b.totalGPV - a.totalGPV)
    .map((l, i) => ({ ...l, gpvRank: i + 1 }))

  if (metrics.length === 0) return empty

  const totalGPVSum = metrics.reduce((s, l) => s + l.totalGPV, 0)
  const avgGPVPerLocation = Math.round((totalGPVSum / metrics.length) * 100) / 100

  const sorted = [...metrics].sort((a, b) => a.totalGPV - b.totalGPV)
  const mid = Math.floor(sorted.length / 2)
  const medianGPVPerLocation = sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1].totalGPV + sorted[mid].totalGPV) / 2) * 100) / 100
    : sorted[mid].totalGPV

  return {
    locations: metrics.slice(0, 100),
    totalLocations: metrics.length,
    avgGPVPerLocation,
    medianGPVPerLocation,
    topLocation: metrics[0] ?? null,
    bottomLocation: metrics[metrics.length - 1] ?? null,
    periodDays: days,
  }
}

// ============================================================================
// T-011: Payment Terminal Health Monitor
// ============================================================================

export type TerminalConnectionStatus = 'connected' | 'disconnected' | 'unknown'
export type TerminalSettlementStatus = 'settled' | 'overdue' | 'no_data'
export type TerminalAuthStatus = 'valid' | 'missing'

export interface PaymentTerminalRow {
  id: string
  terminalName: string
  terminalType: string
  terminalModel: string | null
  tpn: string
  merchantId: string
  merchantName: string
  locationId: string
  locationName: string | null
  stationId: string | null
  stationName: string | null
  // Connection status from station_devices
  isConnected: boolean
  connectionStatus: TerminalConnectionStatus
  lastSeenAt: string | null
  lastError: string | null
  // Auth key status
  authStatus: TerminalAuthStatus
  // Settlement
  lastTransactionAt: string | null
  settlementStatus: TerminalSettlementStatus
  hoursSinceLastTransaction: number | null
  // Orphan = no station mapping
  isOrphan: boolean
  apiEnvironment: string
  connectionType: string
}

export interface PaymentTerminalHealthSummary {
  total: number
  connected: number
  disconnected: number
  unknown: number
  settlementOverdue: number
  orphans: number
  authKeysMissing: number
}

export interface PaymentTerminalHealthData {
  terminals: PaymentTerminalRow[]
  summary: PaymentTerminalHealthSummary
}

export async function getPaymentTerminalHealth(): Promise<PaymentTerminalHealthData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()

  const empty: PaymentTerminalHealthData = {
    terminals: [],
    summary: { total: 0, connected: 0, disconnected: 0, unknown: 0, settlementOverdue: 0, orphans: 0, authKeysMissing: 0 },
  }

  // Fetch all active payment terminals
  const { data: terminals, error: terminalError } = await supabase
    .from('payment_terminals')
    .select('id, terminal_name, terminal_type, terminal_model, tpn, auth_key, merchant_id, location_id, station_id, is_connected, last_connection_test_at, last_connection_status, last_transaction_at, api_environment, connection_type')
    .eq('is_active', true)

  if (terminalError || !terminals || terminals.length === 0) return empty

  // Fetch linked station_devices for connection status (device_type = 'payment_terminal')
  const terminalIds = terminals.map(t => t.id)
  const { data: stationDevices } = await supabase
    .from('station_devices')
    .select('payment_terminal_id, is_connected, last_seen_at, last_error')
    .in('payment_terminal_id', terminalIds)
    .eq('device_type', 'payment_terminal')

  const stationDeviceMap = new Map(
    (stationDevices || []).map(sd => [sd.payment_terminal_id, sd])
  )

  // Fetch station names for mapped terminals
  const stationIds = terminals.map(t => t.station_id).filter(Boolean) as string[]
  const { data: stations } = stationIds.length > 0
    ? await supabase.from('stations').select('id, station_name').in('id', stationIds)
    : { data: [] }
  const stationNameMap = new Map((stations || []).map(s => [s.id, s.station_name]))

  // Fetch merchant and location names
  const merchantIds = [...new Set(terminals.map(t => t.merchant_id))]
  const locationIds = [...new Set(terminals.map(t => t.location_id))]

  const [{ data: merchantRows }, { data: locationRows }] = await Promise.all([
    supabase.from('merchants').select('id, name').in('id', merchantIds),
    supabase.from('locations').select('id, name').in('id', locationIds),
  ])

  const merchantNameMap = new Map((merchantRows || []).map(m => [m.id, m.name || 'Unknown']))
  const locationNameMap = new Map((locationRows || []).map(l => [l.id, l.name || 'Unknown']))

  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const rows: PaymentTerminalRow[] = terminals.map(t => {
    const sd = stationDeviceMap.get(t.id)

    // Determine connection status — prefer station_devices, fallback to terminal's own is_connected
    let connectionStatus: TerminalConnectionStatus = 'unknown'
    let isConnected = false
    let lastSeenAt: string | null = null
    let lastError: string | null = null

    if (sd) {
      isConnected = sd.is_connected ?? false
      connectionStatus = sd.is_connected ? 'connected' : 'disconnected'
      lastSeenAt = sd.last_seen_at
      lastError = sd.last_error
    } else if (t.last_connection_status) {
      isConnected = t.is_connected ?? false
      connectionStatus = t.is_connected ? 'connected' : 'disconnected'
      lastSeenAt = t.last_connection_test_at
    }

    // Settlement status
    let settlementStatus: TerminalSettlementStatus = 'no_data'
    let hoursSinceLastTransaction: number | null = null
    if (t.last_transaction_at) {
      const lastTxTime = new Date(t.last_transaction_at)
      hoursSinceLastTransaction = Math.floor((now.getTime() - lastTxTime.getTime()) / (1000 * 60 * 60))
      settlementStatus = lastTxTime < twentyFourHoursAgo ? 'overdue' : 'settled'
    }

    // Auth status
    const authStatus: TerminalAuthStatus = t.auth_key ? 'valid' : 'missing'

    return {
      id: t.id,
      terminalName: t.terminal_name,
      terminalType: t.terminal_type,
      terminalModel: t.terminal_model,
      tpn: t.tpn,
      merchantId: t.merchant_id,
      merchantName: merchantNameMap.get(t.merchant_id) || 'Unknown',
      locationId: t.location_id,
      locationName: locationNameMap.get(t.location_id) || null,
      stationId: t.station_id,
      stationName: t.station_id ? (stationNameMap.get(t.station_id) || null) : null,
      isConnected,
      connectionStatus,
      lastSeenAt,
      lastError,
      authStatus,
      lastTransactionAt: t.last_transaction_at,
      settlementStatus,
      hoursSinceLastTransaction,
      isOrphan: !t.station_id,
      apiEnvironment: t.api_environment || 'sandbox',
      connectionType: t.connection_type || 'cloud',
    }
  }).sort((a, b) => {
    // Sort: disconnected + overdue first, then by merchant name
    const aPriority = (a.connectionStatus === 'disconnected' ? 0 : a.connectionStatus === 'unknown' ? 1 : 2)
    const bPriority = (b.connectionStatus === 'disconnected' ? 0 : b.connectionStatus === 'unknown' ? 1 : 2)
    if (aPriority !== bPriority) return aPriority - bPriority
    return a.merchantName.localeCompare(b.merchantName)
  })

  const summary: PaymentTerminalHealthSummary = {
    total: rows.length,
    connected: rows.filter(r => r.connectionStatus === 'connected').length,
    disconnected: rows.filter(r => r.connectionStatus === 'disconnected').length,
    unknown: rows.filter(r => r.connectionStatus === 'unknown').length,
    settlementOverdue: rows.filter(r => r.settlementStatus === 'overdue').length,
    orphans: rows.filter(r => r.isOrphan).length,
    authKeysMissing: rows.filter(r => r.authStatus === 'missing').length,
  }

  return { terminals: rows, summary }
}

// ============================================================================
// T-014: KDS Performance & Kitchen Throughput
// ============================================================================

export interface KDSDisplayStats {
  displayId: string
  displayName: string
  merchantId: string
  merchantName: string
  locationId: string
  locationName: string | null
  totalItemsBumped: number
  avgPrepTimeSeconds: number | null
  medianPrepTimeSeconds: number | null
  p95PrepTimeSeconds: number | null
  itemsPerHour: number
  slowTicketCount: number  // items > 2x avg prep time
}

export interface KDSItemTimingBucket {
  bucketLabel: string  // e.g. "0-1m", "1-2m", "2-5m", "5-10m", "10m+"
  count: number
  percentage: number
}

export interface KDSSlowestMerchant {
  merchantId: string
  merchantName: string
  avgPrepTimeSeconds: number
  totalItemsBumped: number
  displayCount: number
}

export interface KDSSlowestItem {
  itemName: string
  avgPrepTimeSeconds: number
  count: number
  p95PrepTimeSeconds: number
}

export interface KDSThroughputData {
  displays: KDSDisplayStats[]
  timingDistribution: KDSItemTimingBucket[]
  slowestMerchants: KDSSlowestMerchant[]
  slowestItems: KDSSlowestItem[]
  platformAvgPrepSeconds: number | null
  platformItemsPerHour: number
  totalItemsBumped: number
  totalDisplays: number
  periodDays: number
}

export async function getKDSThroughputAnalytics(days: number = 7): Promise<KDSThroughputData> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()
  const periodStart = new Date()
  periodStart.setDate(periodStart.getDate() - days)

  const empty: KDSThroughputData = {
    displays: [],
    timingDistribution: [],
    slowestMerchants: [],
    slowestItems: [],
    platformAvgPrepSeconds: null,
    platformItemsPerHour: 0,
    totalItemsBumped: 0,
    totalDisplays: 0,
    periodDays: days,
  }

  // Fetch all bumped kds_item_status rows within the period
  const kdsItems = await fetchAllRows<{
    id: string
    kds_display_id: string
    order_item_id: string
    created_at: string | null
    bumped_at: string | null
    status: string
  }>(supabase, 'kds_item_status',
    'id, kds_display_id, order_item_id, created_at, bumped_at, status',
    (q) => q
      .eq('status', 'completed')
      .not('bumped_at', 'is', null)
      .gte('bumped_at', periodStart.toISOString())
  )

  if (kdsItems.length === 0) return empty

  // Fetch all KDS displays (including those with no bumped items for totals)
  const displayIds = [...new Set(kdsItems.map(k => k.kds_display_id))]
  const { data: displays } = await supabase
    .from('kds_displays')
    .select('id, display_name, merchant_id, location_id')
    .in('id', displayIds)
    .eq('is_active', true)

  if (!displays || displays.length === 0) return empty

  // Fetch merchant and location names
  const merchantIds = [...new Set(displays.map(d => d.merchant_id))]
  const locationIds = [...new Set(displays.map(d => d.location_id))]

  const [{ data: merchantRows }, { data: locationRows }] = await Promise.all([
    supabase.from('merchants').select('id, name').in('id', merchantIds),
    supabase.from('locations').select('id, name').in('id', locationIds),
  ])

  const merchantNameMap = new Map((merchantRows || []).map(m => [m.id, m.name || 'Unknown']))
  const locationNameMap = new Map((locationRows || []).map(l => [l.id, l.name || 'Unknown']))

  // Aggregate per display
  const periodHours = days * 24

  const displayMap = new Map<string, {
    prepTimes: number[]
    bumpedCount: number
  }>()

  kdsItems.forEach(item => {
    if (!item.bumped_at || !item.created_at) return
    const prepSecs = (new Date(item.bumped_at).getTime() - new Date(item.created_at).getTime()) / 1000
    if (prepSecs < 0 || prepSecs > 7200) return // ignore negatives and > 2h (data anomaly)

    if (!displayMap.has(item.kds_display_id)) {
      displayMap.set(item.kds_display_id, { prepTimes: [], bumpedCount: 0 })
    }
    const entry = displayMap.get(item.kds_display_id)!
    entry.prepTimes.push(prepSecs)
    entry.bumpedCount += 1
  })

  // Build display stats
  const displayStats: KDSDisplayStats[] = displays
    .filter(d => displayMap.has(d.id))
    .map(d => {
      const agg = displayMap.get(d.id)!
      const sorted = [...agg.prepTimes].sort((a, b) => a - b)
      const avg = sorted.length > 0 ? sorted.reduce((s, v) => s + v, 0) / sorted.length : null
      const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null
      const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : null
      const avgThreshold = avg ? avg * 2 : null
      const slowTicketCount = avgThreshold ? sorted.filter(v => v > avgThreshold).length : 0

      return {
        displayId: d.id,
        displayName: d.display_name,
        merchantId: d.merchant_id,
        merchantName: merchantNameMap.get(d.merchant_id) || 'Unknown',
        locationId: d.location_id,
        locationName: locationNameMap.get(d.location_id) || null,
        totalItemsBumped: agg.bumpedCount,
        avgPrepTimeSeconds: avg ? Math.round(avg) : null,
        medianPrepTimeSeconds: median ? Math.round(median) : null,
        p95PrepTimeSeconds: p95 ? Math.round(p95) : null,
        itemsPerHour: periodHours > 0 ? Math.round((agg.bumpedCount / periodHours) * 10) / 10 : 0,
        slowTicketCount,
      }
    })
    .sort((a, b) => (b.avgPrepTimeSeconds ?? 0) - (a.avgPrepTimeSeconds ?? 0))

  // Platform-wide timing distribution (all items combined)
  const allPrepTimes: number[] = []
  displayMap.forEach(agg => allPrepTimes.push(...agg.prepTimes))

  const buckets = [
    { label: '0-1m', min: 0, max: 60 },
    { label: '1-2m', min: 60, max: 120 },
    { label: '2-5m', min: 120, max: 300 },
    { label: '5-10m', min: 300, max: 600 },
    { label: '10m+', min: 600, max: Infinity },
  ]

  const timingDistribution: KDSItemTimingBucket[] = buckets.map(b => {
    const count = allPrepTimes.filter(t => t >= b.min && t < b.max).length
    return {
      bucketLabel: b.label,
      count,
      percentage: allPrepTimes.length > 0 ? Math.round((count / allPrepTimes.length) * 1000) / 10 : 0,
    }
  })

  // Slowest merchants by avg prep time
  const merchantPrepMap = new Map<string, { times: number[]; displayCount: number; bumpedCount: number }>()
  displayStats.forEach(ds => {
    if (!merchantPrepMap.has(ds.merchantId)) {
      merchantPrepMap.set(ds.merchantId, { times: [], displayCount: 0, bumpedCount: 0 })
    }
    const m = merchantPrepMap.get(ds.merchantId)!
    const agg = displayMap.get(ds.displayId)
    if (agg) m.times.push(...agg.prepTimes)
    m.displayCount += 1
    m.bumpedCount += ds.totalItemsBumped
  })

  const slowestMerchants: KDSSlowestMerchant[] = Array.from(merchantPrepMap.entries())
    .map(([mid, v]) => {
      const avg = v.times.length > 0 ? v.times.reduce((s, t) => s + t, 0) / v.times.length : 0
      return {
        merchantId: mid,
        merchantName: merchantNameMap.get(mid) || 'Unknown',
        avgPrepTimeSeconds: Math.round(avg),
        totalItemsBumped: v.bumpedCount,
        displayCount: v.displayCount,
      }
    })
    .filter(m => m.totalItemsBumped > 0)
    .sort((a, b) => b.avgPrepTimeSeconds - a.avgPrepTimeSeconds)
    .slice(0, 15)

  const platformAvg = allPrepTimes.length > 0
    ? Math.round(allPrepTimes.reduce((s, t) => s + t, 0) / allPrepTimes.length)
    : null

  const totalBumped = allPrepTimes.length
  const platformItemsPerHour = periodHours > 0 ? Math.round((totalBumped / periodHours) * 10) / 10 : 0

  // ── Per-item slowest items (T-014 item-level insight) ─────────────────────
  // Build order_item_id → prep time map from kdsItems
  const itemPrepMap = new Map<string, number[]>()
  kdsItems.forEach(item => {
    if (!item.bumped_at || !item.created_at || !item.order_item_id) return
    const prepSecs = (new Date(item.bumped_at).getTime() - new Date(item.created_at).getTime()) / 1000
    if (prepSecs < 0 || prepSecs > 7200) return
    if (!itemPrepMap.has(item.order_item_id)) itemPrepMap.set(item.order_item_id, [])
    itemPrepMap.get(item.order_item_id)!.push(prepSecs)
  })

  const orderItemIds = [...itemPrepMap.keys()]
  let slowestItems: KDSSlowestItem[] = []

  if (orderItemIds.length > 0) {
    const { data: orderItemRows } = await supabase
      .from('order_items')
      .select('id, item_name')
      .in('id', orderItemIds)

    if (orderItemRows && orderItemRows.length > 0) {
      // Aggregate by item_name (same dish across different orders/merchants)
      const byName = new Map<string, number[]>()
      orderItemRows.forEach(row => {
        const times = itemPrepMap.get(row.id)
        if (!times || times.length === 0) return
        const name = row.item_name || 'Unknown Item'
        if (!byName.has(name)) byName.set(name, [])
        byName.get(name)!.push(...times)
      })

      slowestItems = Array.from(byName.entries())
        .map(([itemName, times]) => {
          const sorted = [...times].sort((a, b) => a - b)
          const avg = sorted.reduce((s, t) => s + t, 0) / sorted.length
          const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1]
          return {
            itemName,
            avgPrepTimeSeconds: Math.round(avg),
            count: sorted.length,
            p95PrepTimeSeconds: Math.round(p95),
          }
        })
        .filter(item => item.count >= 3) // require at least 3 data points for reliability
        .sort((a, b) => b.avgPrepTimeSeconds - a.avgPrepTimeSeconds)
        .slice(0, 20)
    }
  }

  return {
    displays: displayStats,
    timingDistribution,
    slowestMerchants,
    slowestItems,
    platformAvgPrepSeconds: platformAvg,
    platformItemsPerHour,
    totalItemsBumped: totalBumped,
    totalDisplays: displayStats.length,
    periodDays: days,
  }
}

// ============================================================================
// TICKET-015: Audit Log Analytics Types
// ============================================================================

/** One day's worth of audit activity broken down by severity AND action category */
export interface DailyAuditActivity {
  date: string     // YYYY-MM-DD
  total: number
  // severity
  info: number
  warning: number
  error: number
  critical: number
  // category
  auth: number
  merchant: number
  staff: number
  order: number
  settings: number
  device: number
  other: number
}

export interface TopAuditActor {
  actorName: string
  actorEmail: string | null
  actorRole: string | null
  totalActions: number
  warningCount: number
  errorCount: number
  lastActionAt: string
  distinctMerchants: number
}

export interface FailedAuditAction {
  id: string
  createdAt: string
  action: string | null
  actionCategory: string | null
  actorName: string | null
  actorEmail: string | null
  errorMessage: string | null
  status: string | null
  resourceType: string | null
  resourceName: string | null
  merchantName: string | null
  severity: string | null
}

export interface AuditLogAnalytics {
  // Platform-wide summary stats
  total30d: number
  infoCount: number
  warningCount: number
  errorCount: number
  criticalCount: number
  failedActionsCount: number
  // Chart data — 30 daily buckets
  dailyActivity: DailyAuditActivity[]
  // Aggregated tables
  topActors: TopAuditActor[]
  failedActions: FailedAuditAction[]
  periodDays: number
}

// ============================================================================
// TICKET-015: Audit Log Analytics Server Action
// ============================================================================

/**
 * Returns aggregated audit log analytics:
 *   - daily activity chart data (stacked by action_category, coloured by severity)
 *   - top actors ranked by total actions
 *   - failed / errored actions feed
 *   - platform-wide severity summary counts
 *
 * Designed to power the AuditLogActivityMonitor analytics section.
 */
export async function getAuditLogAnalytics(days: number = 30): Promise<AuditLogAnalytics> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()

  const since = new Date()
  since.setDate(since.getDate() - days)

  // ── Two parallel fetches ─────────────────────────────────────────────────
  // 1. Lightweight metadata rows for chart + actor aggregation (no heavy columns)
  // 2. Failed / errored action rows with their error messages
  const [activityRes, failedRes] = await Promise.all([
    supabase
      .from('audit_logs')
      .select('created_at, severity, action_category, actor_name, actor_email, actor_role, merchant_id')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true }),

    supabase
      .from('audit_logs')
      .select('id, created_at, action, action_category, actor_name, actor_email, error_message, status, resource_type, resource_name, merchant_id, severity, merchants(name)')
      .or('status.eq.failed,error_message.not.is.null')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const rows = activityRes.data ?? []
  const failedRows = failedRes.data ?? []

  // ── Initialise daily buckets (one per day for the full window) ───────────
  const dailyMap = new Map<string, DailyAuditActivity>()
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = d.toISOString().slice(0, 10)
    dailyMap.set(key, {
      date: key, total: 0,
      info: 0, warning: 0, error: 0, critical: 0,
      auth: 0, merchant: 0, staff: 0, order: 0, settings: 0, device: 0, other: 0,
    })
  }

  // ── Side map for distinct merchants touched per actor ───────────────────
  const actorMerchantsMap = new Map<string, Set<string>>()
  const actorMap = new Map<string, {
    actorName: string
    actorEmail: string | null
    actorRole: string | null
    totalActions: number
    warningCount: number
    errorCount: number
    lastActionAt: string
  }>()

  let infoCount = 0, warningCount = 0, errorCount = 0, criticalCount = 0

  // ── Single-pass aggregation ───────────────────────────────────────────────
  for (const row of rows) {
    const dateKey = (row.created_at as string).slice(0, 10)
    const sev  = ((row.severity        as string) ?? 'info').toLowerCase()
    const cat  = ((row.action_category as string) ?? '').toLowerCase()
    const bucket = dailyMap.get(dateKey)

    // ─ Daily buckets ─
    if (bucket) {
      bucket.total++
      if      (sev === 'info')     bucket.info++
      else if (sev === 'warning')  bucket.warning++
      else if (sev === 'error')    bucket.error++
      else if (sev === 'critical') bucket.critical++

      if      (cat === 'auth')     bucket.auth++
      else if (cat === 'merchant') bucket.merchant++
      else if (cat === 'staff')    bucket.staff++
      else if (cat === 'order')    bucket.order++
      else if (cat === 'settings') bucket.settings++
      else if (cat === 'device')   bucket.device++
      else                         bucket.other++
    }

    // ─ Platform severity counters ─
    if      (sev === 'info')     infoCount++
    else if (sev === 'warning')  warningCount++
    else if (sev === 'error')    errorCount++
    else if (sev === 'critical') criticalCount++

    // ─ Top-actors aggregation ─
    const actorKey = (row.actor_name as string) ?? (row.actor_email as string) ?? 'System'
    if (!actorMap.has(actorKey)) {
      actorMap.set(actorKey, {
        actorName: actorKey,
        actorEmail: (row.actor_email as string) ?? null,
        actorRole:  (row.actor_role  as string) ?? null,
        totalActions: 0,
        warningCount: 0,
        errorCount: 0,
        lastActionAt: row.created_at as string,
      })
      actorMerchantsMap.set(actorKey, new Set())
    }
    const actor = actorMap.get(actorKey)!
    actor.totalActions++
    if (sev === 'warning')                  actor.warningCount++
    if (sev === 'error' || sev === 'critical') actor.errorCount++
    if ((row.created_at as string) > actor.lastActionAt) actor.lastActionAt = row.created_at as string
    if (row.merchant_id) actorMerchantsMap.get(actorKey)!.add(row.merchant_id as string)
  }

  const topActors: TopAuditActor[] = Array.from(actorMap.values())
    .map(a => ({
      ...a,
      distinctMerchants: actorMerchantsMap.get(a.actorName)?.size ?? 0,
    }))
    .sort((a, b) => b.totalActions - a.totalActions)
    .slice(0, 20)

  // ── Failed actions ───────────────────────────────────────────────────────
  const failedActions: FailedAuditAction[] = failedRows.map((r: any) => ({
    id:             r.id            as string,
    createdAt:      r.created_at    as string,
    action:         r.action        as string | null,
    actionCategory: r.action_category as string | null,
    actorName:      r.actor_name    as string | null,
    actorEmail:     r.actor_email   as string | null,
    errorMessage:   r.error_message as string | null,
    status:         r.status        as string | null,
    resourceType:   r.resource_type as string | null,
    resourceName:   r.resource_name as string | null,
    merchantName:   (r.merchants as { name: string } | null)?.name ?? null,
    severity:       r.severity      as string | null,
  }))

  return {
    total30d:          rows.length,
    infoCount,
    warningCount,
    errorCount,
    criticalCount,
    failedActionsCount: failedActions.length,
    dailyActivity:     Array.from(dailyMap.values()),
    topActors,
    failedActions,
    periodDays:        days,
  }
}

// ============================================================================
// TICKET-017: Location Density & Geographic Insights Types
// ============================================================================

export interface LocationDensityState {
  state: string        // 2-letter code e.g. "TX"
  stateName: string    // full name e.g. "Texas"
  locationCount: number
  merchantCount: number
  gpv30d: number
  topCities: string[]  // top 3 cities in this state by location count
}

export interface LocationDensityCity {
  city: string
  state: string
  locationCount: number
  merchantCount: number
  gpv30d: number
}

export interface LocationDensityData {
  byState: LocationDensityState[]   // all represented states, sorted by locationCount desc
  byCity: LocationDensityCity[]     // top 20 cities, sorted by locationCount desc
  totalLocations: number
  totalStates: number               // states with ≥1 location
  coverageGaps: string[]            // state codes with 0 active locations
  topState: string                  // state code of #1 state (empty string if none)
  topCity: string                   // "City, ST" of #1 city (empty string if none)
}

// ============================================================================
// TICKET-017: getLocationDensity
// ============================================================================

/**
 * Geographic distribution of all active locations across the platform.
 * Used by the Growth tab for sales whitespace analysis (TICKET-017).
 */
export async function getLocationDensity(): Promise<LocationDensityData> {
  await assertHQPermission('hq.org.view')
  const supabase = createServerSupabaseClient()

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 30)

  // Fetch all active locations and recent orders in parallel
  const [locationsRes, ordersRes] = await Promise.all([
    supabase
      .from('locations')
      .select('id, city, state, merchant_id')
      .eq('is_active', true),
    supabase
      .from('orders')
      .select('location_id, total_amount')
      .in('status', ['completed', 'paid'])
      .gte('created_at', thirtyDaysAgo.toISOString()),
  ])

  const locations = locationsRes.data || []
  const orders = ordersRes.data || []

  if (locations.length === 0) {
    return {
      byState: [],
      byCity: [],
      totalLocations: 0,
      totalStates: 0,
      coverageGaps: ALL_US_STATE_CODES,
      topState: '',
      topCity: '',
    }
  }

  // Build location → GPV map
  const locationGPVMap = new Map<string, number>()
  orders.forEach(o => {
    const prev = locationGPVMap.get(o.location_id) || 0
    locationGPVMap.set(o.location_id, prev + Number(o.total_amount))
  })

  // Aggregate by state
  const stateMap = new Map<string, { locationCount: number; merchants: Set<string>; gpv: number; cities: Map<string, number> }>()
  locations.forEach(loc => {
    const s = (loc.state || '').toUpperCase().trim()
    const city = (loc.city || '').trim()
    if (!s) return
    if (!stateMap.has(s)) {
      stateMap.set(s, { locationCount: 0, merchants: new Set(), gpv: 0, cities: new Map() })
    }
    const entry = stateMap.get(s)!
    entry.locationCount += 1
    entry.merchants.add(loc.merchant_id)
    entry.gpv += locationGPVMap.get(loc.id) || 0
    if (city) {
      entry.cities.set(city, (entry.cities.get(city) || 0) + 1)
    }
  })

  // Aggregate by city
  const cityKey = (city: string, state: string) => `${city}||${state}`
  const cityMap = new Map<string, { city: string; state: string; locationCount: number; merchants: Set<string>; gpv: number }>()
  locations.forEach(loc => {
    const s = (loc.state || '').toUpperCase().trim()
    const city = (loc.city || '').trim()
    if (!s || !city) return
    const key = cityKey(city, s)
    if (!cityMap.has(key)) {
      cityMap.set(key, { city, state: s, locationCount: 0, merchants: new Set(), gpv: 0 })
    }
    const entry = cityMap.get(key)!
    entry.locationCount += 1
    entry.merchants.add(loc.merchant_id)
    entry.gpv += locationGPVMap.get(loc.id) || 0
  })

  // Build byState array
  const byState: LocationDensityState[] = Array.from(stateMap.entries())
    .map(([state, data]) => {
      const topCities = Array.from(data.cities.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c]) => c)
      return {
        state,
        stateName: STATE_NAME_MAP[state] || state,
        locationCount: data.locationCount,
        merchantCount: data.merchants.size,
        gpv30d: Math.round(data.gpv * 100) / 100,
        topCities,
      }
    })
    .sort((a, b) => b.locationCount - a.locationCount)

  // Build byCity array (top 20)
  const byCity: LocationDensityCity[] = Array.from(cityMap.values())
    .map(data => ({
      city: data.city,
      state: data.state,
      locationCount: data.locationCount,
      merchantCount: data.merchants.size,
      gpv30d: Math.round(data.gpv * 100) / 100,
    }))
    .sort((a, b) => b.locationCount - a.locationCount)
    .slice(0, 20)

  // Coverage gaps = US states with no locations
  const representedStates = new Set(byState.map(s => s.state))
  const coverageGaps = ALL_US_STATE_CODES.filter(code => !representedStates.has(code))

  return {
    byState,
    byCity,
    totalLocations: locations.length,
    totalStates: byState.length,
    coverageGaps,
    topState: byState[0]?.state || '',
    topCity: byCity[0] ? `${byCity[0].city}, ${byCity[0].state}` : '',
  }
}

// ---------------------------------------------------------------------------
// Internal lookup tables for T017
// ---------------------------------------------------------------------------

const ALL_US_STATE_CODES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

const STATE_NAME_MAP: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'D.C.',
}

export async function getPlatformAuditLogsExport(
  filters?: PlatformAuditLogFilters,
  cap: number = 5000
): Promise<PlatformAuditLogsExportResult> {
  const normalizedCap = Math.max(1, Math.min(cap, 10000))
  const result = await getPlatformAuditLogs(filters, normalizedCap, 0)

  return {
    data: result.data,
    total: result.total,
    cap: normalizedCap,
    capped: result.total > normalizedCap,
  }
}
