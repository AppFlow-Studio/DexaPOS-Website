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
      merchants!inner(business_name),
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
