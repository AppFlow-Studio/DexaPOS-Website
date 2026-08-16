'use server'

// ============================================================================
// Payment Device Detail (by serial) — HQ admin
// One bundled read for the /manage/.../devices/[serial] page: identity +
// connection + config, settlement batches, linked payments, settlement
// attempts, Valor webhook events, and the terminal activity/audit trail.
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { normalizeSerial } from '@/app/dashboard/settings/stations/utils/terminal-helpers'

export interface DeviceIdentity {
  id: string
  merchant_id: string
  location_id: string
  location_name: string | null
  station_id: string | null
  station_name: string | null
  terminal_name: string
  terminal_type: string
  terminal_model: string | null
  serial_number: string | null
  is_active: boolean
  is_connected: boolean
  connection_state: 'online' | 'offline' | 'stale' | 'unknown'
  last_connection_test_at: string | null
  last_connection_status: string | null
  last_transaction_at: string | null
  last_batch_at: string | null
  open_batch_count: number | null
  consecutive_failures: number | null
  auto_settle: boolean
  settle_time: string | null
  valor_epi: string | null
  created_at: string
  updated_at: string
}

export interface DeviceBatch {
  id: string
  batch_id: string
  batch_number: string | null
  acquirer: string | null
  status: string
  origin: string | null
  processor: string | null
  business_date: string | null
  opened_at: string | null
  closed_at: string | null
  settlement_date: string | null
  funded_date: string | null
  last_attempt_at: string | null
  retry_count: number | null
  transaction_count: number | null
  sales_count: number | null
  refund_count: number | null
  void_count: number | null
  gross_amount: number | null
  tip_amount: number | null
  refund_amount: number | null
  interchange_fees: number | null
  assessment_fees: number | null
  processor_fees: number | null
  net_deposit: number | null
  failure_reason: string | null
  created_at: string
  // Computed: payments on THIS terminal linked to this batch (settlement_batch_id)
  linked_payment_count: number
  linked_payment_amount: number
  // gross_amount − linked_payment_amount, only meaningful once finalized
  discrepancy_amount: number | null
  has_discrepancy: boolean
}

export interface DevicePayment {
  id: string
  order_id: string | null
  amount: number | null
  tip_amount: number | null
  total_amount: number | null
  status: string | null
  payment_method: string | null
  card_type: string | null
  card_last_four: string | null
  is_settled: boolean | null
  settled_at: string | null
  batch_number: string | null
  settlement_batch_id: string | null
  captured_at: string | null
  initiated_at: string | null
}

// Captured-but-unsettled money still sitting on this terminal — the number that
// silently disappears when a terminal is deactivated/swapped.
export interface DeviceUnsettledSummary {
  count: number
  total: number
  tip_total: number
  oldest_captured_at: string | null
  needs_review_batches: number
  open_batches: number
  truncated: boolean // true if the 100-row payment window may have clipped older rows
}

export interface DeviceAttempt {
  id: string
  phase: string
  outcome: string
  origin: string | null
  detail: string | null
  settlement_batch_id: string | null
  initiated_by: string | null
  created_at: string
}

export interface DeviceWebhookEvent {
  id: string
  received_at: string
  epi_id: string | null
  batch_no: string | null
  verified: boolean
  outcome: string
  http_status: number | null
  latency_ms: number | null
  settlement_batch_id: string | null
  detail: string | null
  raw_payload: Record<string, unknown> | null
}

export interface DeviceAuditEntry {
  id: string
  action: string
  action_category: string | null
  severity: string | null
  status: string | null
  actor_role: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

export interface PaymentDeviceDetail {
  device: DeviceIdentity
  siblings: number // other terminals sharing this serial for the merchant
  unsettled: DeviceUnsettledSummary
  batches: DeviceBatch[]
  payments: DevicePayment[]
  attempts: DeviceAttempt[]
  webhookEvents: DeviceWebhookEvent[]
  audit: DeviceAuditEntry[]
}

function deriveConnectionState(t: {
  last_connection_test_at: string | null
  is_connected: boolean
}): DeviceIdentity['connection_state'] {
  if (!t.last_connection_test_at) return 'unknown'
  const ageMin = (Date.now() - new Date(t.last_connection_test_at).getTime()) / 60000
  if (ageMin > 10) return 'stale'
  return t.is_connected ? 'online' : 'offline'
}

/**
 * Bundled detail for one physical device (resolved by serial within a merchant).
 * Returns { success, data } or { success:false, error }.
 */
export async function getPaymentDeviceDetail(merchantId: string, serial: string) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()
    const normSerial = normalizeSerial(serial)

    if (!normSerial) {
      return { success: false, error: 'Missing serial', data: null }
    }

    // Resolve the device (serial is unique per location; a merchant could in
    // theory have the same serial at two locations — prefer active/most-recent).
    const { data: terminals, error: tErr } = await supabase
      .from('payment_terminals')
      .select(`*, locations:location_id ( id, name ), stations:station_id ( id, station_name )`)
      .eq('merchant_id', merchantId)
      .eq('serial_number', normSerial)
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false })

    if (tErr) {
      console.error('[getPaymentDeviceDetail] terminal error:', tErr)
      return { success: false, error: tErr.message, data: null }
    }
    if (!terminals || terminals.length === 0) {
      return { success: false, error: 'Device not found', data: null }
    }

    const t = terminals[0] as Record<string, any>
    const terminalId = t.id as string
    const epi = (t.valor_epi as string | null) ?? null

    const device: DeviceIdentity = {
      id: terminalId,
      merchant_id: t.merchant_id,
      location_id: t.location_id,
      location_name: t.locations?.name ?? null,
      station_id: t.station_id ?? null,
      station_name: t.stations?.station_name ?? null,
      terminal_name: t.terminal_name,
      terminal_type: t.terminal_type,
      terminal_model: t.terminal_model ?? null,
      serial_number: t.serial_number ?? null,
      is_active: !!t.is_active,
      is_connected: !!t.is_connected,
      connection_state: deriveConnectionState(t as any),
      last_connection_test_at: t.last_connection_test_at ?? null,
      last_connection_status: t.last_connection_status ?? null,
      last_transaction_at: t.last_transaction_at ?? null,
      last_batch_at: t.last_batch_at ?? null,
      open_batch_count: t.open_batch_count ?? null,
      consecutive_failures: t.consecutive_failures ?? null,
      auto_settle: !!t.auto_settle,
      settle_time: t.settle_time ?? null,
      valor_epi: epi,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }

    // Fan out the section queries in parallel.
    const [batchesRes, paymentsRes, attemptsRes, eventsRes, auditRes] = await Promise.all([
      supabase
        .from('settlement_batches')
        .select(
          'id, batch_id, batch_number, acquirer, status, origin, processor, business_date, opened_at, closed_at, settlement_date, funded_date, last_attempt_at, retry_count, transaction_count, sales_count, refund_count, void_count, gross_amount, tip_amount, refund_amount, interchange_fees, assessment_fees, processor_fees, net_deposit, failure_reason, created_at',
        )
        .eq('payment_terminal_id', terminalId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('order_payments')
        .select(
          'id, order_id, amount, tip_amount, total_amount, status, payment_method, card_type, card_last_four, is_settled, settled_at, batch_number, settlement_batch_id, captured_at, initiated_at',
        )
        .eq('terminal_id', terminalId)
        .order('captured_at', { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from('settlement_attempts')
        .select('id, phase, outcome, origin, detail, settlement_batch_id, initiated_by, created_at')
        .eq('payment_terminal_id', terminalId)
        .order('created_at', { ascending: false })
        .limit(100),
      (epi
        ? supabase
            .from('valor_webhook_events')
            .select(
              'id, received_at, epi_id, batch_no, verified, outcome, http_status, latency_ms, settlement_batch_id, detail, raw_payload',
            )
            .or(`payment_terminal_id.eq.${terminalId},epi_id.eq.${epi}`)
            .order('received_at', { ascending: false })
            .limit(100)
        : supabase
            .from('valor_webhook_events')
            .select(
              'id, received_at, epi_id, batch_no, verified, outcome, http_status, latency_ms, settlement_batch_id, detail, raw_payload',
            )
            .eq('payment_terminal_id', terminalId)
            .order('received_at', { ascending: false })
            .limit(100)),
      supabase
        .from('audit_logs')
        .select('id, action, action_category, severity, status, actor_role, created_at, metadata')
        .eq('resource_type', 'payment_terminal')
        .eq('resource_id', terminalId)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    const num = (v: unknown) => (v == null ? null : Number(v))

    const payments: DevicePayment[] = (paymentsRes.data || []).map((p: Record<string, any>) => ({
      ...p,
      amount: num(p.amount),
      tip_amount: num(p.tip_amount),
      total_amount: num(p.total_amount),
    })) as DevicePayment[]

    // Associate each payment to exactly one batch the way /settlements does: the
    // reconciliation RPC joins on order_payments.batch_number, so a payment whose
    // settlement_batch_id was never backfilled still links via its host batch
    // number. Prefer an explicit settlement_batch_id link; otherwise fall back to
    // the most-recent batch carrying the same batch_number.
    const rawBatches = (batchesRes.data || []) as Record<string, any>[]
    const batchIdSet = new Set(rawBatches.map((b) => b.id as string))
    const latestBatchIdByNumber = new Map<string, string>()
    for (const b of rawBatches) {
      const bn = b.batch_number != null ? String(b.batch_number) : null
      if (bn && !latestBatchIdByNumber.has(bn)) latestBatchIdByNumber.set(bn, b.id)
    }
    const resolveBatchId = (p: DevicePayment): string | null => {
      if (p.settlement_batch_id && batchIdSet.has(p.settlement_batch_id)) return p.settlement_batch_id
      if (p.batch_number != null && latestBatchIdByNumber.has(String(p.batch_number))) {
        return latestBatchIdByNumber.get(String(p.batch_number)) ?? null
      }
      return null
    }

    const linkedByBatch = new Map<string, { count: number; total: number }>()
    for (const p of payments) {
      const bid = resolveBatchId(p)
      if (!bid) continue
      const acc = linkedByBatch.get(bid) || { count: 0, total: 0 }
      acc.count += 1
      acc.total += p.total_amount ?? p.amount ?? 0
      linkedByBatch.set(bid, acc)
    }

    // A batch is "finalized" once its host totals are authoritative — only then
    // is a gross-vs-linked gap a real discrepancy (open batches are still filling).
    const FINALIZED = new Set(['closed', 'settled', 'submitted', 'funded'])

    const batches: DeviceBatch[] = rawBatches.map((b: Record<string, any>) => {
      const linked = linkedByBatch.get(b.id) || { count: 0, total: 0 }
      const gross = num(b.gross_amount)
      const finalized = FINALIZED.has(String(b.status || '').toLowerCase())
      const discrepancy =
        finalized && gross != null ? Math.round((gross - linked.total) * 100) / 100 : null
      return {
        ...b,
        gross_amount: gross,
        tip_amount: num(b.tip_amount),
        refund_amount: num(b.refund_amount),
        interchange_fees: num(b.interchange_fees),
        assessment_fees: num(b.assessment_fees),
        processor_fees: num(b.processor_fees),
        net_deposit: num(b.net_deposit),
        transaction_count: num(b.transaction_count),
        sales_count: num(b.sales_count),
        refund_count: num(b.refund_count),
        void_count: num(b.void_count),
        retry_count: num(b.retry_count),
        linked_payment_count: linked.count,
        linked_payment_amount: Math.round(linked.total * 100) / 100,
        discrepancy_amount: discrepancy,
        has_discrepancy: discrepancy != null && Math.abs(discrepancy) >= 0.01,
      }
    }) as DeviceBatch[]

    // Captured-but-unsettled money still on this terminal.
    const DEAD = new Set(['voided', 'failed', 'refunded', 'declined', 'cancelled', 'reversed', 'error'])
    const unsettledPayments = payments.filter(
      (p) => !p.is_settled && !!p.captured_at && !DEAD.has(String(p.status || '').toLowerCase()),
    )
    const unsettled: DeviceUnsettledSummary = {
      count: unsettledPayments.length,
      total: Math.round(unsettledPayments.reduce((s, p) => s + (p.total_amount ?? p.amount ?? 0), 0) * 100) / 100,
      tip_total: Math.round(unsettledPayments.reduce((s, p) => s + (p.tip_amount ?? 0), 0) * 100) / 100,
      oldest_captured_at: unsettledPayments.reduce<string | null>(
        (min, p) => (p.captured_at && (!min || p.captured_at < min) ? p.captured_at : min),
        null,
      ),
      needs_review_batches: batches.filter((b) => String(b.status || '').toLowerCase() === 'needs_review').length,
      open_batches: batches.filter((b) => String(b.status || '').toLowerCase() === 'open').length,
      truncated: payments.length >= 100,
    }

    const data: PaymentDeviceDetail = {
      device,
      siblings: terminals.length - 1,
      unsettled,
      batches,
      payments,
      attempts: (attemptsRes.data || []) as DeviceAttempt[],
      webhookEvents: (eventsRes.data || []) as DeviceWebhookEvent[],
      audit: (auditRes.data || []) as DeviceAuditEntry[],
    }

    return { success: true, data, error: null }
  } catch (error) {
    console.error('[getPaymentDeviceDetail] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}
