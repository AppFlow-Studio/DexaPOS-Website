'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface OperationalMetrics {
  peakHoursHeatmap: {
    day_of_week: number
    hour: number
    order_count: number
  }[]
  busiestLocations: {
    location_id: string
    location_name: string
    merchant_name: string
    order_count: number
  }[]
  avgKitchenMinutes: number
  kitchenTrend: {
    date: string
    avg_minutes: number
    overall_avg: number
  }[]
  avgTableTurnMinutes: number
  tableTurnTrend: {
    date: string
    avg_minutes: number
    overall_avg: number
  }[]
  featureAdoption: {
    feature: string
    adopted_count: number
    total_merchants: number
    adoption_pct: number
  }[]
}

export async function getPlatformOperationalMetrics(
  from: string,
  to: string
): Promise<OperationalMetrics> {
  await assertHQPermission('hq.merchant.view')
  const supabase = createServerSupabaseClient()

  const [peakHours, locations, kitchenTime, tableTurnTime, adoption] = await Promise.all([
    supabase.rpc('get_peak_hours_heatmap', { p_from: from, p_to: to }),
    supabase.rpc('get_busiest_locations', { p_from: from, p_to: to }),
    supabase.rpc('get_avg_kitchen_time', { p_from: from, p_to: to }),
    supabase.rpc('get_avg_table_turn_time', { p_from: from, p_to: to }),
    supabase.rpc('get_feature_adoption_rates', { p_from: from, p_to: to }),
  ])

  const kitchenData = (kitchenTime.data as any[]) ?? []
  const tableTurnData = (tableTurnTime.data as any[]) ?? []

  return {
    peakHoursHeatmap: (peakHours.data as any[]) ?? [],
    busiestLocations: (locations.data as any[]) ?? [],
    avgKitchenMinutes: kitchenData[kitchenData.length - 1]?.overall_avg ?? 0,
    kitchenTrend: kitchenData,
    avgTableTurnMinutes: tableTurnData[tableTurnData.length - 1]?.overall_avg ?? 0,
    tableTurnTrend: tableTurnData,
    featureAdoption: (adoption.data as any[]) ?? [],
  }
}
