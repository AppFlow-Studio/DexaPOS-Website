'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface MerchantSpotlightRow {
  id: string
  name: string | null
  logo_url: string | null
  derived_status: 'active' | 'inactive' | 'onboarding' | string | null
  revenue_today: number | null
  orders_today: number | null
  active_staff_count: number | null
  active_locations: number | null
  total_locations: number | null
  last_order_at: string | null
}

export interface GetMerchantSpotlightResult {
  data: MerchantSpotlightRow[]
  total: number
  error?: string
}

const DEFAULT_LIMIT = 10

/**
 * Returns the top-N merchants for the admin dashboard's merchant spotlight section.
 *
 * Ranking:
 *   1. Active merchants first (derived_status = 'active'), then onboarding, then inactive
 *   2. Within each bucket, highest revenue_today first
 *   3. Tie-breaker: most recent last_order_at
 *
 * Powered by the admin_merchant_summary view. Caller is expected to be HQ admin —
 * RLS / auth gating is enforced at the layout/route level.
 */
export async function GetMerchantSpotlight(
  limit: number = DEFAULT_LIMIT,
): Promise<GetMerchantSpotlightResult> {
  const supabase = createServerSupabaseClient()

  const totalQuery = supabase
    .from('admin_merchant_summary')
    .select('id', { count: 'exact', head: true })

  const rowsQuery = supabase
    .from('admin_merchant_summary')
    .select(
      'id, name, logo_url, derived_status, revenue_today, orders_today, active_staff_count, active_locations, total_locations, last_order_at',
    )
    .order('revenue_today', { ascending: false, nullsFirst: false })
    .order('last_order_at', { ascending: false, nullsFirst: false })
    .limit(Math.max(1, Math.min(limit, 50)))

  const [{ count, error: countError }, { data, error }] = await Promise.all([
    totalQuery,
    rowsQuery,
  ])

  if (error || countError) {
    return {
      data: [],
      total: 0,
      error: error?.message || countError?.message || 'Failed to load merchant spotlight',
    }
  }

  const statusRank = (s: string | null | undefined) => {
    if (s === 'active') return 0
    if (s === 'onboarding') return 1
    return 2
  }

  const ranked = (data ?? [])
    .slice()
    .sort((a, b) => {
      const sa = statusRank(a.derived_status)
      const sb = statusRank(b.derived_status)
      if (sa !== sb) return sa - sb
      return 0 // server already ordered by revenue_today, last_order_at
    }) as MerchantSpotlightRow[]

  return { data: ranked, total: count ?? ranked.length }
}
