'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface GrowthMetrics {
  merchantAcquisition: {
    period: string
    new_merchants: number
    new_locations: number
  }[]
  retention: {
    retained: number
    churned: number
    new_merchants: number
    retention_rate: number
  }
  churnRisk: {
    merchant_id: string
    merchant_name: string
    last_period_revenue: number
    current_revenue: number
    change_pct: number
  }[]
  avgTimeToFirstOrder: number
  onboardingFunnel: {
    stage: string
    merchant_count: number
  }[]
}

export async function getPlatformGrowthMetrics(
  from: string,
  to: string
): Promise<GrowthMetrics> {
  await assertHQPermission('hq.merchant.view')
  const supabase = createServerSupabaseClient()

  const [acquisition, retention, churnRisk, timeToFirstOrder, funnel] = await Promise.all([
    supabase.rpc('get_merchant_acquisition', { p_from: from, p_to: to }),
    supabase.rpc('get_merchant_retention', { p_from: from, p_to: to }),
    supabase.rpc('get_churn_risk_merchants', { p_from: from, p_to: to }),
    supabase.rpc('get_avg_time_to_first_order', { p_from: from, p_to: to }),
    supabase.rpc('get_onboarding_funnel', { p_from: from, p_to: to }),
  ])

  return {
    merchantAcquisition: (acquisition.data as any[]) ?? [],
    retention: (retention.data as any[])?.[0] ?? {
      retained: 0,
      churned: 0,
      new_merchants: 0,
      retention_rate: 0,
    },
    churnRisk: (churnRisk.data as any[]) ?? [],
    avgTimeToFirstOrder: (timeToFirstOrder.data as any[])?.[0]?.avg_days ?? 0,
    onboardingFunnel: (funnel.data as any[]) ?? [],
  }
}
