'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

export interface PlatformKPIs {
  totalRevenue: number
  totalMerchants: number
  activeAccounts: number
  growthRate: number
  revenueChange: string
  merchantChange: string
  activeChange: string
  growthChange: string
}

export interface PlatformSalesTrend {
  date: string
  revenue: number
  merchants: number
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
  unhealthy: number
  total: number
  instabilityRate: number // percentage
}

export interface HardwareModelBreakdown {
  model: string
  healthy: number
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

// ============================================================================
// PLATFORM ACTIONS
// ============================================================================

/**
 * Get platform-wide KPIs for the main dashboard
 */
export async function getPlatformKPIs(): Promise<PlatformKPIs> {
  await assertHQPermission('hq.org.view') // Minimum permission for dashboard view

  const supabase = createServerSupabaseClient()

  // 1. Get total revenue (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: revenueData } = await supabase
    .from('orders')
    .select('total_amount')
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('created_at', thirtyDaysAgo.toISOString())

  const totalRevenue = revenueData?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0

  // 2. Get total merchants
  const { count: totalMerchants } = await supabase
    .from('merchants')
    .select('*', { count: 'exact', head: true })

  // 3. Get active accounts (accounts with at least one transaction in 30 days)
  const { data: activeOrgCount } = await supabase.rpc('get_active_organization_count', {
    p_days: 30
  })

  // 4. Mocking trends for now as these require snapshot tables or complex window queries
  // In a real prod env, we'd have a 'platform_daily_metrics' table updated by a cron
  return {
    totalRevenue,
    totalMerchants: totalMerchants || 0,
    activeAccounts: activeOrgCount || 0,
    growthRate: 4.2, // Mocked growth metric
    revenueChange: '+12.5%',
    merchantChange: '+3.2%',
    activeChange: '+8.1%',
    growthChange: '+2.4%'
  }
}

/**
 * Get platform-wide sales trend for the main chart
 */
export async function getPlatformSalesTrend(): Promise<PlatformSalesTrend[]> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Aggregating orders by date across all merchants
  const { data, error } = await supabase
    .from('orders')
    .select('created_at, total_amount, merchant_id')
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('created_at', thirtyDaysAgo.toISOString())

  if (error || !data) return []

  const trendMap = new Map<string, { revenue: number, merchants: Set<string> }>()
  
  data.forEach(order => {
    const date = new Date(order.created_at).toISOString().split('T')[0]
    const amount = Number(order.total_amount)
    
    if (!trendMap.has(date)) {
      trendMap.set(date, { revenue: 0, merchants: new Set() })
    }
    
    const entry = trendMap.get(date)!
    entry.revenue += amount
    entry.merchants.add(order.merchant_id)
  })

  return Array.from(trendMap.entries())
    .map(([date, stats]) => ({
      date,
      revenue: stats.revenue,
      merchants: stats.merchants.size
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Get top merchants by revenue
 */
export async function getTopMerchants(limit: number = 5): Promise<PlatformTopMerchant[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  
  // This usually requires a complex join or a materialized view for performance
  // For now, we'll fetch summarized data
  const { data, error } = await supabase.rpc('get_top_performing_merchants', {
    p_limit: limit,
    p_days: 30
  })

  if (error || !data) {
    console.error('[getTopMerchants] Error:', error)
    return []
  }

  return data as PlatformTopMerchant[]
}

/**
 * Get platform-wide audit logs
 */
export async function getPlatformAuditLogs(
  filters?: any,
  limit: number = 50,
  offset: number = 0
): Promise<{ data: any[], total: number }> {
  await assertHQPermission('hq.org.view')

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('audit_logs')
    .select(`
      *,
      merchants!inner(name),
      location:locations(id, name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filters?.search) {
    query = query.or(`action.ilike.%${filters.search}%,actor_name.ilike.%${filters.search}%,resource_name.ilike.%${filters.search}%`)
  }

  if (filters?.action_category) {
    query = query.eq('action_category', filters.action_category)
  }

  if (filters?.severity) {
    query = query.eq('severity', filters.severity)
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getPlatformAuditLogs] Error:', error)
    return { data: [], total: 0 }
  }

  return {
    data: data || [],
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
    const { data: merchantNames } = await supabase
      .from('merchants')
      .select('id, business_name, account_manager')
      .in('id', whaleIds)

    const nameMap = new Map(merchantNames?.map(m => [m.id, m.business_name]) || [])
    const amMap = new Map(merchantNames?.map(m => [m.id, m.account_manager]) || [])

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
    .select('id, business_name, status')
    .in('id', atRiskMerchantIds)
    .eq('status', 'active')

  if (!merchants || merchants.length === 0) return emptyResult

  // Build final result
  const atRiskMerchants: ChurnWarningMerchant[] = merchants
    .map(merchant => {
      const dropData = merchantDropData.get(merchant.id)
      if (!dropData) return null

      // Classify severity
      let severity: ChurnSeverity = 'medium'
      if (dropData.dropPct >= 70) severity = 'critical'
      else if (dropData.dropPct >= 50) severity = 'high'

      return {
        id: merchant.id,
        name: merchant.business_name || 'Unknown Merchant',
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

  // 1. Fetch ALL heartbeats within period (paginated to avoid 1000-row truncation)
  const heartbeats = await fetchAllRows<{
    station_id: string; is_online: boolean; app_version: string | null
  }>(supabase, 'device_heartbeats', 'station_id, is_online, app_version', (q) =>
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

  // 4. Aggregate heartbeats by version
  const versionMap = new Map<string, { healthy: number; unhealthy: number; devices: Set<string> }>()

  heartbeats.forEach(hb => {
    const version = hb.app_version || 'Unknown'
    if (!versionMap.has(version)) {
      versionMap.set(version, { healthy: 0, unhealthy: 0, devices: new Set() })
    }
    const entry = versionMap.get(version)!
    entry.devices.add(hb.station_id)
    if (hb.is_online) {
      entry.healthy += 1
    } else {
      entry.unhealthy += 1
    }
  })

  // Add kicked sessions as unhealthy signals
  kickedSessions?.forEach(sess => {
    const version = sess.app_version || 'Unknown'
    if (!versionMap.has(version)) {
      versionMap.set(version, { healthy: 0, unhealthy: 0, devices: new Set() })
    }
    const entry = versionMap.get(version)!
    entry.devices.add(sess.station_id)
    entry.unhealthy += 1
  })

  // 5. Build version bars sorted by version descending
  const versionBars: VersionStabilityBar[] = Array.from(versionMap.entries())
    .map(([version, data]) => {
      const total = data.healthy + data.unhealthy
      return {
        version,
        healthy: data.healthy,
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

  // 1. Get heartbeats for this version (paginated)
  const heartbeats = await fetchAllRows<{
    station_id: string; is_online: boolean
  }>(supabase, 'device_heartbeats', 'station_id, is_online', (q) =>
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

  // 4. Aggregate by hardware model
  const modelMap = new Map<string, { healthy: number; unhealthy: number; devices: Set<string> }>()

  heartbeats.forEach(hb => {
    const model = stationModelMap.get(hb.station_id) || 'Unknown Model'
    if (!modelMap.has(model)) {
      modelMap.set(model, { healthy: 0, unhealthy: 0, devices: new Set() })
    }
    const entry = modelMap.get(model)!
    entry.devices.add(hb.station_id)
    if (hb.is_online) {
      entry.healthy += 1
    } else {
      entry.unhealthy += 1
    }
  })

  kickedSessions.forEach(sess => {
    const model = stationModelMap.get(sess.station_id) || 'Unknown Model'
    if (!modelMap.has(model)) {
      modelMap.set(model, { healthy: 0, unhealthy: 0, devices: new Set() })
    }
    const entry = modelMap.get(model)!
    entry.devices.add(sess.station_id)
    entry.unhealthy += 1
  })

  // 5. Build model breakdown
  const models: HardwareModelBreakdown[] = Array.from(modelMap.entries())
    .map(([model, data]) => {
      const total = data.healthy + data.unhealthy
      return {
        model,
        healthy: data.healthy,
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
    .select('id, business_name')
    .in('id', merchantIds)

  const merchantNameMap = new Map(merchantRows?.map(m => [m.id, m.business_name || 'Unknown Merchant']) || [])

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
    },
    periodDays: days,
  }
}
