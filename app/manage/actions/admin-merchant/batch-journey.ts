'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { relatedDeposits, relatedProcessorBatches } from '@/lib/admin/batch-journey-links'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROW_LIMIT = 1000

export interface BatchJourney {
  batch: {
    id: string; batch_id: string; batch_number: string | null; acquirer: string | null
    status: string; origin: string | null; business_date: string; opened_at: string
    closed_at: string | null; settlement_date: string | null; funded_date: string | null
    transaction_count: number; gross_amount: number; tip_amount: number
    refund_amount: number; net_deposit: number; payment_terminal_id: string | null
    location_id: string | null
  }
  terminal: { terminal_name: string; serial_number: string | null } | null
  locationName: string | null
  payments: Array<{
    id: string; order_id: string; total_amount: number | null; status: string | null
    payment_method: string | null; captured_at: string | null; initiated_at: string | null
    orders: { order_number: string | null; display_number: string | null } | null
  }>
  paymentsTotal: number
  transactions: Array<{
    id: string; mid: string; batch_id: string; deposit_id: string | null
    reconciled_payment_id: string; amount_dollars: number; terminal_id: string | null
    original_transaction_date: string; authorization_number: string
  }>
  processorBatches: Array<{
    id: string; mid: string; batch_date: string | null; statement_date: string | null
    transactions_count: number; batched_amount: number; net_deposit: number
    deposit_id: string | null; matchedTransactions: number
  }>
  deposits: Array<{
    id: string; mid: string; deposit_date: string; reference_number: string | null
    batch_total: number; daily_fees: number; net_deposit: number
    matchedTransactions: number
  }>
  audit: Array<{
    id: string; action: string; actor_name: string | null; created_at: string
    status: string | null; metadata: Record<string, unknown> | null
  }>
  attempts: Array<{
    id: string; phase: string; outcome: string; origin: string | null
    initiated_by: string | null; created_at: string
  }>
  warnings: string[]
  unavailable: { payments: boolean; processor: boolean; processorBatches: boolean; deposits: boolean; audit: boolean; attempts: boolean }
}

/** Reads only explicit ledger links. Neither batch number nor amount is an identity key. */
export async function getMerchantBatchJourney(merchantId: string, batchId: string): Promise<BatchJourney | null> {
  await assertHQPermission('hq.merchant.transactions')
  if (!UUID.test(merchantId) || !UUID.test(batchId)) return null

  const db = createServiceRoleClient()
  const { data: rawBatch, error: batchError } = await db.from('settlement_batches')
    .select('id, batch_id, batch_number, acquirer, status, origin, business_date, opened_at, closed_at, settlement_date, funded_date, transaction_count, gross_amount, tip_amount, refund_amount, net_deposit, payment_terminal_id, location_id')
    .eq('merchant_id', merchantId).eq('id', batchId).maybeSingle()
  if (batchError) throw new Error('Batch details unavailable')
  if (!rawBatch) return null
  const batch = rawBatch as BatchJourney['batch']
  const warnings: string[] = []

  const [paymentRes, terminalRes, locationRes, auditRes, attemptRes] = await Promise.all([
    db.from('order_payments')
      .select('id, order_id, total_amount, status, payment_method, captured_at, initiated_at, orders!inner(order_number, display_number, merchant_id)', { count: 'exact' })
      .eq('settlement_batch_id', batchId).eq('orders.merchant_id', merchantId)
      .order('initiated_at', { ascending: false }).range(0, ROW_LIMIT - 1),
    batch.payment_terminal_id
      ? db.from('payment_terminals').select('terminal_name, serial_number')
        .eq('id', batch.payment_terminal_id).eq('merchant_id', merchantId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    batch.location_id
      ? db.from('locations').select('name').eq('id', batch.location_id)
        .eq('merchant_id', merchantId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from('audit_logs').select('id, action, actor_name, created_at, status, metadata', { count: 'exact' })
      .eq('merchant_id', merchantId).eq('resource_type', 'settlement_batch').eq('resource_id', batchId)
      .order('created_at', { ascending: false }).range(0, 99),
    db.from('settlement_attempts').select('id, phase, outcome, origin, initiated_by, created_at', { count: 'exact' })
      .eq('merchant_id', merchantId).eq('settlement_batch_id', batchId)
      .order('created_at', { ascending: false }).range(0, 99),
  ])

  if (paymentRes.error) warnings.push('POS payment lookup unavailable; processor links were not checked.')
  if (terminalRes.error) warnings.push('Linked terminal details unavailable.')
  if (locationRes.error) warnings.push('Location details unavailable.')
  if (auditRes.error) warnings.push('Audit activity unavailable.')
  if (attemptRes.error) warnings.push('Settlement attempts unavailable.')
  if (auditRes.count != null && auditRes.count > 100) warnings.push('Only the latest 100 audit events are shown.')
  if (attemptRes.count != null && attemptRes.count > 100) warnings.push('Only the latest 100 settlement attempts are shown.')

  const payments = paymentRes.error ? [] : (paymentRes.data ?? []) as unknown as BatchJourney['payments']
  const paymentsTotal = paymentRes.count ?? payments.length
  if (paymentsTotal > payments.length) warnings.push(`Only ${payments.length} of ${paymentsTotal} explicitly linked POS payments are shown; processor evidence may be incomplete.`)

  let transactions: BatchJourney['transactions'] = []
  let processorUnavailable = false
  if (!paymentRes.error && payments.length) {
    const ids = payments.map((payment) => payment.id)
    // Keep each PostgREST URL bounded for batches with many payments.
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error, count } = await db.from('luqra_transactions')
        .select('id, mid, batch_id, deposit_id, reconciled_payment_id, amount_dollars, terminal_id, original_transaction_date, authorization_number', { count: 'exact' })
        .eq('merchant_id', merchantId).in('reconciled_payment_id', ids.slice(i, i + 100))
        .range(0, ROW_LIMIT - 1)
      if (error) {
        warnings.push('Processor transaction lookup unavailable; processor batches and deposits were not checked.')
        processorUnavailable = true
        transactions = []
        break
      }
      const rows = (data ?? []) as unknown as BatchJourney['transactions']
      transactions.push(...rows)
      if (count != null && count > rows.length) warnings.push('Processor transaction evidence is incomplete because the result limit was reached.')
    }
  }

  const batchKeys = [...new Set(transactions.map((txn) => txn.batch_id))]
  const { data: rawProcessorBatches, error: processorBatchError } = batchKeys.length
    ? await db.from('luqra_batches')
      .select('id, merchant_id, mid, batch_date, statement_date, transactions_count, batched_amount, net_deposit, deposit_id')
      .eq('merchant_id', merchantId).in('id', batchKeys)
    : { data: [], error: null }
  if (processorBatchError) warnings.push('Processor batch details unavailable.')
  const processorBatches = relatedProcessorBatches(
    (rawProcessorBatches ?? []) as unknown as BatchJourney['processorBatches'], transactions,
  )
    .map((row) => ({ ...row, matchedTransactions: transactions.filter((txn) => txn.batch_id === row.id && txn.mid === row.mid).length }))

  const depositIds = [...new Set([
    ...transactions.map((txn) => txn.deposit_id),
    ...processorBatches.map((row) => row.deposit_id),
  ].filter((id): id is string => !!id))]
  const { data: rawDeposits, error: depositError } = depositIds.length
    ? await db.from('luqra_deposits')
      .select('id, mid, deposit_date, reference_number, batch_total, daily_fees, net_deposit')
      .eq('merchant_id', merchantId).in('id', depositIds)
    : { data: [], error: null }
  if (depositError) warnings.push('Deposit details unavailable.')
  const deposits = relatedDeposits((rawDeposits ?? []) as unknown as BatchJourney['deposits'], transactions, processorBatches)
    .map((row) => ({ ...row, matchedTransactions: transactions.filter((txn) => txn.deposit_id === row.id && txn.mid === row.mid).length }))

  return {
    batch,
    terminal: terminalRes.data as BatchJourney['terminal'],
    locationName: (locationRes.data as { name: string } | null)?.name ?? null,
    payments, paymentsTotal, transactions, processorBatches, deposits,
    audit: (auditRes.data ?? []) as BatchJourney['audit'],
    attempts: (attemptRes.data ?? []) as BatchJourney['attempts'],
    warnings,
    unavailable: {
      payments: !!paymentRes.error,
      processor: processorUnavailable || !!paymentRes.error,
      processorBatches: !!processorBatchError || processorUnavailable || !!paymentRes.error,
      deposits: !!depositError || processorUnavailable || !!paymentRes.error,
      audit: !!auditRes.error,
      attempts: !!attemptRes.error,
    },
  }
}
