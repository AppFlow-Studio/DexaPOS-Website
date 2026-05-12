'use server'

// ============================================================================
// HQ Platform Payments — flat order_payments ledger across all merchants in
// scope, joined to settlement_batches + luqra_transactions for the
// "Payments" tab on /manage/transactions.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { assertHQPermission } from '@/lib/admin/auth'
import { getAssignedMerchantScope, applyMerchantScope } from './shared'

export interface PlatformPaymentFilters {
    merchantIds?: string[] | null
    locationIds?: string[] | null
    dateFrom?: string | null
    dateTo?: string | null
    statuses?: string[] | null
    paymentMethods?: string[] | null
    cardTypes?: string[] | null
    batchId?: string | null
    minAmount?: number | null
    maxAmount?: number | null
    search?: string | null
    unsettledOnly?: boolean
    unmatchedOnly?: boolean
    page?: number
    count?: number
}

export interface PlatformPaymentRow {
    id: string
    order_id: string
    order_number: string | null
    merchant_id: string
    merchant_name: string | null
    location_id: string | null
    location_name: string | null
    payment_method: string
    amount: number
    tip_amount: number
    total_amount: number
    status: string
    terminal_type: string
    terminal_id: string | null
    processor_name: string | null
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
    luqra_mid: string | null
}

export async function getPlatformPayments(filters: PlatformPaymentFilters = {}) {
    try {
        const { userId, role } = await assertHQPermission('hq.merchant.transactions')
        const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
        const scopedMerchantIds = await applyMerchantScope(filters.merchantIds ?? undefined, merchantScope)

        if (scopedMerchantIds !== undefined && scopedMerchantIds.length === 0) {
            return {
                success: true as const,
                error: null,
                data: { rows: [], total: 0, totals: { count: 0, grossSum: 0, settledCount: 0, unmatchedCount: 0 } },
            }
        }

        const supabase = createServiceRoleClient()

        const page = filters.page ?? 1
        const count = Math.min(filters.count ?? 50, 200)
        const fromIdx = (page - 1) * count

        let q = supabase
            .from('order_payments')
            .select(
                `
                id, order_id, merchant_id, location_id, payment_method, amount, tip_amount, total_amount,
                status, terminal_type, terminal_id, processor_name, authorization_code, card_type, card_last_four,
                batch_number, dejavoo_batch_number, acquirer, settlement_batch_id, is_settled, settled_at,
                captured_at, initiated_at,
                orders!inner(id, order_number, merchant_id),
                merchant:merchants(id, name),
                location:locations(id, name, luqra_mid),
                settlement_batch:settlement_batches(id, batch_id, business_date, status),
                luqra_match:luqra_transactions!luqra_transactions_reconciled_payment_id_fkey(id, batch_id, mid)
              `,
                { count: 'exact' }
            )
            .order('captured_at', { ascending: false, nullsFirst: false })
            .range(fromIdx, fromIdx + count - 1)

        if (scopedMerchantIds && scopedMerchantIds.length > 0) {
            q = q.in('orders.merchant_id', scopedMerchantIds)
        }
        if (filters.locationIds && filters.locationIds.length > 0) {
            q = q.in('location_id', filters.locationIds)
        }
        if (filters.statuses && filters.statuses.length > 0) {
            q = q.in('status', filters.statuses)
        }
        if (filters.paymentMethods && filters.paymentMethods.length > 0) {
            q = q.in('payment_method', filters.paymentMethods)
        }
        if (filters.cardTypes && filters.cardTypes.length > 0) {
            q = q.in('card_type', filters.cardTypes)
        }
        if (filters.unsettledOnly) q = q.eq('is_settled', false)
        if (filters.dateFrom) q = q.gte('initiated_at', `${filters.dateFrom}T00:00:00Z`)
        if (filters.dateTo) q = q.lte('initiated_at', `${filters.dateTo}T23:59:59Z`)
        if (filters.minAmount != null) q = q.gte('total_amount', filters.minAmount)
        if (filters.maxAmount != null) q = q.lte('total_amount', filters.maxAmount)
        if (filters.batchId) {
            q = q.or(
                `batch_number.eq.${filters.batchId},dejavoo_batch_number.eq.${filters.batchId}`
            )
        }
        if (filters.search && filters.search.trim().length >= 2) {
            const s = filters.search.trim()
            q = q.or(
                `authorization_code.ilike.%${s}%,reference_number.ilike.%${s}%,card_last_four.ilike.%${s}%`
            )
        }

        const { data, error, count: total } = await q
        if (error) {
            return { success: false as const, error: error.message, data: null }
        }

        const rows: PlatformPaymentRow[] = (data ?? []).map((r) => {
            const row = r as Record<string, unknown>
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
                total_amount: Number(row.total_amount ?? 0),
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
            }
        })

        const filtered = filters.unmatchedOnly ? rows.filter((r) => !r.luqra_transaction_id) : rows

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
        console.error('[getPlatformPayments] Error:', err)
        return {
            success: false as const,
            error: err instanceof Error ? err.message : 'Failed',
            data: null,
        }
    }
}

// ----------------------------------------------------------------------------
// Connectivity status — most recent Luqra sync + processor terminal counts.
// ----------------------------------------------------------------------------

export interface ConnectivityStatus {
    luqra: {
        lastFinishedAt: string | null
        lastStatus: 'ok' | 'error' | 'unknown'
        lastErrorCode: string | null
        runsLast24h: number
        midsConfigured: number
    }
    processor: {
        terminalsLast24h: number
        terminalTypes: { type: string; count: number }[]
    }
}

export async function getConnectivityStatus(merchantIds?: string[] | null): Promise<ConnectivityStatus> {
    try {
        const { userId, role } = await assertHQPermission('hq.merchant.transactions')
        const merchantScope = await getAssignedMerchantScope(userId, role?.role_code)
        const scopedMerchantIds = await applyMerchantScope(merchantIds ?? undefined, merchantScope)

        const supabase = createServiceRoleClient()
        const since24h = new Date(Date.now() - 24 * 3600e3).toISOString()

        // Luqra: most recent run.
        let runQ = supabase
            .from('luqra_sync_runs')
            .select('finished_at, status, error_code')
            .order('finished_at', { ascending: false })
            .limit(1)
        if (scopedMerchantIds && scopedMerchantIds.length > 0) {
            runQ = runQ.in('merchant_id', scopedMerchantIds)
        }
        const { data: lastRun } = await runQ

        let runs24Q = supabase
            .from('luqra_sync_runs')
            .select('id', { count: 'exact', head: true })
            .gte('finished_at', since24h)
        if (scopedMerchantIds && scopedMerchantIds.length > 0) {
            runs24Q = runs24Q.in('merchant_id', scopedMerchantIds)
        }
        const { count: runsLast24h } = await runs24Q

        let midQ = supabase
            .from('locations')
            .select('id', { count: 'exact', head: true })
            .not('luqra_mid', 'is', null)
        if (scopedMerchantIds && scopedMerchantIds.length > 0) {
            midQ = midQ.in('merchant_id', scopedMerchantIds)
        }
        const { count: midsConfigured } = await midQ

        // Processor: distinct terminals seen in last 24 h.
        let termQ = supabase
            .from('order_payments')
            .select('terminal_type, terminal_id, orders!inner(merchant_id)')
            .gte('initiated_at', since24h)
            .not('terminal_id', 'is', null)
        if (scopedMerchantIds && scopedMerchantIds.length > 0) {
            termQ = termQ.in('orders.merchant_id', scopedMerchantIds)
        }
        const { data: termRows } = await termQ
        const termSet = new Set<string>()
        const typeCounts = new Map<string, Set<string>>()
        for (const r of termRows ?? []) {
            const t = (r.terminal_type as string) || 'unknown'
            const id = r.terminal_id as string | null
            if (!id) continue
            termSet.add(`${t}::${id}`)
            const set = typeCounts.get(t) ?? new Set<string>()
            set.add(id)
            typeCounts.set(t, set)
        }

        const last = (lastRun ?? [])[0]
        return {
            luqra: {
                lastFinishedAt: (last?.finished_at as string) ?? null,
                lastStatus: (last?.status as 'ok' | 'error') ?? 'unknown',
                lastErrorCode: (last?.error_code as string) ?? null,
                runsLast24h: runsLast24h ?? 0,
                midsConfigured: midsConfigured ?? 0,
            },
            processor: {
                terminalsLast24h: termSet.size,
                terminalTypes: Array.from(typeCounts.entries())
                    .map(([type, set]) => ({ type, count: set.size }))
                    .sort((a, b) => b.count - a.count),
            },
        }
    } catch (err) {
        console.error('[getConnectivityStatus] Error:', err)
        return {
            luqra: { lastFinishedAt: null, lastStatus: 'unknown', lastErrorCode: null, runsLast24h: 0, midsConfigured: 0 },
            processor: { terminalsLast24h: 0, terminalTypes: [] },
        }
    }
}
