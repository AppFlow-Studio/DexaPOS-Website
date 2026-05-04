'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface PlatformFeeTotals {
  gross_dual_pricing_fee: number
  gross_tip_fee: number
  refunded_dual_pricing_fee: number
  refunded_tip_fee: number
  net_platform_fee: number
  payment_count: number
}

export interface PlatformFeeDayPoint {
  day: string
  gross_dual_pricing_fee: number
  gross_tip_fee: number
  refunded_dual_pricing_fee: number
  refunded_tip_fee: number
  net_platform_fee: number
}

export interface MerchantFeeRow {
  merchant_id: string
  merchant_name: string
  location_count: number
  gross_dual_pricing_fee: number
  gross_tip_fee: number
  refunded_dual_pricing_fee: number
  refunded_tip_fee: number
  net_platform_fee: number
  payment_count: number
}

export interface LocationFeeRow {
  location_id: string
  location_name: string
  location_address: string | null
  tip_surcharge_percentage: number
  dual_pricing_percentage: number
  gross_dual_pricing_fee: number
  gross_tip_fee: number
  refunded_dual_pricing_fee: number
  refunded_tip_fee: number
  net_platform_fee: number
  payment_count: number
}

export interface RecentActivityEntry {
  payment_id: string
  captured_at: string
  location_id: string | null
  location_name: string | null
  amount: number
  card_fee: number
  status: string
  is_returned: boolean
}

export interface PlatformFeesOverview {
  totals: PlatformFeeTotals
  byDay: PlatformFeeDayPoint[]
  byMerchant: MerchantFeeRow[]
}

export interface MerchantPlatformFeesDetail {
  merchant: {
    id: string
    name: string
    type: string | null
    onboarding_status: string | null
    dual_pricing_percentage: number
  }
  totals: PlatformFeeTotals
  byDay: PlatformFeeDayPoint[]
  byLocation: LocationFeeRow[]
  recentActivity: RecentActivityEntry[]
}

export interface MerchantPaymentRow {
  id: string
  captured_at: string
  location_id: string | null
  location_name: string | null
  card_type: string | null
  card_last_four: string | null
  subtotal_portion: number
  tip_amount: number
  total_amount: number
  dual_pricing_fee: number
  status: string
  is_returned: boolean
}

export interface MerchantPaymentsResult {
  rows: MerchantPaymentRow[]
  totalCount: number
}

const PAYMENT_STATUS_FILTER = ['captured', 'partially_refunded', 'refunded']

interface FeeRow {
  merchant_id: string | null
  location_id: string | null
  captured_at: string
  dual_pricing_fee: number | null
  tip_fee: number | null
  refunded_dual_pricing_fee: number | null
  refunded_tip_fee: number | null
  status: string | null
  is_returned: boolean | null
}

function emptyTotals(): PlatformFeeTotals {
  return {
    gross_dual_pricing_fee: 0,
    gross_tip_fee: 0,
    refunded_dual_pricing_fee: 0,
    refunded_tip_fee: 0,
    net_platform_fee: 0,
    payment_count: 0,
  }
}

function accumulate(target: PlatformFeeTotals, row: FeeRow) {
  const dpf = Number(row.dual_pricing_fee || 0)
  const tipf = Number(row.tip_fee || 0)
  const rdpf = Number(row.refunded_dual_pricing_fee || 0)
  const rtipf = Number(row.refunded_tip_fee || 0)
  target.gross_dual_pricing_fee += dpf
  target.gross_tip_fee += tipf
  target.refunded_dual_pricing_fee += rdpf
  target.refunded_tip_fee += rtipf
  target.net_platform_fee += dpf + tipf - rdpf - rtipf
  target.payment_count += 1
}

function round2(totals: PlatformFeeTotals): PlatformFeeTotals {
  return {
    gross_dual_pricing_fee: Math.round(totals.gross_dual_pricing_fee * 100) / 100,
    gross_tip_fee: Math.round(totals.gross_tip_fee * 100) / 100,
    refunded_dual_pricing_fee: Math.round(totals.refunded_dual_pricing_fee * 100) / 100,
    refunded_tip_fee: Math.round(totals.refunded_tip_fee * 100) / 100,
    net_platform_fee: Math.round(totals.net_platform_fee * 100) / 100,
    payment_count: totals.payment_count,
  }
}

async function fetchFeeRows(args: {
  from: string
  to: string
  merchantId?: string
  locationId?: string
}): Promise<FeeRow[]> {
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('order_payments')
    .select(
      'merchant_id, location_id, captured_at, dual_pricing_fee, tip_fee, refunded_dual_pricing_fee, refunded_tip_fee, status, is_returned'
    )
    .gte('captured_at', args.from)
    .lt('captured_at', args.to)

  if (args.merchantId) query = query.eq('merchant_id', args.merchantId)
  if (args.locationId) query = query.eq('location_id', args.locationId)

  const { data, error } = await query
  if (error) {
    console.error('[platform-fees] fetchFeeRows error:', error)
    return []
  }
  const rows = (data || []) as FeeRow[]
  return rows.filter(
    (r) =>
      (r.status && PAYMENT_STATUS_FILTER.includes(r.status)) ||
      (r.status === 'void' && !!r.is_returned)
  )
}

export async function getPlatformFeesOverview(args: {
  from: string
  to: string
}): Promise<PlatformFeesOverview> {
  await assertHQPermission('hq.merchant.transactions')

  const rows = await fetchFeeRows({ from: args.from, to: args.to })

  const totals = emptyTotals()
  const byDayMap = new Map<string, PlatformFeeDayPoint>()
  const byMerchantMap = new Map<string, PlatformFeeTotals>()

  for (const row of rows) {
    accumulate(totals, row)

    const day = (row.captured_at || '').slice(0, 10)
    if (!byDayMap.has(day)) {
      byDayMap.set(day, {
        day,
        gross_dual_pricing_fee: 0,
        gross_tip_fee: 0,
        refunded_dual_pricing_fee: 0,
        refunded_tip_fee: 0,
        net_platform_fee: 0,
      })
    }
    const dp = byDayMap.get(day)!
    const dpf = Number(row.dual_pricing_fee || 0)
    const tipf = Number(row.tip_fee || 0)
    const rdpf = Number(row.refunded_dual_pricing_fee || 0)
    const rtipf = Number(row.refunded_tip_fee || 0)
    dp.gross_dual_pricing_fee += dpf
    dp.gross_tip_fee += tipf
    dp.refunded_dual_pricing_fee += rdpf
    dp.refunded_tip_fee += rtipf
    dp.net_platform_fee += dpf + tipf - rdpf - rtipf

    if (row.merchant_id) {
      if (!byMerchantMap.has(row.merchant_id)) {
        byMerchantMap.set(row.merchant_id, emptyTotals())
      }
      accumulate(byMerchantMap.get(row.merchant_id)!, row)
    }
  }

  const merchantIds = Array.from(byMerchantMap.keys())
  const merchantNames = new Map<string, string>()
  const merchantLocationCounts = new Map<string, number>()
  if (merchantIds.length > 0) {
    const supabase = createServiceRoleClient()
    const { data: merchants } = await supabase
      .from('merchants')
      .select('id, name')
      .in('id', merchantIds)
    for (const m of merchants || []) {
      merchantNames.set(m.id, (m as { id: string; name: string }).name || 'Unknown')
    }
    const { data: locations } = await supabase
      .from('locations')
      .select('id, merchant_id')
      .in('merchant_id', merchantIds)
    for (const l of locations || []) {
      const mid = (l as { merchant_id: string }).merchant_id
      merchantLocationCounts.set(mid, (merchantLocationCounts.get(mid) || 0) + 1)
    }
  }

  const byMerchant: MerchantFeeRow[] = merchantIds
    .map((id) => {
      const t = round2(byMerchantMap.get(id)!)
      return {
        merchant_id: id,
        merchant_name: merchantNames.get(id) || 'Unknown',
        location_count: merchantLocationCounts.get(id) || 0,
        ...t,
      }
    })
    .sort((a, b) => b.net_platform_fee - a.net_platform_fee)

  const byDay = Array.from(byDayMap.values())
    .map((d) => ({
      day: d.day,
      gross_dual_pricing_fee: Math.round(d.gross_dual_pricing_fee * 100) / 100,
      gross_tip_fee: Math.round(d.gross_tip_fee * 100) / 100,
      refunded_dual_pricing_fee: Math.round(d.refunded_dual_pricing_fee * 100) / 100,
      refunded_tip_fee: Math.round(d.refunded_tip_fee * 100) / 100,
      net_platform_fee: Math.round(d.net_platform_fee * 100) / 100,
    }))
    .sort((a, b) => a.day.localeCompare(b.day))

  return { totals: round2(totals), byDay, byMerchant }
}

export async function getMerchantPlatformFees(args: {
  merchantId: string
  from: string
  to: string
}): Promise<MerchantPlatformFeesDetail | null> {
  await assertHQPermission('hq.merchant.transactions')

  const supabase = createServiceRoleClient()
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id, name, type, onboarding_status, dual_pricing_percentage')
    .eq('id', args.merchantId)
    .single()
  if (merchantError || !merchant) return null

  const rows = await fetchFeeRows({
    from: args.from,
    to: args.to,
    merchantId: args.merchantId,
  })

  const totals = emptyTotals()
  const byDayMap = new Map<string, PlatformFeeDayPoint>()
  const byLocationMap = new Map<string, PlatformFeeTotals>()
  for (const row of rows) {
    accumulate(totals, row)
    const day = (row.captured_at || '').slice(0, 10)
    if (!byDayMap.has(day)) {
      byDayMap.set(day, {
        day,
        gross_dual_pricing_fee: 0,
        gross_tip_fee: 0,
        refunded_dual_pricing_fee: 0,
        refunded_tip_fee: 0,
        net_platform_fee: 0,
      })
    }
    const dp = byDayMap.get(day)!
    const dpf = Number(row.dual_pricing_fee || 0)
    const tipf = Number(row.tip_fee || 0)
    const rdpf = Number(row.refunded_dual_pricing_fee || 0)
    const rtipf = Number(row.refunded_tip_fee || 0)
    dp.gross_dual_pricing_fee += dpf
    dp.gross_tip_fee += tipf
    dp.refunded_dual_pricing_fee += rdpf
    dp.refunded_tip_fee += rtipf
    dp.net_platform_fee += dpf + tipf - rdpf - rtipf

    if (row.location_id) {
      if (!byLocationMap.has(row.location_id)) {
        byLocationMap.set(row.location_id, emptyTotals())
      }
      accumulate(byLocationMap.get(row.location_id)!, row)
    }
  }

  const { data: allLocations } = await supabase
    .from('locations')
    .select('id, name, address_line1, city, state, dual_pricing_percentage')
    .eq('merchant_id', args.merchantId)
    .order('name', { ascending: true })

  const byLocation: LocationFeeRow[] = (allLocations || []).map((loc) => {
    const l = loc as {
      id: string
      name: string
      address_line1: string | null
      city: string | null
      state: string | null
      dual_pricing_percentage: number | null
    }
    const t = byLocationMap.get(l.id)
    const totals = t ? round2(t) : emptyTotals()
    const addressParts = [l.address_line1, l.city, l.state].filter(Boolean)
    return {
      location_id: l.id,
      location_name: l.name || 'Unnamed',
      location_address: addressParts.length ? addressParts.join(', ') : null,
      tip_surcharge_percentage: 0,
      dual_pricing_percentage: Number(l.dual_pricing_percentage ?? 0),
      ...totals,
    }
  })

  const byDay = Array.from(byDayMap.values())
    .map((d) => ({
      day: d.day,
      gross_dual_pricing_fee: Math.round(d.gross_dual_pricing_fee * 100) / 100,
      gross_tip_fee: Math.round(d.gross_tip_fee * 100) / 100,
      refunded_dual_pricing_fee: Math.round(d.refunded_dual_pricing_fee * 100) / 100,
      refunded_tip_fee: Math.round(d.refunded_tip_fee * 100) / 100,
      net_platform_fee: Math.round(d.net_platform_fee * 100) / 100,
    }))
    .sort((a, b) => a.day.localeCompare(b.day))

  const { data: activity } = await supabase
    .from('order_payments')
    .select(
      'id, captured_at, location_id, total_amount, dual_pricing_fee, status, is_returned'
    )
    .eq('merchant_id', args.merchantId)
    .gte('captured_at', args.from)
    .lt('captured_at', args.to)
    .order('captured_at', { ascending: false })
    .limit(10)

  const locationNameById = new Map(byLocation.map((l) => [l.location_id, l.location_name]))
  const recentActivity: RecentActivityEntry[] = ((activity as unknown as Array<{
    id: string
    captured_at: string | null
    location_id: string | null
    total_amount: number | null
    dual_pricing_fee: number | null
    status: string | null
    is_returned: boolean | null
  }>) || []).map((p) => ({
    payment_id: p.id,
    captured_at: p.captured_at || '',
    location_id: p.location_id,
    location_name: p.location_id ? locationNameById.get(p.location_id) ?? null : null,
    amount: Number(p.total_amount || 0),
    card_fee: Number(p.dual_pricing_fee || 0),
    status: p.status || 'unknown',
    is_returned: !!p.is_returned,
  }))

  const m = merchant as {
    id: string
    name: string | null
    type: string | null
    onboarding_status: string | null
    dual_pricing_percentage: number | null
  }
  return {
    merchant: {
      id: m.id,
      name: m.name || 'Unknown',
      type: m.type,
      onboarding_status: m.onboarding_status,
      dual_pricing_percentage: Number(m.dual_pricing_percentage ?? 0),
    },
    totals: round2(totals),
    byDay,
    byLocation,
    recentActivity,
  }
}

export interface GetMerchantPaymentsParams {
  merchantId: string
  from: string
  to: string
  status?: 'all' | 'collected' | 'refunded' | 'disputed'
  locationId?: string
  limit?: number
  offset?: number
}

export async function getMerchantPayments(
  args: GetMerchantPaymentsParams
): Promise<MerchantPaymentsResult> {
  await assertHQPermission('hq.merchant.transactions')

  const supabase = createServiceRoleClient()
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 200)
  const offset = Math.max(args.offset ?? 0, 0)

  const baseSelect =
    'id, captured_at, location_id, card_type, card_last_four, subtotal_portion, tip_amount, total_amount, dual_pricing_fee, status, is_returned'

  let query = supabase
    .from('order_payments')
    .select(baseSelect, { count: 'exact' })
    .eq('merchant_id', args.merchantId)
    .gte('captured_at', args.from)
    .lt('captured_at', args.to)
    .order('captured_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (args.locationId) query = query.eq('location_id', args.locationId)

  if (args.status === 'collected') {
    query = query.eq('status', 'captured')
  } else if (args.status === 'refunded') {
    query = query.in('status', ['refunded', 'partially_refunded'])
  } else if (args.status === 'disputed') {
    query = query.eq('status', 'disputed')
  } else {
    query = query.in('status', ['captured', 'partially_refunded', 'refunded', 'disputed'])
  }

  const { data, error, count } = await query
  if (error) {
    console.error('[platform-fees] getMerchantPayments error:', error)
    return { rows: [], totalCount: 0 }
  }

  const locIds = Array.from(
    new Set(
      ((data || []) as Array<{ location_id: string | null }>)
        .map((r) => r.location_id)
        .filter((v): v is string => !!v)
    )
  )
  const locationNames = new Map<string, string>()
  if (locIds.length > 0) {
    const { data: locs } = await supabase
      .from('locations')
      .select('id, name')
      .in('id', locIds)
    for (const l of locs || []) {
      const lr = l as { id: string; name: string | null }
      locationNames.set(lr.id, lr.name || 'Unnamed')
    }
  }

  const rows: MerchantPaymentRow[] = ((data as unknown as Array<{
    id: string
    captured_at: string | null
    location_id: string | null
    card_type: string | null
    card_last_four: string | null
    subtotal_portion: number | null
    tip_amount: number | null
    total_amount: number | null
    dual_pricing_fee: number | null
    status: string | null
    is_returned: boolean | null
  }>) || []).map((r) => ({
    id: r.id,
    captured_at: r.captured_at || '',
    location_id: r.location_id,
    location_name: r.location_id ? locationNames.get(r.location_id) ?? null : null,
    card_type: r.card_type,
    card_last_four: r.card_last_four,
    subtotal_portion: Number(r.subtotal_portion || 0),
    tip_amount: Number(r.tip_amount || 0),
    total_amount: Number(r.total_amount || 0),
    dual_pricing_fee: Number(r.dual_pricing_fee || 0),
    status: r.status || 'unknown',
    is_returned: !!r.is_returned,
  }))

  return { rows, totalCount: count ?? rows.length }
}
