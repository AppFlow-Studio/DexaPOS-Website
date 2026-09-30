import 'server-only'

// ============================================================================
// One order_payments row as the HQ ledger reads it: fees, net deposit, host
// batch, settlement and TSYS match. Shared by the payment detail page
// (payments.ts) and the settlement columns of the All transactions ledger
// (transactions.ts). Not a server action module: nothing here checks
// permissions, so callers must have done so.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { PlatformPaymentRow } from './payments'

export const PAYMENT_SELECT = `
    id, order_id, merchant_id, location_id, payment_method, amount, tip_amount, total_amount,
    status, terminal_type, terminal_id, processor_name, authorization_code, card_type, card_last_four,
    batch_number, dejavoo_batch_number, acquirer, settlement_batch_id, is_settled, settled_at,
    captured_at, initiated_at,
    dual_pricing_fee, tip_fee, refunded_dual_pricing_fee, refunded_tip_fee,
    orders!inner(id, order_number, merchant_id),
    merchant:merchants(id, name),
    location:locations(id, name, luqra_mid),
    settlement_batch:settlement_batches(id, batch_id, business_date, status),
    luqra_match:luqra_transactions!luqra_transactions_reconciled_payment_id_fkey(id, batch_id, mid)
`

export function mapPaymentRow(row: Record<string, unknown>): PlatformPaymentRow {
    const orders = row.orders as { id: string; order_number: string | null; merchant_id: string } | null
    const merchant = row.merchant as { id: string; name: string } | null
    const loc = row.location as { id: string; name: string; luqra_mid: string | null } | null
    const sb = row.settlement_batch as { id: string; batch_id: string } | null
    const lmRaw = row.luqra_match as
        | { id: string; batch_id: string; mid: string }
        | { id: string; batch_id: string; mid: string }[]
        | null
        | undefined
    const lm = Array.isArray(lmRaw) ? lmRaw[0] ?? null : lmRaw ?? null

    const dualFee = Number(row.dual_pricing_fee ?? 0)
    const tipFee = Number(row.tip_fee ?? 0)
    const refundedDualFee = Number(row.refunded_dual_pricing_fee ?? 0)
    const refundedTipFee = Number(row.refunded_tip_fee ?? 0)
    const netFee = Math.max(0, dualFee - refundedDualFee) + Math.max(0, tipFee - refundedTipFee)
    const totalAmount = Number(row.total_amount ?? 0)

    return {
        id: row.id as string,
        order_id: row.order_id as string,
        order_number: orders?.order_number ?? null,
        merchant_id: (row.merchant_id as string) ?? orders?.merchant_id ?? '',
        merchant_name: merchant?.name ?? null,
        location_id: (row.location_id as string) ?? null,
        location_name: loc?.name ?? null,
        payment_method: row.payment_method as string,
        amount: Number(row.amount ?? 0),
        tip_amount: Number(row.tip_amount ?? 0),
        total_amount: totalAmount,
        status: row.status as string,
        terminal_type: row.terminal_type as string,
        terminal_id: (row.terminal_id as string) ?? null,
        processor_name: (row.processor_name as string) ?? null,
        authorization_code: (row.authorization_code as string) ?? null,
        card_type: (row.card_type as string) ?? null,
        card_last_four: (row.card_last_four as string) ?? null,
        batch_number: (row.batch_number as string) ?? null,
        dejavoo_batch_number: (row.dejavoo_batch_number as string) ?? null,
        acquirer: (row.acquirer as string) ?? null,
        settlement_batch_id: (row.settlement_batch_id as string) ?? null,
        settlement_batch_label: sb?.batch_id ?? null,
        is_settled: !!row.is_settled,
        settled_at: (row.settled_at as string) ?? null,
        captured_at: (row.captured_at as string) ?? null,
        initiated_at: row.initiated_at as string,
        luqra_transaction_id: lm?.id ?? null,
        luqra_batch_id: lm?.batch_id ?? null,
        luqra_mid: loc?.luqra_mid ?? lm?.mid ?? null,
        dual_pricing_fee: dualFee,
        tip_fee: tipFee,
        refunded_dual_pricing_fee: refundedDualFee,
        refunded_tip_fee: refundedTipFee,
        net_fee: netFee,
        net_deposit: totalAmount - netFee,
    }
}

/**
 * The ledger rows for a page of payment ids, keyed by id. A failed lookup
 * returns an empty map, so a list still renders without its settlement facts.
 */
export async function fetchPaymentRowsByIds(ids: string[]): Promise<Map<string, PlatformPaymentRow>> {
    const rows = new Map<string, PlatformPaymentRow>()
    if (ids.length === 0) return rows

    const { data, error } = await createServiceRoleClient().from('order_payments').select(PAYMENT_SELECT).in('id', ids)
    if (error) {
        console.error('[fetchPaymentRowsByIds] Error:', error)
        return rows
    }
    for (const raw of (data ?? []) as Record<string, unknown>[]) {
        const row = mapPaymentRow(raw)
        rows.set(row.id, row)
    }
    return rows
}
