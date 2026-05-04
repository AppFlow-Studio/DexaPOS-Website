'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

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
  tip_surcharge_percentage: number
  dual_pricing_percentage: number
  gross_dual_pricing_fee: number
  gross_tip_fee: number
  refunded_dual_pricing_fee: number
  refunded_tip_fee: number
  net_platform_fee: number
  payment_count: number
}

export interface PlatformFeesOverview {
  totals: PlatformFeeTotals
  byDay: PlatformFeeDayPoint[]
  byMerchant: MerchantFeeRow[]
}

export interface MerchantPlatformFeesDetail {
  merchant: { id: string; name: string }
  totals: PlatformFeeTotals
  byDay: PlatformFeeDayPoint[]
  byLocation: LocationFeeRow[]
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
  let merchantNames = new Map<string, string>()
  let merchantLocationCounts = new Map<string, number>()
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
    .select('id, name')
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
    .select('id, name, tip_surcharge_percentage, dual_pricing_percentage')
    .eq('merchant_id', args.merchantId)
    .order('name', { ascending: true })

  const byLocation: LocationFeeRow[] = (allLocations || []).map((loc) => {
    const l = loc as {
      id: string
      name: string
      tip_surcharge_percentage: number | null
      dual_pricing_percentage: number | null
    }
    const t = byLocationMap.get(l.id)
    const totals = t ? round2(t) : emptyTotals()
    return {
      location_id: l.id,
      location_name: l.name || 'Unnamed',
      tip_surcharge_percentage: Number(l.tip_surcharge_percentage ?? 0),
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

  const m = merchant as { id: string; name: string }
  return {
    merchant: { id: m.id, name: m.name || 'Unknown' },
    totals: round2(totals),
    byDay,
    byLocation,
  }
}

export interface UpdateLocationFeeConfigParams {
  locationId: string
  tipSurchargePercentage?: number
  dualPricingPercentage?: number
}

export async function updateLocationFeeConfig(
  params: UpdateLocationFeeConfigParams
): Promise<{ success: boolean; error?: string }> {
  const auth = await assertHQPermission('hq.merchant.update')
  if (auth.role.level < 10) {
    return { success: false, error: 'Super Admin role required' }
  }

  const updates: Record<string, number> = {}
  if (params.tipSurchargePercentage !== undefined) {
    if (params.tipSurchargePercentage < 0 || params.tipSurchargePercentage > 50) {
      return { success: false, error: 'Tip surcharge must be between 0 and 50' }
    }
    updates.tip_surcharge_percentage = params.tipSurchargePercentage
  }
  if (params.dualPricingPercentage !== undefined) {
    if (params.dualPricingPercentage < 0 || params.dualPricingPercentage > 50) {
      return { success: false, error: 'Dual pricing percentage must be between 0 and 50' }
    }
    updates.dual_pricing_percentage = params.dualPricingPercentage
  }
  if (Object.keys(updates).length === 0) {
    return { success: false, error: 'No fields to update' }
  }

  const supabase = createServiceRoleClient()
  const { data: before, error: readErr } = await supabase
    .from('locations')
    .select('id, merchant_id, tip_surcharge_percentage, dual_pricing_percentage')
    .eq('id', params.locationId)
    .single()
  if (readErr || !before) return { success: false, error: 'Location not found' }

  const { error: updateErr } = await supabase
    .from('locations')
    .update(updates)
    .eq('id', params.locationId)
  if (updateErr) {
    console.error('[updateLocationFeeConfig] update error:', updateErr)
    return { success: false, error: updateErr.message }
  }

  const beforeRow = before as { merchant_id: string; tip_surcharge_percentage: number | null; dual_pricing_percentage: number | null }
  const { data: merchant } = await supabase
    .from('merchants')
    .select('clerk_org_id')
    .eq('id', beforeRow.merchant_id)
    .single()
  const clerkOrgId = (merchant as { clerk_org_id?: string } | null)?.clerk_org_id
  if (clerkOrgId) {
    await LogAuditEvent({
      clerkOrgId,
      locationId: params.locationId,
      action: 'updated_platform_fee_config',
      actionCategory: 'settings',
      severity: 'info',
      resourceType: 'location',
      resourceId: params.locationId,
      changes: {
        before: {
          tip_surcharge_percentage: beforeRow.tip_surcharge_percentage,
          dual_pricing_percentage: beforeRow.dual_pricing_percentage,
        },
        after: updates,
      },
    })
  }

  return { success: true }
}

export async function bulkUpdateMerchantLocationFees(args: {
  merchantId: string
  tipSurchargePercentage?: number
  dualPricingPercentage?: number
}): Promise<{ success: boolean; updated: number; error?: string }> {
  const auth = await assertHQPermission('hq.merchant.update')
  if (auth.role.level < 10) {
    return { success: false, updated: 0, error: 'Super Admin role required' }
  }

  const updates: Record<string, number> = {}
  if (args.tipSurchargePercentage !== undefined) {
    if (args.tipSurchargePercentage < 0 || args.tipSurchargePercentage > 50) {
      return { success: false, updated: 0, error: 'Tip surcharge must be between 0 and 50' }
    }
    updates.tip_surcharge_percentage = args.tipSurchargePercentage
  }
  if (args.dualPricingPercentage !== undefined) {
    if (args.dualPricingPercentage < 0 || args.dualPricingPercentage > 50) {
      return { success: false, updated: 0, error: 'Dual pricing percentage must be between 0 and 50' }
    }
    updates.dual_pricing_percentage = args.dualPricingPercentage
  }
  if (Object.keys(updates).length === 0) {
    return { success: false, updated: 0, error: 'No fields to update' }
  }

  const supabase = createServiceRoleClient()
  const { data: locations, error: readErr } = await supabase
    .from('locations')
    .select('id, tip_surcharge_percentage, dual_pricing_percentage')
    .eq('merchant_id', args.merchantId)
  if (readErr || !locations) {
    return { success: false, updated: 0, error: readErr?.message || 'No locations' }
  }

  const { error: updateErr } = await supabase
    .from('locations')
    .update(updates)
    .eq('merchant_id', args.merchantId)
  if (updateErr) {
    return { success: false, updated: 0, error: updateErr.message }
  }

  const { data: merchant } = await supabase
    .from('merchants')
    .select('clerk_org_id')
    .eq('id', args.merchantId)
    .single()
  const clerkOrgId = (merchant as { clerk_org_id?: string } | null)?.clerk_org_id
  if (clerkOrgId) {
    const bulkOperationId = crypto.randomUUID()
    for (const loc of locations) {
      const l = loc as { id: string; tip_surcharge_percentage: number | null; dual_pricing_percentage: number | null }
      await LogAuditEvent({
        clerkOrgId,
        locationId: l.id,
        action: 'bulk_updated_platform_fee_config',
        actionCategory: 'settings',
        severity: 'info',
        resourceType: 'location',
        resourceId: l.id,
        changes: {
          before: {
            tip_surcharge_percentage: l.tip_surcharge_percentage,
            dual_pricing_percentage: l.dual_pricing_percentage,
          },
          after: updates,
        },
        metadata: { bulk_operation_id: bulkOperationId },
      })
    }
  }

  return { success: true, updated: locations.length }
}
