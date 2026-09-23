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
  /**
   * Null when no merchant in the cohort has placed a recognized order yet —
   * which is NOT the same as "they ordered instantly". Render it as unknown,
   * never as 0. See `timeToFirstOrderPending` for how much of the cohort is
   * still unresolved.
   */
  avgTimeToFirstOrder: number | null
  /** Cohort size, and how many of them have yet to place a recognized order. */
  timeToFirstOrderCohort: number
  timeToFirstOrderPending: number
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
    // `?? 0` here used to turn "nobody has ordered yet" into "0.0 days", i.e. a
    // claim of instant onboarding — the strongest possible reading of the
    // weakest possible data. The RPC returns NULL for that case on purpose, so
    // the null is carried through to the UI, which renders it as unknown.
    avgTimeToFirstOrder: (timeToFirstOrder.data as any[])?.[0]?.avg_days ?? null,
    timeToFirstOrderCohort: (timeToFirstOrder.data as any[])?.[0]?.merchant_count ?? 0,
    timeToFirstOrderPending: (timeToFirstOrder.data as any[])?.[0]?.pending_count ?? 0,
    onboardingFunnel: (funnel.data as any[]) ?? [],
  }
}
