'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type {
  AssignDevicePayload,
  AssignDeviceResult,
  AdminDeviceInventoryFilters,
  AdminDeviceInventoryRow,
  AdminDeviceSummaryRow,
  DeviceActivityItem,
  DeviceAssignmentRow,
  DeviceConfigHistoryRow,
  DeviceRegistryCommandResult,
  DeviceOverviewChartDatum,
  DeviceOverviewData,
  DeviceOverviewKpis,
  DeviceOverviewMerchantDatum,
  DeviceOverviewMonthlyDatum,
  DeviceRegistryLocationOption,
  DeviceRegistryMerchantOption,
  DeviceNoteRow,
} from '@/types/device-registry'

type ActionResult<T> = {
  success: boolean
  data: T | null
  error: string | null
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: '2-digit',
  }).format(date)
}

function buildOverviewKpis(rows: AdminDeviceInventoryRow[]): DeviceOverviewKpis {
  const today = startOfToday()
  const dayInMs = 24 * 60 * 60 * 1000

  return rows.reduce<DeviceOverviewKpis>(
    (accumulator, row) => {
      accumulator.total += 1

      if (row.status === 'deployed') accumulator.deployed += 1
      if (row.status === 'in_warehouse') accumulator.warehouse += 1
      if (['allocated', 'shipped', 'provisioning'].includes(row.status)) accumulator.inTransit += 1
      if (['in_repair', 'lost', 'rma'].includes(row.status)) accumulator.needsAttention += 1

      const isLinked =
        Boolean(row.linked_station_id) ||
        Boolean(row.linked_payment_terminal_id) ||
        Boolean(row.linked_printer_id)

      if (!isLinked) accumulator.unlinked += 1

      if (row.warranty_expires_at) {
        const expiryDate = new Date(row.warranty_expires_at)
        expiryDate.setHours(0, 0, 0, 0)
        const diffDays = Math.floor((expiryDate.getTime() - today.getTime()) / dayInMs)

        if (diffDays < 0) accumulator.expiredWarranty += 1
        if (diffDays >= 0 && diffDays <= 30) accumulator.warranty30 += 1
        if (diffDays >= 0 && diffDays <= 60) accumulator.warranty60 += 1
        if (diffDays >= 0 && diffDays <= 90) accumulator.warranty90 += 1
      }

      return accumulator
    },
    {
      total: 0,
      deployed: 0,
      warehouse: 0,
      inTransit: 0,
      needsAttention: 0,
      unlinked: 0,
      warranty30: 0,
      warranty60: 0,
      warranty90: 0,
      expiredWarranty: 0,
    }
  )
}

function buildStatusBreakdown(summary: AdminDeviceSummaryRow[]): DeviceOverviewChartDatum[] {
  const counts = new Map<string, number>()

  for (const row of summary) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + Number(row.device_count))
  }

  return Array.from(counts.entries())
    .map(([key, value]) => ({ key, label: key, value }))
    .sort((left, right) => right.value - left.value)
}

function buildCategoryBreakdown(summary: AdminDeviceSummaryRow[]): DeviceOverviewChartDatum[] {
  const counts = new Map<string, number>()

  for (const row of summary) {
    counts.set(row.device_category, (counts.get(row.device_category) ?? 0) + Number(row.device_count))
  }

  return Array.from(counts.entries())
    .map(([key, value]) => ({ key, label: key, value }))
    .sort((left, right) => right.value - left.value)
}

function buildMerchantBreakdown(rows: AdminDeviceInventoryRow[]): DeviceOverviewMerchantDatum[] {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const merchantName = row.merchant_name ?? 'DEXA HQ'
    counts.set(merchantName, (counts.get(merchantName) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([merchantName, value]) => ({ merchantName, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 8)
}

function buildRegistrationTrend(rows: AdminDeviceInventoryRow[]): DeviceOverviewMonthlyDatum[] {
  const now = new Date()
  const months: Date[] = []

  for (let offset = 5; offset >= 0; offset -= 1) {
    months.push(new Date(now.getFullYear(), now.getMonth() - offset, 1))
  }

  const counts = new Map<string, number>(months.map((date) => [monthKey(date), 0]))

  for (const row of rows) {
    const createdAt = new Date(row.created_at)
    const key = monthKey(new Date(createdAt.getFullYear(), createdAt.getMonth(), 1))
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  return months.map((date) => ({
    month: monthLabel(date),
    value: counts.get(monthKey(date)) ?? 0,
  }))
}

function formatAssignmentTitle(row: DeviceAssignmentRow) {
  return row.previous_status
    ? `${row.previous_status} -> ${row.new_status}`
    : `Moved to ${row.new_status}`
}

function toActivityFeed(
  assignments: DeviceAssignmentRow[],
  configHistory: DeviceConfigHistoryRow[],
  notes: DeviceNoteRow[]
): DeviceActivityItem[] {
  const assignmentItems: DeviceActivityItem[] = assignments.map((row) => ({
    id: row.id,
    type: 'assignment',
    occurred_at: row.assigned_at,
    title: formatAssignmentTitle(row),
    subtitle: row.reason,
    body: row.notes,
    actor: row.performed_by_name ?? row.performed_by,
    status: row.new_status,
    tracking_number: row.tracking_number,
  }))

  const configItems: DeviceActivityItem[] = configHistory.map((row) => ({
    id: row.id,
    type: 'config',
    occurred_at: row.created_at,
    title: row.change_type.replace(/_/g, ' '),
    subtitle:
      row.previous_value || row.new_value
        ? `${row.previous_value ?? 'N/A'} -> ${row.new_value ?? 'N/A'}`
        : null,
    body: row.notes,
    actor: row.performed_by_name ?? row.performed_by,
  }))

  const noteItems: DeviceActivityItem[] = notes.map((row) => ({
    id: row.id,
    type: 'note',
    occurred_at: row.created_at,
    title: `${row.note_type.replace(/_/g, ' ')} note`,
    subtitle: row.external_ticket_id ? `Ticket ${row.external_ticket_id}` : null,
    body: row.content,
    actor: row.created_by_name ?? row.created_by,
  }))

  return [...assignmentItems, ...configItems, ...noteItems].sort(
    (left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime()
  )
}

export async function getAdminDeviceInventory(
  filters?: AdminDeviceInventoryFilters
): Promise<ActionResult<AdminDeviceInventoryRow[]>> {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient() as any

    let query = supabase
      .from('admin_device_inventory')
      .select('*')
      .order('updated_at', { ascending: false })

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status)
    }

    if (filters?.category && filters.category !== 'all') {
      query = query.eq('device_category', filters.category)
    }

    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim()}%`
      query = query.or(
        [
          `serial_number.ilike.${term}`,
          `manufacturer.ilike.${term}`,
          `model_name.ilike.${term}`,
          `model_sku.ilike.${term}`,
          `merchant_name.ilike.${term}`,
          `location_name.ilike.${term}`,
        ].join(',')
      )
    }

    const { data, error } = await query

    if (error) {
      console.error('[getAdminDeviceInventory] Error:', error)
      return { success: false, data: null, error: error.message }
    }

    return { success: true, data: (data ?? []) as AdminDeviceInventoryRow[], error: null }
  } catch (error) {
    console.error('[getAdminDeviceInventory] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getAdminDeviceSummary(): Promise<ActionResult<AdminDeviceSummaryRow[]>> {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient() as any

    const { data, error } = await supabase
      .from('admin_device_summary')
      .select('*')
      .order('device_category')
      .order('manufacturer')
      .order('model_name')

    if (error) {
      console.error('[getAdminDeviceSummary] Error:', error)
      return { success: false, data: null, error: error.message }
    }

    return { success: true, data: (data ?? []) as AdminDeviceSummaryRow[], error: null }
  } catch (error) {
    console.error('[getAdminDeviceSummary] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getAdminDeviceOverview(): Promise<ActionResult<DeviceOverviewData>> {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient() as any

    const [inventoryResult, summaryResult] = await Promise.all([
      supabase
        .from('admin_device_inventory')
        .select('*'),
      supabase
        .from('admin_device_summary')
        .select('*'),
    ])

    const error = inventoryResult.error ?? summaryResult.error ?? null

    if (error) {
      console.error('[getAdminDeviceOverview] Error:', error)
      return { success: false, data: null, error: error.message }
    }

    const inventory = (inventoryResult.data ?? []) as AdminDeviceInventoryRow[]
    const summary = (summaryResult.data ?? []) as AdminDeviceSummaryRow[]

    return {
      success: true,
      data: {
        kpis: buildOverviewKpis(inventory),
        statusBreakdown: buildStatusBreakdown(summary),
        categoryBreakdown: buildCategoryBreakdown(summary),
        merchantBreakdown: buildMerchantBreakdown(inventory),
        registrationTrend: buildRegistrationTrend(inventory),
      },
      error: null,
    }
  } catch (error) {
    console.error('[getAdminDeviceOverview] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function searchAdminDeviceRegistry(
  query: string,
  limit: number = 8
): Promise<ActionResult<DeviceRegistryCommandResult[]>> {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient() as any
    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      return { success: true, data: [], error: null }
    }

    const searchLimit = Math.min(Math.max(limit, 1), 12)
    const term = `%${trimmedQuery}%`

    const { data, error } = await supabase
      .from('admin_device_inventory')
      .select(
        'id, serial_number, status, device_category, manufacturer, model_name, model_sku, merchant_name, location_name, updated_at'
      )
      .or(
        [
          `serial_number.ilike.${term}`,
          `manufacturer.ilike.${term}`,
          `model_name.ilike.${term}`,
          `model_sku.ilike.${term}`,
          `merchant_name.ilike.${term}`,
          `location_name.ilike.${term}`,
        ].join(',')
      )
      .order('updated_at', { ascending: false })
      .limit(searchLimit)

    if (error) {
      console.error('[searchAdminDeviceRegistry] Error:', error)
      return { success: false, data: null, error: error.message }
    }

    return {
      success: true,
      data: (data ?? []) as DeviceRegistryCommandResult[],
      error: null,
    }
  } catch (error) {
    console.error('[searchAdminDeviceRegistry] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getAdminDeviceDetail(
  deviceId: string
): Promise<ActionResult<AdminDeviceInventoryRow>> {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient() as any

    const { data, error } = await supabase
      .from('admin_device_inventory')
      .select('*')
      .eq('id', deviceId)
      .maybeSingle()

    if (error) {
      console.error('[getAdminDeviceDetail] Error:', error)
      return { success: false, data: null, error: error.message }
    }

    if (!data) {
      return { success: false, data: null, error: 'Device not found' }
    }

    return { success: true, data: data as AdminDeviceInventoryRow, error: null }
  } catch (error) {
    console.error('[getAdminDeviceDetail] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getAdminDeviceActivity(
  deviceId: string
): Promise<ActionResult<DeviceActivityItem[]>> {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient() as any

    const [assignmentsResult, configHistoryResult, notesResult] = await Promise.all([
      supabase
        .from('device_assignments')
        .select('*')
        .eq('device_id', deviceId)
        .order('assigned_at', { ascending: false }),
      supabase
        .from('device_config_history')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('device_notes')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false }),
    ])

    const error =
      assignmentsResult.error ?? configHistoryResult.error ?? notesResult.error ?? null

    if (error) {
      console.error('[getAdminDeviceActivity] Error:', error)
      return { success: false, data: null, error: error.message }
    }

    const feed = toActivityFeed(
      (assignmentsResult.data ?? []) as DeviceAssignmentRow[],
      (configHistoryResult.data ?? []) as DeviceConfigHistoryRow[],
      (notesResult.data ?? []) as DeviceNoteRow[]
    )

    return { success: true, data: feed, error: null }
  } catch (error) {
    console.error('[getAdminDeviceActivity] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getDeviceTransitionTargets(): Promise<
  ActionResult<{
    merchants: DeviceRegistryMerchantOption[]
    locations: DeviceRegistryLocationOption[]
  }>
> {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient() as any

    const [merchantsResult, locationsResult] = await Promise.all([
      supabase
        .from('merchants')
        .select('id, name')
        .order('name'),
      supabase
        .from('locations')
        .select('id, merchant_id, name')
        .order('name'),
    ])

    const error = merchantsResult.error ?? locationsResult.error ?? null

    if (error) {
      console.error('[getDeviceTransitionTargets] Error:', error)
      return { success: false, data: null, error: error.message }
    }

    return {
      success: true,
      data: {
        merchants: (merchantsResult.data ?? []) as DeviceRegistryMerchantOption[],
        locations: (locationsResult.data ?? []) as DeviceRegistryLocationOption[],
      },
      error: null,
    }
  } catch (error) {
    console.error('[getDeviceTransitionTargets] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function assignDeviceStatus(
  payload: AssignDevicePayload
): Promise<ActionResult<AssignDeviceResult>> {
  try {
    await assertHQPermission('system.config.manage')
    const supabase = createServerSupabaseClient() as any

    const { data, error } = await supabase.rpc('assign_device', {
      p_device_id: payload.deviceId,
      p_new_status: payload.newStatus,
      p_to_merchant_id: payload.toMerchantId ?? null,
      p_to_location_id: payload.toLocationId ?? null,
      p_tracking_number: payload.trackingNumber ?? null,
      p_reason: payload.reason ?? null,
      p_notes: payload.notes ?? null,
    })

    if (error) {
      console.error('[assignDeviceStatus] RPC error:', error)
      return { success: false, data: null, error: error.message }
    }

    const result = (data ?? null) as AssignDeviceResult | null

    if (!result?.success) {
      return {
        success: false,
        data: result,
        error: result?.error ?? 'Device status transition failed',
      }
    }

    return { success: true, data: result, error: null }
  } catch (error) {
    console.error('[assignDeviceStatus] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
