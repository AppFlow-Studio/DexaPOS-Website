'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

// ============================================================================
// TYPES
// ============================================================================

export interface PlatformDashboardKPIs {
  revenueToday: number
  revenueLastWeekSameDay: number
  ordersToday: number
  ordersLastWeekSameDay: number
  avgOrderValue: number
  activeOrdersNow: number
  stationsOnline: number
  stationsTotalCount: number
  staffClockedIn: number
  paymentSuccessRate: number
  openSupportTickets: number
}

export interface HourlyOrderCount {
  hour: number // 0-23
  count: number
}

export interface StationHealth {
  id: string
  name: string
  locationName: string
  merchantName: string
  merchantId: string
  isOnline: boolean
  lastHeartbeatAt: string | null
  batteryLevel: number | null
  appVersion: string | null
  status: 'green' | 'yellow' | 'red' | 'grey'
}

export interface MerchantStationGroup {
  merchantId: string
  merchantName: string
  stations: StationHealth[]
}

export interface PlatformAlert {
  id: string
  severity: 'high' | 'medium' | 'low'
  message: string
  resourceType: 'station' | 'merchant' | 'order' | 'payment' | 'support'
  resourceId?: string
  link?: string
  createdAt: string
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get station health status based on various factors
 */
function getStationHealth(
  isOnline: boolean,
  lastHeartbeatAt: string | null,
  batteryLevel: number | null,
  appVersion: string | null,
  isActive: boolean = true
): 'green' | 'yellow' | 'red' | 'grey' {
  if (!isActive) return 'grey'

  if (!isOnline) return 'red'

  // Check heartbeat age
  const heartbeatAge = lastHeartbeatAt
    ? (Date.now() - new Date(lastHeartbeatAt).getTime()) / 1000 / 60 // in minutes
    : null

  // Current app version (hardcoded, could be fetched from config)
  const CURRENT_APP_VERSION = '2.4.1'
  const isOutdated = appVersion && appVersion !== CURRENT_APP_VERSION

  // Red conditions
  if (batteryLevel !== null && batteryLevel < 15) return 'red'
  if (heartbeatAge !== null && heartbeatAge > 15) return 'red'

  // Yellow conditions
  if (heartbeatAge !== null && heartbeatAge > 5) return 'yellow'
  if (batteryLevel !== null && batteryLevel < 30) return 'yellow'
  if (isOutdated) return 'yellow'

  // Green
  return 'green'
}

// ============================================================================
// PLATFORM ACTIONS
// ============================================================================

/**
 * Get key platform metrics for the dashboard
 */
export async function getPlatformDashboardKPIs(): Promise<PlatformDashboardKPIs> {
  await assertHQPermission('hq.merchant.view')
  const supabase = createServerSupabaseClient()
  const serviceRole = createServiceRoleClient()

  // Get today's date range and last week same day
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const lastWeekSameDay = new Date(today)
  lastWeekSameDay.setDate(lastWeekSameDay.getDate() - 7)
  const lastWeekSameDayEnd = new Date(lastWeekSameDay)
  lastWeekSameDayEnd.setDate(lastWeekSameDayEnd.getDate() + 1)

  // 1. Revenue Today
  const { data: revenueDataToday } = await supabase
    .from('orders')
    .select('total_amount')
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('completed_at', today.toISOString())
    .lt('completed_at', tomorrow.toISOString())

  const revenueToday = revenueDataToday?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0

  // 2. Revenue Last Week Same Day
  const { data: revenueDataLastWeek } = await supabase
    .from('orders')
    .select('total_amount')
    .not('status', 'in', '(draft,cancelled,void)')
    .gte('completed_at', lastWeekSameDay.toISOString())
    .lt('completed_at', lastWeekSameDayEnd.toISOString())

  const revenueLastWeekSameDay =
    revenueDataLastWeek?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0

  // 3. Orders Today
  const { data: ordersDataToday } = await supabase
    .from('orders')
    .select('id')
    .gte('created_at', today.toISOString())
    .lt('created_at', tomorrow.toISOString())

  const ordersToday = ordersDataToday?.length || 0

  // 4. Orders Last Week Same Day
  const { data: ordersDataLastWeek } = await supabase
    .from('orders')
    .select('id')
    .gte('created_at', lastWeekSameDay.toISOString())
    .lt('created_at', lastWeekSameDayEnd.toISOString())

  const ordersLastWeekSameDay = ordersDataLastWeek?.length || 0

  // 5. Average Order Value (today)
  const avgOrderValue = ordersToday > 0 ? revenueToday / ordersToday : 0

  // 6. Active Orders Right Now
  const { data: activeOrdersData } = await supabase
    .from('orders')
    .select('id')
    .in('status', ['pending', 'sent_to_kitchen', 'preparing', 'ready'])

  const activeOrdersNow = activeOrdersData?.length || 0

  // 7. Stations Online
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  const { data: stationsData, count: stationsTotalCount } = await supabase
    .from('stations')
    .select('id', { count: 'exact' })
    .eq('is_active', true)

  const { count: stationsOnlineCount } = await supabase
    .from('stations')
    .select('id', { count: 'exact' })
    .eq('is_active', true)
    .eq('is_online', true)
    .gte('last_heartbeat_at', fiveMinutesAgo.toISOString())

  const stationsOnline = stationsOnlineCount || 0

  // 8. Staff Clocked In (has clock_in_time and no clock_out_time)
  // Note: Using service role client to bypass RLS and query across all merchants
  const { count: staffClockedInCount } = await serviceRole
    .from('staff_shifts')
    .select('id', { count: 'exact' })
    .not('clock_in_time', 'is', null)
    .is('clock_out_time', null)

  const staffClockedIn = staffClockedInCount || 0

  // 9. Payment Success Rate (today)
  const { data: paymentsDataToday } = await supabase
    .from('order_payments')
    .select('id, status')
    .gte('created_at', today.toISOString())
    .lt('created_at', tomorrow.toISOString())

  let paymentSuccessRate = 100
  if (paymentsDataToday && paymentsDataToday.length > 0) {
    const successCount = paymentsDataToday.filter(
      (p) => p.status === 'captured' || p.status === 'succeeded'
    ).length
    paymentSuccessRate = (successCount / paymentsDataToday.length) * 100
  }

  // 10. Open Support Tickets (table doesn't exist yet, hardcoded to 0)
  const openSupportTickets = 0

  return {
    revenueToday,
    revenueLastWeekSameDay,
    ordersToday,
    ordersLastWeekSameDay,
    avgOrderValue,
    activeOrdersNow,
    stationsOnline,
    stationsTotalCount: stationsTotalCount || 0,
    staffClockedIn,
    paymentSuccessRate,
    openSupportTickets,
  }
}

/**
 * Get all stations grouped by merchant with health status
 */
export async function getPlatformStationFleet(): Promise<MerchantStationGroup[]> {
  await assertHQPermission('hq.merchant.view')
  const supabase = createServerSupabaseClient()

  // Fetch stations with location and merchant info
  const { data: stationsData, error } = await supabase
    .from('stations')
    .select(
      `
      id,
      name,
      merchant_id,
      location_id,
      is_online,
      is_active,
      last_heartbeat_at,
      battery_level,
      app_version,
      merchants (id, name),
      locations (id, name)
    `
    )
    .eq('is_active', true)
    .order('merchant_id', { ascending: true })

  if (error || !stationsData) {
    console.error('[getPlatformStationFleet] Error:', error)
    return []
  }

  // Group by merchant
  const grouped = new Map<string, MerchantStationGroup>()

  stationsData.forEach((station: any) => {
    const merchantId = station.merchant_id
    const merchantName = station.merchants?.name || 'Unknown'

    if (!grouped.has(merchantId)) {
      grouped.set(merchantId, {
        merchantId,
        merchantName,
        stations: [],
      })
    }

    const stationHealth = getStationHealth(
      station.is_online,
      station.last_heartbeat_at,
      station.battery_level,
      station.app_version,
      station.is_active
    )

    grouped.get(merchantId)!.stations.push({
      id: station.id,
      name: station.name,
      locationName: station.locations?.name || 'Unknown',
      merchantName,
      merchantId,
      isOnline: station.is_online,
      lastHeartbeatAt: station.last_heartbeat_at,
      batteryLevel: station.battery_level,
      appVersion: station.app_version,
      status: stationHealth,
    })
  })

  return Array.from(grouped.values())
}

/**
 * Get hourly order counts for the last 24 hours
 */
export async function getPlatformOrdersHeatmap(): Promise<HourlyOrderCount[]> {
  await assertHQPermission('hq.merchant.view')
  const supabase = createServerSupabaseClient()

  // Get orders from the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const { data: ordersData, error } = await supabase
    .from('orders')
    .select('created_at')
    .gte('created_at', oneDayAgo.toISOString())

  if (error || !ordersData) {
    console.error('[getPlatformOrdersHeatmap] Error:', error)
    // Return empty 24-hour array
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }))
  }

  // Group by hour
  const hourCounts = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }))

  ordersData.forEach((order: any) => {
    const hour = new Date(order.created_at).getHours()
    hourCounts[hour].count++
  })

  return hourCounts
}

/**
 * Get computed alerts for the dashboard
 */
export async function getPlatformAlerts(): Promise<PlatformAlert[]> {
  await assertHQPermission('hq.merchant.view')
  const supabase = createServerSupabaseClient()

  const alerts: PlatformAlert[] = []
  const now = new Date()

  // 1. Stations offline during business hours (8 AM - 10 PM)
  const currentHour = now.getHours()
  if (currentHour >= 8 && currentHour < 22) {
    const { data: offlineStations } = await supabase
      .from('stations')
      .select('id, name, merchant_id, location_id, merchants(name), locations(name)')
      .eq('is_active', true)
      .eq('is_online', false)

    offlineStations?.forEach((station: any) => {
      alerts.push({
        id: `offline-${station.id}`,
        severity: 'high',
        message: `Station "${station.name}" at ${station.locations?.name} (${station.merchants?.name}) went offline`,
        resourceType: 'station',
        resourceId: station.id,
        link: `/manage/merchants/${station.merchant_id}?tab=devices`,
        createdAt: now.toISOString(),
      })
    })
  }

  // 2. Merchants with zero orders today (had orders yesterday, past noon)
  if (now.getHours() >= 12) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayEnd = new Date(yesterday)
    yesterdayEnd.setDate(yesterdayEnd.getDate() + 1)

    // Get merchants with orders yesterday
    const { data: merchantsWithOrdersYesterday } = await supabase
      .from('orders')
      .select('merchant_id')
      .gte('created_at', yesterday.toISOString())
      .lt('created_at', yesterdayEnd.toISOString())
      .distinct()

    if (merchantsWithOrdersYesterday && merchantsWithOrdersYesterday.length > 0) {
      const merchantIds = merchantsWithOrdersYesterday.map((o) => (o as any).merchant_id)

      // Get merchants with NO orders today
      const { data: merchantsWithOrdersToday } = await supabase
        .from('orders')
        .select('merchant_id')
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString())
        .in('merchant_id', merchantIds)
        .distinct()

      const merchantIdsWithOrdersToday = new Set(
        merchantsWithOrdersToday?.map((o) => (o as any).merchant_id) || []
      )
      const inactiveMerchantIds = merchantIds.filter((id) => !merchantIdsWithOrdersToday.has(id))

      if (inactiveMerchantIds.length > 0) {
        const { data: merchantDetails } = await supabase
          .from('merchants')
          .select('id, name')
          .in('id', inactiveMerchantIds)

        merchantDetails?.forEach((merchant: any) => {
          alerts.push({
            id: `no-orders-${merchant.id}`,
            severity: 'medium',
            message: `${merchant.name} has not received any orders today (was active yesterday)`,
            resourceType: 'merchant',
            resourceId: merchant.id,
            link: `/manage/merchants/${merchant.id}`,
            createdAt: now.toISOString(),
          })
        })
      }
    }
  }

  // 3. High void rate > 5% in last 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const { data: ordersLast24h } = await supabase
    .from('orders')
    .select('id, status')
    .gte('created_at', oneDayAgo.toISOString())

  if (ordersLast24h && ordersLast24h.length > 0) {
    const voidCount = ordersLast24h.filter((o) => o.status === 'void').length
    const voidRate = (voidCount / ordersLast24h.length) * 100

    if (voidRate > 5) {
      alerts.push({
        id: 'high-void-rate',
        severity: 'medium',
        message: `High void rate: ${voidRate.toFixed(1)}% of orders in last 24h`,
        resourceType: 'order',
        link: `/manage/transactions`,
        createdAt: now.toISOString(),
      })
    }
  }

  // 4. App version outdated
  const CURRENT_APP_VERSION = '2.4.1'
  const { data: outdatedStations } = await supabase
    .from('stations')
    .select('id, name, app_version, merchant_id, merchants(name)')
    .eq('is_active', true)
    .neq('app_version', CURRENT_APP_VERSION)
    .not('app_version', 'is', null)

  outdatedStations?.forEach((station: any) => {
    alerts.push({
      id: `outdated-${station.id}`,
      severity: 'low',
      message: `Station "${station.name}" running app v${station.app_version} (current: v${CURRENT_APP_VERSION})`,
      resourceType: 'station',
      resourceId: station.id,
      link: `/manage/merchants/${station.merchant_id}?tab=devices`,
      createdAt: now.toISOString(),
    })
  })

  // 5. Low battery stations < 20%
  const { data: lowBatteryStations } = await supabase
    .from('stations')
    .select('id, name, battery_level, merchant_id, locations(name), merchants(name)')
    .eq('is_active', true)
    .lt('battery_level', 20)
    .not('battery_level', 'is', null)

  lowBatteryStations?.forEach((station: any) => {
    alerts.push({
      id: `low-battery-${station.id}`,
      severity: 'low',
      message: `Station "${station.name}" at ${station.locations?.name} battery at ${station.battery_level}%`,
      resourceType: 'station',
      resourceId: station.id,
      link: `/manage/merchants/${station.merchant_id}?tab=devices`,
      createdAt: now.toISOString(),
    })
  })

  // 6. Chargebacks received in last 24h
  const { data: chargebacksLast24h } = await supabase
    .from('chargebacks')
    .select('id, amount, merchant_id, merchants(name)')
    .gte('received_at', oneDayAgo.toISOString())

  chargebacksLast24h?.forEach((chargeback: any) => {
    alerts.push({
      id: `chargeback-${chargeback.id}`,
      severity: 'high',
      message: `Chargeback of $${Number(chargeback.amount).toFixed(2)} received from ${chargeback.merchants?.name}`,
      resourceType: 'payment',
      resourceId: chargeback.id,
      link: `/manage/transactions`,
      createdAt: now.toISOString(),
    })
  })

  // 7. High refund volume > 10% of revenue in last 24h
  const { data: refundsData } = await supabase
    .from('order_payments')
    .select('amount, total_amount')
    .in('status', ['refunded', 'partially_refunded'])
    .gte('created_at', oneDayAgo.toISOString())

  const { data: allPayments } = await supabase
    .from('order_payments')
    .select('total_amount')
    .gte('created_at', oneDayAgo.toISOString())

  if (refundsData && allPayments && allPayments.length > 0) {
    const totalRefunded = refundsData.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const totalRevenue = allPayments.reduce((sum, p) => sum + Number(p.total_amount || 0), 0)

    if (totalRevenue > 0) {
      const refundRate = (totalRefunded / totalRevenue) * 100
      if (refundRate > 10) {
        alerts.push({
          id: 'high-refunds',
          severity: 'medium',
          message: `High refund volume: ${refundRate.toFixed(1)}% of revenue in last 24h`,
          resourceType: 'payment',
          link: `/manage/transactions`,
          createdAt: now.toISOString(),
        })
      }
    }
  }

  return alerts
}
