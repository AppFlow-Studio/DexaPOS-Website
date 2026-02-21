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
 * Get platform-wide KPIs for the main dashboard
 */
export async function getPlatformKPIs(): Promise<PlatformKPIs> {
  const { userId, role } = await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)

  if (merchantScope !== null && merchantScope.length === 0) {
    return {
      totalRevenue: 0,
      totalMerchants: 0,
      activeAccounts: 0,
      growthRate: 0,
      revenueChange: '0%',
      merchantChange: '0%',
      activeChange: '0%',
      growthChange: '0%',
    }
  }

  // 1) Revenue + activity (last 30 days), scoped by assigned merchants when not super-admin.
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
  if (ordersError) {
    console.error('[getPlatformKPIs:orders] Error:', ordersError)
  }

  const rows = ordersData ?? []
  const totalRevenue = rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
  const activeMerchantIds = new Set(
    rows
      .map((row) => row.merchant_id)
      .filter((merchantId): merchantId is string => typeof merchantId === 'string' && merchantId.length > 0)
  )
  const activeAccounts = activeMerchantIds.size

  // 2) Merchant count (scoped for non-super-admin)
  let totalMerchants = 0
  if (merchantScope === null) {
    const { count, error } = await supabase
      .from('merchants')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('[getPlatformKPIs:merchants] Error:', error)
    }
    totalMerchants = count || 0
  } else {
    totalMerchants = merchantScope.length
  }

  // Trend deltas remain mocked until snapshot metrics are added.
  return {
    totalRevenue,
    totalMerchants,
    activeAccounts,
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
  const { userId, role } = await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
  if (merchantScope !== null && merchantScope.length === 0) {
    return []
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Aggregate orders by day within merchant scope.
  let query = supabase
    .from('orders')
    .select('created_at, total_amount, merchant_id')
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('created_at', thirtyDaysAgo.toISOString())

  if (merchantScope !== null) {
    query = query.in('merchant_id', merchantScope)
  }

  const { data, error } = await query

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
