'use server'

// ============================================================================
// HQ Merchant Payments reader — raw order_payments rows for the Settlements
// "Payments" tab. Joins to settlement_batches and luqra_transactions so
// operators can see which batch each payment lives in and whether Luqra has
// reconciled it.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { assertHQPermission } from '@/lib/admin/auth'

export interface MerchantPaymentFilters {
    locationId?: string | null
    dateFrom?: string | null
    dateTo?: string | null
    status?: string | null
    batchId?: string | null
    unsettledOnly?: boolean
    unmatchedOnly?: boolean
    page?: number
    count?: number
}

export interface MerchantPaymentRow {
    id: string
    order_id: string
    order_number: string | null
    location_id: string | null
    location_name: string | null
    payment_method: string
    amount: number
    tip_amount: number
    total_amount: number
    status: string
    terminal_type: string
    terminal_id: string | null
    authorization_code: string | null
    card_type: string | null
    card_last_four: string | null
    batch_number: string | null
    dejavoo_batch_number: string | null
    acquirer: string | null
    settlement_batch_id: string | null
    settlement_batch_label: string | null
    is_settled: boolean
    settled_at: string | null
    captured_at: string | null
    initiated_at: string
    luqra_transaction_id: string | null
    luqra_batch_id: string | null
}

export async function getMerchantPayments(
    merchantId: string,
    filters: MerchantPaymentFilters = {}
) {
    try {
        await assertHQPermission('hq.merchant.transactions')
        const supabase = createServiceRoleClient()

        const page = filters.page ?? 1
        const count = Math.min(filters.count ?? 50, 200)
        const fromIdx = (page - 1) * count

        let q = supabase
            .from('order_payments')
            .select(
                `
                id, order_id, location_id, payment_method, amount, tip_amount, total_amount,
                status, terminal_type, terminal_id, authorization_code, card_type, card_last_four,
                batch_number, dejavoo_batch_number, acquirer, settlement_batch_id, is_settled, settled_at,
                captured_at, initiated_at,
                orders!inner(merchant_id, order_number),
                location:locations(id, name),
                settlement_batch:settlement_batches(id, batch_id, business_date, status),
                luqra_match:luqra_transactions!luqra_transactions_reconciled_payment_id_fkey(id, batch_id, mid)
              `,
                { count: 'exact' }
            )
            .eq('orders.merchant_id', merchantId)
            .order('captured_at', { ascending: false, nullsFirst: false })
            .range(fromIdx, fromIdx + count - 1)

        if (filters.locationId) q = q.eq('location_id', filters.locationId)
        if (filters.status) q = q.eq('status', filters.status)
        if (filters.unsettledOnly) q = q.eq('is_settled', false)
        if (filters.dateFrom) q = q.gte('initiated_at', `${filters.dateFrom}T00:00:00Z`)
        if (filters.dateTo) q = q.lte('initiated_at', `${filters.dateTo}T23:59:59Z`)
        if (filters.batchId) {
            q = q.or(
                `batch_number.eq.${filters.batchId},dejavoo_batch_number.eq.${filters.batchId}`
            )
        }

        const { data, error, count: total } = await q
        if (error) {
            return { success: false as const, error: error.message, data: null }
        }

        const rows: MerchantPaymentRow[] = (data ?? []).map((r) => {
            const row = r as Record<string, unknown>
            const orders = row.orders as { order_number: string | null } | null
            const loc = row.location as { id: string; name: string } | null
            const sb = row.settlement_batch as
                | { id: string; batch_id: string; business_date: string | null; status: string }
                | null
            const lmRaw = row.luqra_match as
                | { id: string; batch_id: string; mid: string }
                | { id: string; batch_id: string; mid: string }[]
                | null
                | undefined
            const lm = Array.isArray(lmRaw) ? lmRaw[0] ?? null : lmRaw ?? null

            return {
                id: row.id as string,
                order_id: row.order_id as string,
                order_number: orders?.order_number ?? null,
                location_id: (row.location_id as string) ?? null,
                location_name: loc?.name ?? null,
                payment_method: row.payment_method as string,
                amount: Number(row.amount ?? 0),
                tip_amount: Number(row.tip_amount ?? 0),
                total_amount: Number(row.total_amount ?? 0),
                status: row.status as string,
                terminal_type: row.terminal_type as string,
                terminal_id: (row.terminal_id as string) ?? null,
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
            }
        })

        const filtered = filters.unmatchedOnly
            ? rows.filter((r) => !r.luqra_transaction_id)
            : rows

        const totals = {
            count: total ?? rows.length,
            grossSum: rows.reduce((s, r) => s + r.total_amount, 0),
            settledCount: rows.filter((r) => r.is_settled).length,
            unmatchedCount: rows.filter((r) => !r.luqra_transaction_id).length,
        }

        return {
            success: true as const,
            error: null,
            data: { rows: filtered, total: total ?? filtered.length, totals },
        }
    } catch (err) {
        console.error('[getMerchantPayments] Error:', err)
        return {
            success: false as const,
            error: err instanceof Error ? err.message : 'Failed',
            data: null,
        }
    }
}
