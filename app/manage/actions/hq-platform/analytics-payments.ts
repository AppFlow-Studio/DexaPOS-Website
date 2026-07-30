'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import type { PaymentSummaryStatsV2Row } from '@/lib/reporting/order-channel'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface PaymentMetrics {
  transactionVolumeByDay: {
    date: string
    txn_count: number
    total_amount: number
  }[]
  failureRateByDay: {
    date: string
    total_txns: number
    failed_txns: number
    failure_rate_pct: number
  }[]
  chargebacksByMonth: {
    month: string
    chargeback_count: number
    total_amount: number
  }[]
  terminalDistribution: {
    terminal_type: string
    terminal_count: number
  }[]
  dualPricingAdoption: {
    adopted_merchants: number
    total_merchants: number
    adoption_pct: number
  }
  summaryStats: {
    total_transactions: number
    total_failed: number
    overall_failure_rate: number
    total_chargebacks: number
    total_chargeback_amount: number
  }
}

export async function getPlatformPaymentMetrics(
  from: string,
  to: string
): Promise<PaymentMetrics> {
  await assertHQPermission('hq.merchant.view')
  const supabase = createServerSupabaseClient()

  const [
    transactionVolume,
    failureRate,
    chargebacks,
    terminals,
    dualPricing,
    summary,
  ] = await Promise.all([
    supabase.rpc('get_transaction_volume_by_day', { p_from: from, p_to: to }),
    supabase.rpc('get_payment_failure_rate_by_day', { p_from: from, p_to: to }),
    supabase.rpc('get_chargeback_volume_by_month', { p_from: from, p_to: to }),
    supabase.rpc('get_terminal_type_distribution', { p_from: from, p_to: to }),
    supabase.rpc('get_dual_pricing_adoption', { p_from: from, p_to: to }),
    (supabase as any).rpc('get_payment_summary_stats_v2', {
      p_from: from,
      p_to: to,
      p_order_source: null,
    }),
  ])

  const dualPricingData = (dualPricing.data as any[])?.[0]
  const summaryData = (
    summary.data as PaymentSummaryStatsV2Row[] | null
  )?.[0]

  return {
    transactionVolumeByDay: (transactionVolume.data as any[]) ?? [],
    failureRateByDay: (failureRate.data as any[]) ?? [],
    chargebacksByMonth: (chargebacks.data as any[]) ?? [],
    terminalDistribution: (terminals.data as any[]) ?? [],
    dualPricingAdoption: dualPricingData ?? {
      adopted_merchants: 0,
      total_merchants: 0,
      adoption_pct: 0,
    },
    summaryStats: summaryData
      ? {
          total_transactions: Number(summaryData.total_transactions ?? 0),
          total_failed: Number(summaryData.total_failed ?? 0),
          overall_failure_rate: Number(
            summaryData.overall_failure_rate ?? 0
          ),
          total_chargebacks: Number(summaryData.total_chargebacks ?? 0),
          total_chargeback_amount: Number(
            summaryData.total_chargeback_amount ?? 0
          ),
        }
      : {
          total_transactions: 0,
          total_failed: 0,
          overall_failure_rate: 0,
          total_chargebacks: 0,
          total_chargeback_amount: 0,
        },
  }
}
