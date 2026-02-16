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
