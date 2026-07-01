'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { applyReportablePredicate } from '@/lib/reporting/recognized-order'

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

export interface GroupedDevice {
  stationId: string
  stationName: string
  lastHeartbeatAt: string | null
}

export interface PlatformAlert {
  id: string
  severity: 'high' | 'medium' | 'low'
  message: string
  resourceType: 'station' | 'merchant' | 'order' | 'payment' | 'support' | 'location'
  resourceId?: string
  link?: string
  createdAt: string
  // Populated when this is a correlated multi-device alert (A9).
  // UI should render the count + expandable device list and skip the
  // individual per-station alerts (they are suppressed on the server side).
  groupedDevices?: GroupedDevice[]
  locationId?: string
  merchantId?: string
}

export interface ActivityFeedEvent {
  id: string
  emoji: string
  message: string
  timestamp: string
  link?: string
  resourceType: string
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

  // Recognized orders only. Revenue and order count both key off `created_at`
  // and the same gate so they describe the same set (previously revenue keyed
  // off `completed_at` — the manual tap — while order count had no gate at all).

  // 1. Revenue Today
  const { data: revenueDataToday } = await applyReportablePredicate(
    supabase.from('orders').select('total_amount')
  )
    .gte('created_at', today.toISOString())
    .lt('created_at', tomorrow.toISOString())

  const revenueToday = revenueDataToday?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0

  // 2. Revenue Last Week Same Day
  const { data: revenueDataLastWeek } = await applyReportablePredicate(
    supabase.from('orders').select('total_amount')
  )
    .gte('created_at', lastWeekSameDay.toISOString())
    .lt('created_at', lastWeekSameDayEnd.toISOString())

  const revenueLastWeekSameDay =
    revenueDataLastWeek?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0

  // 3. Orders Today
  const { data: ordersDataToday } = await applyReportablePredicate(
    supabase.from('orders').select('id')
  )
    .gte('created_at', today.toISOString())
    .lt('created_at', tomorrow.toISOString())

  const ordersToday = ordersDataToday?.length || 0

  // 4. Orders Last Week Same Day
  const { data: ordersDataLastWeek } = await applyReportablePredicate(
    supabase.from('orders').select('id')
  )
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
    .gte('initiated_at', today.toISOString())
    .lt('initiated_at', tomorrow.toISOString())

  let paymentSuccessRate = 100
  if (paymentsDataToday && paymentsDataToday.length > 0) {
    const successCount = paymentsDataToday.filter(
      (p) => p.status === 'captured' || p.status === 'paid'
    ).length
    paymentSuccessRate = (successCount / paymentsDataToday.length) * 100
  }

  // 10. Open Support Tickets — bound to get_support_dashboard_stats() (the
  // support-tickets feature shipped after this dashboard; the old hardcoded 0
  // was a stale data-binding gap). SECURITY DEFINER RPC, service-role invoked.
  const { data: supportStats } = await serviceRole.rpc('get_support_dashboard_stats')
  const openSupportTickets = Number((supportStats as { open_count?: number })?.open_count ?? 0)

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
  // Use service role client to bypass RLS since stations table doesn't have HQ policies yet
  const supabase = createServiceRoleClient()

  // Fetch stations with location and merchant info
  const { data: stationsData, error } = await supabase
    .from('stations')
    .select(
      `
      id,
      station_name,
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
    console.error('[getPlatformStationFleet] Query failed:', error)
    return []
  }

  if (stationsData.length === 0) {
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
      name: station.station_name,
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
  // Use service role client to bypass RLS
  const supabase = createServiceRoleClient()

  const alerts: PlatformAlert[] = []
  const now = new Date()

  // 1. Stations offline during business hours (8 AM - 10 PM) — A9 correlation.
  //    If >=50% of a location's active stations are offline AND at least 2 are
  //    offline, collapse to a single grouped alert per location. Otherwise
  //    emit per-station alerts as before.
  const currentHour = now.getHours()
  if (currentHour >= 8 && currentHour < 22) {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()

    // Pull every active station with its online state in one round-trip so we
    // know the per-location denominator without a second query.
    const { data: stations } = await supabase
      .from('stations')
      .select('id, station_name, merchant_id, location_id, is_online, last_heartbeat_at, merchants(name), locations(name)')
      .eq('is_active', true)

    if (stations && stations.length > 0) {
      type StationRow = {
        id: string
        station_name: string
        merchant_id: string
        location_id: string
        is_online: boolean
        last_heartbeat_at: string | null
        merchants?: { name?: string } | null
        locations?: { name?: string } | null
      }

      const isOffline = (s: StationRow) =>
        s.is_online === false ||
        (s.last_heartbeat_at !== null && s.last_heartbeat_at < fiveMinutesAgo)

      // Bucket by location: { total active, offline rows }.
      const byLocation = new Map<
        string,
        { total: number; offline: StationRow[]; locationName: string; merchantId: string; merchantName: string }
      >()

      for (const raw of stations as unknown as StationRow[]) {
        const bucket = byLocation.get(raw.location_id) ?? {
          total: 0,
          offline: [],
          locationName: raw.locations?.name ?? 'Unknown location',
          merchantId: raw.merchant_id,
          merchantName: raw.merchants?.name ?? 'Unknown merchant',
        }
        bucket.total += 1
        if (isOffline(raw)) bucket.offline.push(raw)
        byLocation.set(raw.location_id, bucket)
      }

      const GROUP_RATIO = 0.5
      const GROUP_MIN_COUNT = 2 // avoid grouping a 1-station location with itself

      for (const [locationId, bucket] of byLocation) {
        if (bucket.offline.length === 0) continue

        const ratio = bucket.offline.length / bucket.total
        const shouldGroup =
          bucket.offline.length >= GROUP_MIN_COUNT && ratio >= GROUP_RATIO

        if (shouldGroup) {
          alerts.push({
            id: `offline-location-${locationId}`,
            severity: 'high',
            message: `${bucket.offline.length} of ${bucket.total} devices offline at ${bucket.locationName} (${bucket.merchantName})`,
            resourceType: 'location',
            resourceId: locationId,
            locationId,
            merchantId: bucket.merchantId,
            link: `/manage/merchants/${bucket.merchantId}?tab=devices&location=${locationId}`,
            createdAt: now.toISOString(),
            groupedDevices: bucket.offline.map((s) => ({
              stationId: s.id,
              stationName: s.station_name,
              lastHeartbeatAt: s.last_heartbeat_at,
            })),
          })
        } else {
          for (const s of bucket.offline) {
            alerts.push({
              id: `offline-${s.id}`,
              severity: 'high',
              message: `Station "${s.station_name}" at ${bucket.locationName} (${bucket.merchantName}) went offline`,
              resourceType: 'station',
              resourceId: s.id,
              locationId,
              merchantId: bucket.merchantId,
              link: `/manage/merchants/${bucket.merchantId}?tab=devices`,
              createdAt: now.toISOString(),
            })
          }
        }
      }
    }
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

    if (merchantsWithOrdersYesterday && merchantsWithOrdersYesterday.length > 0) {
      // Get unique merchant IDs from yesterday
      const merchantIds = Array.from(new Set(merchantsWithOrdersYesterday.map((o) => (o as any).merchant_id)))

      // Get merchants with NO orders today
      const { data: merchantsWithOrdersToday } = await supabase
        .from('orders')
        .select('merchant_id')
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString())
        .in('merchant_id', merchantIds)

      const merchantIdsWithOrdersToday = new Set(
        (merchantsWithOrdersToday || []).map((o) => (o as any).merchant_id)
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
    .select('id, station_name, app_version, merchant_id, merchants(name)')
    .eq('is_active', true)
    .neq('app_version', CURRENT_APP_VERSION)
    .not('app_version', 'is', null)

  outdatedStations?.forEach((station: any) => {
    alerts.push({
      id: `outdated-${station.id}`,
      severity: 'low',
      message: `Station "${station.station_name}" running app v${station.app_version} (current: v${CURRENT_APP_VERSION})`,
      resourceType: 'station',
      resourceId: station.id,
      link: `/manage/merchants/${station.merchant_id}?tab=devices`,
      createdAt: now.toISOString(),
    })
  })

  // 5. Low battery stations < 20%
  const { data: lowBatteryStations } = await supabase
    .from('stations')
    .select('id, station_name, battery_level, merchant_id, locations(name), merchants(name)')
    .eq('is_active', true)
    .lt('battery_level', 20)
    .not('battery_level', 'is', null)

  lowBatteryStations?.forEach((station: any) => {
    alerts.push({
      id: `low-battery-${station.id}`,
      severity: 'low',
      message: `Station "${station.station_name}" at ${station.locations?.name} battery at ${station.battery_level}%`,
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
    .gte('refunded_at', oneDayAgo.toISOString())

  const { data: allPayments } = await supabase
    .from('order_payments')
    .select('total_amount')
    .gte('initiated_at', oneDayAgo.toISOString())

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

/**
 * Get recent activity events for the live feed (last 30 minutes)
 */
export async function getPlatformActivityFeed(): Promise<ActivityFeedEvent[]> {
  await assertHQPermission('hq.merchant.view')
  const supabase = createServiceRoleClient()
  const events: ActivityFeedEvent[] = []
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

  // 1. New merchants in last 30 minutes
  const { data: newMerchants } = await supabase
    .from('merchants')
    .select('id, name, created_at')
    .gte('created_at', thirtyMinutesAgo.toISOString())
    .order('created_at', { ascending: false })

  newMerchants?.forEach((merchant: any) => {
    events.push({
      id: `merchant-${merchant.id}`,
      emoji: '🏪',
      message: `<strong>${merchant.name}</strong> just joined the platform`,
      timestamp: merchant.created_at,
      link: `/manage/merchants/${merchant.id}`,
      resourceType: 'merchant',
    })
  })

  // 2. High-value orders in last 30 minutes
  const { data: highValueOrders } = await supabase
    .from('orders')
    .select('id, total_amount, merchant_id, created_at')
    .gt('total_amount', 100)
    .gte('created_at', thirtyMinutesAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  highValueOrders?.forEach((order: any) => {
    events.push({
      id: `order-${order.id}`,
      emoji: '🎉',
      message: `New order of <strong>$${Number(order.total_amount).toFixed(2)}</strong> placed`,
      timestamp: order.created_at,
      link: `/manage/transactions?orderId=${order.id}`,
      resourceType: 'order',
    })
  })

  // 3. Failed payments in last 30 minutes
  const { data: failedPayments } = await supabase
    .from('order_payments')
    .select('id, status, failed_at')
    .in('status', ['failed', 'declined'])
    .gte('failed_at', thirtyMinutesAgo.toISOString())
    .order('failed_at', { ascending: false })
    .limit(10)

  failedPayments?.forEach((payment: any) => {
    events.push({
      id: `payment-${payment.id}`,
      emoji: '⚠️',
      message: `Payment failed — ${payment.status === 'declined' ? 'card declined' : 'error'}`,
      timestamp: payment.failed_at,
      link: `/manage/transactions?paymentId=${payment.id}`,
      resourceType: 'payment',
    })
  })

  // 4. Stations went offline in last 30 minutes
  const { data: offlineStations } = await supabase
    .from('stations')
    .select('id, station_name, merchant_id, updated_at')
    .eq('is_online', false)
    .gte('updated_at', thirtyMinutesAgo.toISOString())
    .order('updated_at', { ascending: false })
    .limit(10)

  offlineStations?.forEach((station: any) => {
    events.push({
      id: `station-offline-${station.id}`,
      emoji: '📡',
      message: `Station <strong>${station.station_name}</strong> went offline`,
      timestamp: station.updated_at,
      link: `/manage/merchants/${station.merchant_id}?tab=devices`,
      resourceType: 'station',
    })
  })

  // 5. Low battery alerts in last 30 minutes
  const { data: lowBatteryStations } = await supabase
    .from('stations')
    .select('id, station_name, battery_level, merchant_id, updated_at')
    .lt('battery_level', 15)
    .not('battery_level', 'is', null)
    .gte('updated_at', thirtyMinutesAgo.toISOString())
    .order('updated_at', { ascending: false })
    .limit(10)

  lowBatteryStations?.forEach((station: any) => {
    events.push({
      id: `battery-${station.id}`,
      emoji: '🔋',
      message: `Station <strong>${station.station_name}</strong> battery critically low (${station.battery_level}%)`,
      timestamp: station.updated_at,
      link: `/manage/merchants/${station.merchant_id}?tab=devices`,
      resourceType: 'station',
    })
  })

  // 6. Chargebacks in last 30 minutes
  const { data: chargebacks } = await supabase
    .from('chargebacks')
    .select('id, amount, created_at')
    .gte('created_at', thirtyMinutesAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  chargebacks?.forEach((chargeback: any) => {
    events.push({
      id: `chargeback-${chargeback.id}`,
      emoji: '🚨',
      message: `Chargeback received — <strong>$${Number(chargeback.amount).toFixed(2)}</strong>`,
      timestamp: chargeback.created_at,
      link: `/manage/transactions`,
      resourceType: 'payment',
    })
  })

  // 7. Voided orders in last 30 minutes
  const { data: voidedOrders } = await supabase
    .from('orders')
    .select('id, total_amount, updated_at')
    .eq('status', 'void')
    .gt('total_amount', 50)
    .gte('updated_at', thirtyMinutesAgo.toISOString())
    .order('updated_at', { ascending: false })
    .limit(10)

  voidedOrders?.forEach((order: any) => {
    events.push({
      id: `void-${order.id}`,
      emoji: '🚫',
      message: `<strong>$${Number(order.total_amount).toFixed(2)}</strong> order voided`,
      timestamp: order.updated_at,
      link: `/manage/transactions?orderId=${order.id}`,
      resourceType: 'order',
    })
  })

  // Sort by timestamp descending and limit to 50
  return events
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50)
}
