'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface RevenueMetrics {
  gmvByDay: {
    date: string
    revenue: number
    order_count: number
  }[]
  revenueByMerchant: {
    merchant_id: string
    merchant_name: string
    revenue: number
  }[]
  revenueByOrderType: {
    order_type: string
    revenue: number
    order_count: number
  }[]
  paymentMethodMix: {
    payment_method: string
    txn_count: number
    total_amount: number
  }[]
  cashVsCardSplit: {
    pricing_mode: string
    order_count: number
    revenue: number
  }[]
  avgTicketByDay: {
    date: string
    avg_ticket: number
  }[]
  tipRateByDay: {
    date: string
    tip_rate_pct: number
  }[]
  refundRateByDay: {
    date: string
    refund_rate_pct: number
  }[]
}

export async function getPlatformRevenueMetrics(
  from: string,
  to: string
): Promise<RevenueMetrics> {
  await assertHQPermission('hq.merchant.view')
  const supabase = createServerSupabaseClient()

  const [gmv, revenueByMerchant, revenueByOrderType, paymentMethod, cashCard, avgTicket, tipRate, refundRate] =
    await Promise.all([
      supabase.rpc('get_platform_gmv_by_day', { p_from: from, p_to: to }),
      supabase.rpc('get_revenue_by_merchant', { p_from: from, p_to: to }),
      supabase.rpc('get_revenue_by_order_type', { p_from: from, p_to: to }),
      supabase.rpc('get_payment_method_mix', { p_from: from, p_to: to }),
      supabase.rpc('get_cash_vs_card_split', { p_from: from, p_to: to }),
      supabase.rpc('get_avg_ticket_by_day', { p_from: from, p_to: to }),
      supabase.rpc('get_tip_rate_by_day', { p_from: from, p_to: to }),
      supabase.rpc('get_refund_rate_by_day', { p_from: from, p_to: to }),
    ])

  return {
    gmvByDay: (gmv.data as any[]) ?? [],
    revenueByMerchant: (revenueByMerchant.data as any[]) ?? [],
    revenueByOrderType: (revenueByOrderType.data as any[]) ?? [],
    paymentMethodMix: (paymentMethod.data as any[]) ?? [],
    cashVsCardSplit: (cashCard.data as any[]) ?? [],
    avgTicketByDay: (avgTicket.data as any[]) ?? [],
    tipRateByDay: (tipRate.data as any[]) ?? [],
    refundRateByDay: (refundRate.data as any[]) ?? [],
  }
}
