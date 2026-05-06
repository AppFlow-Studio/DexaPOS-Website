'use server'

// ============================================================================
// Luqra → Local Cache Sync
// Description: pulls /reports/transactions and /reports/chargebacks for each
// of a merchant's MIDs and upserts into luqra_transactions / luqra_chargebacks.
// Persists reconciliation matches so they survive future syncs.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { assertHQPermission } from '@/lib/admin/auth'
import {
    getLuqraBatches,
    getLuqraChargebacks,
    getLuqraDepositsDetails,
    getLuqraTransactions,
} from '@/lib/luqra/client'
import type {
    LuqraBatch,
    LuqraBatchesResponse,
    LuqraChargeback,
    LuqraChargebacksResponse,
    LuqraDepositDetail,
    LuqraDepositDetailsResponse,
    LuqraTransaction,
    LuqraTransactionsResponse,
} from '@/lib/luqra/types'

function trimLeadingZeros(s: string | null | undefined): string | null {
    if (!s) return null
    return s.replace(/^0+/, '') || '0'
}

// Larger pages = fewer round trips. Cap at 100 so a single mid×resource sync
// stays under a few seconds. If a date range exceeds this we paginate.
const PAGE_SIZE = 100
const MAX_PAGES = 25 // 25 × 100 = 2500 rows per (mid × resource × sync)

export interface LuqraSyncRange {
    /** YYYY-MM-DD inclusive. */
    dateFrom?: string
    /** YYYY-MM-DD inclusive. */
    dateTo?: string
}

export interface LuqraSyncResult {
    success: boolean
    error: string | null
    perMid: Record<
        string,
        {
            transactionsIngested: number
            transactionsUpdated: number
            transactionsReconciled: number
            chargebacksIngested: number
            chargebacksUpdated: number
            depositsIngested: number
            depositsUpdated: number
            depositsLinked: number
            batchesIngested: number
            batchesUpdated: number
            batchesLinkedToDeposits: number
            error?: string
        }
    >
}

interface MidTarget {
    locationId: string
    name: string
    mid: string
}

async function listMidTargets(
    merchantId: string,
    locationId?: string | null
): Promise<MidTarget[]> {
    const supabase = createServiceRoleClient()
    let q = supabase
        .from('locations')
        .select('id, name, luqra_mid')
        .eq('merchant_id', merchantId)
        .not('luqra_mid', 'is', null)
    if (locationId) q = q.eq('id', locationId)
    const { data, error } = await q
    if (error || !data) return []
    return data
        .filter((r) => !!r.luqra_mid)
        .map((r) => ({
            locationId: r.id as string,
            name: r.name as string,
            mid: r.luqra_mid as string,
        }))
}

// ----------------------------------------------------------------------------
// Transactions
// ----------------------------------------------------------------------------

async function syncTransactionsForMid(
    merchantId: string,
    target: MidTarget,
    range: LuqraSyncRange,
    maxRows?: number | null
) {
    const supabase = createServiceRoleClient()
    const runId = crypto.randomUUID()
    const startedAt = new Date().toISOString()

    let pagesFetched = 0
    let ingested = 0
    let updated = 0
    let reconciled = 0
    let firstError: string | undefined

    const pageSize = Math.min(maxRows ?? PAGE_SIZE, PAGE_SIZE)
    const pageCap = maxRows ? Math.max(1, Math.ceil(maxRows / pageSize)) : MAX_PAGES

    for (let page = 1; page <= pageCap; page++) {
        const res = await getLuqraTransactions({
            mid: target.mid,
            page,
            count: pageSize,
            orderBy: '-originalTransactionDate',
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
        })
        pagesFetched++
        if (res.error) {
            if (!firstError) firstError = res.error
            break
        }
        const payload = res.data as LuqraTransactionsResponse
        const rows: LuqraTransaction[] = payload?.data?.data ?? []
        if (rows.length === 0) break

        // Reconcile in-batch against local order_payments (auth + batch).
        const auths = Array.from(new Set(rows.map((r) => r.authorizationNumber).filter(Boolean)))
        const batchIds = Array.from(new Set(rows.map((r) => r.batchId).filter(Boolean)))

        const reconMap = new Map<string, { payment_id: string; order_id: string }>()
        if (auths.length && batchIds.length) {
            const { data: payments } = await supabase
                .from('order_payments')
                .select(
                    `
            id, order_id, authorization_code, batch_number, dejavoo_batch_number,
            orders!inner(merchant_id)
          `
                )
                .eq('orders.merchant_id', merchantId)
                .in('authorization_code', auths)

            for (const p of payments ?? []) {
                const auth = p.authorization_code as string | null
                if (!auth) continue
                for (const b of [p.batch_number, p.dejavoo_batch_number].filter(Boolean) as string[]) {
                    if (batchIds.includes(b)) {
                        reconMap.set(`${b}::${auth}`, {
                            payment_id: p.id as string,
                            order_id: p.order_id as string,
                        })
                    }
                }
            }
        }

        const upsertRows = rows.map((r) => {
            const key = `${r.batchId}::${r.authorizationNumber}`
            const match = reconMap.get(key)
            if (match) reconciled++
            return {
                merchant_id: merchantId,
                location_id: target.locationId,
                mid: r.mid,
                batch_id: r.batchId,
                authorization_number: r.authorizationNumber,
                transaction_date: r.transactionDate || null,
                original_transaction_date: r.originalTransactionDate,
                terminal_id: r.terminalId,
                pos_entry_mode: r.posEntryMode,
                card_type: r.cardType,
                account_first6: r.accountNumberFirst6,
                account_last4: r.accountNumberLast4,
                reject_reason: r.rejectReason || null,
                debit_credit_indicator: r.debitCreditIndicator,
                amount_dollars: (Number(r.transactionAmount) || 0) / 100,
                doing_business_as: r.doingBusinessAs,
                legal_business_name: r.legalBusinessName,
                transaction_code: r['TransactionCode.code'],
                transaction_code_description: r['TransactionCode.description'],
                raw: r as unknown as Record<string, unknown>,
                reconciled_payment_id: match?.payment_id ?? null,
                reconciled_order_id: match?.order_id ?? null,
                reconciled_at: match ? new Date().toISOString() : null,
                last_seen_at: new Date().toISOString(),
            }
        })

        const { error: upsertErr, data: upserted } = await supabase
            .from('luqra_transactions')
            .upsert(upsertRows, {
                onConflict: 'mid,batch_id,authorization_number,original_transaction_date',
                ignoreDuplicates: false,
            })
            .select('id, created_at, updated_at')

        if (upsertErr) {
            if (!firstError) firstError = upsertErr.message
            break
        }

        for (const row of upserted ?? []) {
            if (row.created_at === row.updated_at) ingested++
            else updated++
        }

        if (rows.length < pageSize) break // last page
    }

    await supabase.from('luqra_sync_runs').insert({
        id: runId,
        merchant_id: merchantId,
        location_id: target.locationId,
        mid: target.mid,
        resource: 'transactions',
        date_from: range.dateFrom ?? null,
        date_to: range.dateTo ?? null,
        pages_fetched: pagesFetched,
        rows_ingested: ingested,
        rows_updated: updated,
        rows_reconciled: reconciled,
        status: firstError ? 'error' : 'ok',
        error_code: firstError ?? null,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
    })

    return { ingested, updated, reconciled, error: firstError }
}

// ----------------------------------------------------------------------------
// Chargebacks
// ----------------------------------------------------------------------------

async function syncChargebacksForMid(
    merchantId: string,
    target: MidTarget,
    range: LuqraSyncRange,
    maxRows?: number | null
) {
    const supabase = createServiceRoleClient()
    const runId = crypto.randomUUID()
    const startedAt = new Date().toISOString()

    let pagesFetched = 0
    let ingested = 0
    let updated = 0
    let firstError: string | undefined

    const pageSize = Math.min(maxRows ?? PAGE_SIZE, PAGE_SIZE)
    const pageCap = maxRows ? Math.max(1, Math.ceil(maxRows / pageSize)) : MAX_PAGES

    for (let page = 1; page <= pageCap; page++) {
        const res = await getLuqraChargebacks({
            mid: target.mid,
            page,
            count: pageSize,
            orderBy: '-dateLoaded',
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
        })
        pagesFetched++
        if (res.error) {
            if (!firstError) firstError = res.error
            break
        }
        const payload = res.data as LuqraChargebacksResponse
        const rows: LuqraChargeback[] = payload?.data?.data ?? []
        if (rows.length === 0) break

        const upsertRows = rows.map((r) => ({
            id: r.id,
            merchant_id: merchantId,
            location_id: target.locationId,
            mid: r.mid,
            case_number: r.caseNumber,
            acquirer_reference_number: r.acquirerReferenceNumber,
            application_id: r.applicationId,
            doing_business_as: r.doingBusinessAs,
            date_loaded: r.dateLoaded,
            last_date_loaded: r.lastDateLoaded,
            date_transaction: r.dateTransaction,
            debit_credit: r.debitCredit,
            merch_amount: Number(r.merchAmount) || 0,
            case_amount: Number(r.caseAmount) || 0,
            case_type: r.caseType,
            item_type: r.itemType,
            resolution_to: r.resolutionTo,
            reason_code: r.reasonCode,
            reason_description: r.reasonDesc,
            card_brand: r.cardBrand,
            cardholder_account_number: r.cardholderAccountNumber,
            auth_code: r.authCode,
            trans_id: r.transId,
            current_status: r.currentStatus,
            dispute_type: r.disputeType,
            is_reversal: r.isReversal,
            status_id: r.status,
            history: r.history as unknown as Record<string, unknown>[],
            raw: r as unknown as Record<string, unknown>,
            last_seen_at: new Date().toISOString(),
        }))

        const { data: upserted, error: upsertErr } = await supabase
            .from('luqra_chargebacks')
            .upsert(upsertRows, { onConflict: 'id', ignoreDuplicates: false })
            .select('id, created_at, updated_at')

        if (upsertErr) {
            if (!firstError) firstError = upsertErr.message
            break
        }

        for (const row of upserted ?? []) {
            if (row.created_at === row.updated_at) ingested++
            else updated++
        }

        if (rows.length < pageSize) break
    }

    await supabase.from('luqra_sync_runs').insert({
        id: runId,
        merchant_id: merchantId,
        location_id: target.locationId,
        mid: target.mid,
        resource: 'chargebacks',
        date_from: range.dateFrom ?? null,
        date_to: range.dateTo ?? null,
        pages_fetched: pagesFetched,
        rows_ingested: ingested,
        rows_updated: updated,
        rows_reconciled: 0,
        status: firstError ? 'error' : 'ok',
        error_code: firstError ?? null,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
    })

    return { ingested, updated, error: firstError }
}

// ----------------------------------------------------------------------------
// Deposits
// ----------------------------------------------------------------------------

async function syncDepositsForMid(
    merchantId: string,
    target: MidTarget,
    range: LuqraSyncRange,
    maxRows?: number | null
) {
    const supabase = createServiceRoleClient()
    const runId = crypto.randomUUID()
    const startedAt = new Date().toISOString()

    let pagesFetched = 0
    let ingested = 0
    let updated = 0
    let firstError: string | undefined

    const pageSize = Math.min(maxRows ?? PAGE_SIZE, PAGE_SIZE)
    const pageCap = maxRows ? Math.max(1, Math.ceil(maxRows / pageSize)) : MAX_PAGES

    // Track every distinct deposit_date we ingested so we can link
    // luqra_transactions.deposit_id in one shot at the end.
    const seenDepositDates = new Set<string>()

    for (let page = 1; page <= pageCap; page++) {
        const res = await getLuqraDepositsDetails({
            mid: target.mid,
            page,
            count: pageSize,
            orderBy: 'depositDate',
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
        })
        pagesFetched++
        if (res.error) {
            if (!firstError) firstError = res.error
            break
        }
        const payload = res.data as LuqraDepositDetailsResponse
        const rows: LuqraDepositDetail[] = payload?.data ?? []
        if (rows.length === 0) break

        const upsertRows = rows.map((d) => {
            const date = d.depositDate?.slice(0, 10) ?? null
            if (date) seenDepositDates.add(date)
            return {
                id: d.id,
                merchant_id: merchantId,
                location_id: target.locationId,
                mid: d.mid,
                deposit_date: date,
                statement_date: null, // details endpoint doesn't include this
                reference_number: d.referenceNumber,
                routing_number: d.routingNumber != null ? String(d.routingNumber) : null,
                dda_number: d.ddaNumber,
                batch_total: Number(d.batchTotal) || 0,
                daily_fees: Number(d.dailyFees) || 0,
                chargeback_amount: Number(d.chargeBackAmount) || 0,
                reserved_funds: Number(d.reservedFunds) || 0,
                adjustment_amount: Number(d.adjustmentAmount) || 0,
                net_batches: Number(d.netBatches) || 0,
                net_deposit: Number(d.netDeposit) || 0,
                split_funding_amount: Number(d.splitFundingAmount) || 0,
                chargeback_case_number: d.chargebackCaseNumber,
                doing_business_as: d.doingBusinessAs,
                raw: d as unknown as Record<string, unknown>,
                last_seen_at: new Date().toISOString(),
            }
        })

        const { data: upserted, error: upsertErr } = await supabase
            .from('luqra_deposits')
            .upsert(upsertRows, { onConflict: 'id', ignoreDuplicates: false })
            .select('id, created_at, updated_at')

        if (upsertErr) {
            if (!firstError) firstError = upsertErr.message
            break
        }
        for (const row of upserted ?? []) {
            if (row.created_at === row.updated_at) ingested++
            else updated++
        }

        if (rows.length < pageSize) break
    }

    // Link transactions to deposits where mid + transaction_date match.
    // transaction_date IS the settlement/deposit date for funded txns.
    let linked = 0
    if (seenDepositDates.size > 0) {
        const dates = Array.from(seenDepositDates)
        const { data: deposits } = await supabase
            .from('luqra_deposits')
            .select('id, deposit_date')
            .eq('merchant_id', merchantId)
            .eq('mid', target.mid)
            .in('deposit_date', dates)

        for (const dep of deposits ?? []) {
            const { data: linkedRows, error: linkErr } = await supabase
                .from('luqra_transactions')
                .update({ deposit_id: dep.id })
                .eq('merchant_id', merchantId)
                .eq('mid', target.mid)
                .eq('transaction_date', dep.deposit_date)
                .is('deposit_id', null)
                .select('id')
            if (!linkErr && linkedRows) linked += linkedRows.length
        }
    }

    await supabase.from('luqra_sync_runs').insert({
        id: runId,
        merchant_id: merchantId,
        location_id: target.locationId,
        mid: target.mid,
        resource: 'deposits',
        date_from: range.dateFrom ?? null,
        date_to: range.dateTo ?? null,
        pages_fetched: pagesFetched,
        rows_ingested: ingested,
        rows_updated: updated,
        rows_reconciled: linked,
        status: firstError ? 'error' : 'ok',
        error_code: firstError ?? null,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
    })

    return { ingested, updated, linked, error: firstError }
}

// ----------------------------------------------------------------------------
// Batches
// ----------------------------------------------------------------------------

async function syncBatchesForMid(
    merchantId: string,
    target: MidTarget,
    range: LuqraSyncRange,
    maxRows?: number | null
) {
    const supabase = createServiceRoleClient()
    const runId = crypto.randomUUID()
    const startedAt = new Date().toISOString()

    let pagesFetched = 0
    let ingested = 0
    let updated = 0
    let firstError: string | undefined

    const pageSize = Math.min(maxRows ?? PAGE_SIZE, PAGE_SIZE)
    const pageCap = maxRows ? Math.max(1, Math.ceil(maxRows / pageSize)) : MAX_PAGES

    // Pre-load deposits in range so we can resolve batch.deposit_id without
    // a per-row round-trip. Match key is (mid, statement_date == deposit_date,
    // merchantReferenceNumber matches deposit.reference_number — Luqra strips
    // leading zeros on batches so we compare normalized).
    const depositIndex = new Map<string, string>() // `${date}::${refNoLeadingZeros}` → deposit.id
    {
        let depQ = supabase
            .from('luqra_deposits')
            .select('id, deposit_date, reference_number')
            .eq('merchant_id', merchantId)
            .eq('mid', target.mid)
        if (range.dateFrom) depQ = depQ.gte('deposit_date', range.dateFrom)
        if (range.dateTo) depQ = depQ.lte('deposit_date', range.dateTo)
        const { data: deps } = await depQ
        for (const d of deps ?? []) {
            const date = (d.deposit_date as string) ?? ''
            const ref = trimLeadingZeros(d.reference_number as string | null) ?? ''
            if (date && ref) depositIndex.set(`${date}::${ref}`, d.id as string)
        }
    }

    let linkedToDeposits = 0

    for (let page = 1; page <= pageCap; page++) {
        const res = await getLuqraBatches({
            mid: target.mid,
            page,
            count: pageSize,
            orderBy: 'statementDate',
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
        })
        pagesFetched++
        if (res.error) {
            if (!firstError) firstError = res.error
            break
        }
        const payload = res.data as LuqraBatchesResponse
        const rows: LuqraBatch[] = payload?.data?.data ?? []
        if (rows.length === 0) break

        const upsertRows = rows.map((b) => {
            const fd = b.flattenDetails ?? ({} as LuqraBatch['flattenDetails'])
            const ref = trimLeadingZeros(b.merchantReferenceNumber)
            const depKey = b.statementDate && ref ? `${b.statementDate}::${ref}` : ''
            const depositId = depositIndex.get(depKey) ?? null
            if (depositId) linkedToDeposits++
            return {
                id: b.id,
                merchant_id: merchantId,
                location_id: target.locationId,
                mid: b.mid,
                batch_date: b.batchDate || null,
                statement_date: b.statementDate || null,
                merchant_reference_number: b.merchantReferenceNumber,
                reject_reason: b.rejectReason || null,
                transactions_count: Number(b.transactionsCount) || 0,
                has_duplicate_rejects_within_30_days:
                    b.hasDuplicateRejectsWithin30Days === true ||
                    b.hasDuplicateRejectsWithin30Days === 1,
                net_deposit: (Number(b.netDeposit) || 0) / 100,
                batched_amount: (Number(b.batchedAmount) || 0) / 100,
                approved_batches: (Number(b.approvedBatches) || 0) / 100,
                credits_amount: (Number(b.creditsAmount) || 0) / 100,
                rejects_amount: (Number(b.rejectsAmount) || 0) / 100,
                visa_sales: (Number(fd.visaSalesAmount) || 0) / 100,
                visa_count: Number(fd.visaTransactionsCount) || 0,
                mastercard_sales: (Number(fd.mastercardSalesAmount) || 0) / 100,
                mastercard_count: Number(fd.mastercardTransactionsCount) || 0,
                amex_sales: (Number(fd.amexSalesAmount) || 0) / 100,
                amex_count: Number(fd.amexTransactionsCount) || 0,
                discover_sales: (Number(fd.discoverSalesAmount) || 0) / 100,
                discover_count: Number(fd.discoverTransactionsCount) || 0,
                ebt_sales: (Number(fd.ebtSalesAmount) || 0) / 100,
                ebt_count: Number(fd.ebtTransactionsCount) || 0,
                pin_sales: (Number(fd.pinSalesAmount) || 0) / 100,
                pin_count: Number(fd.pinTransactionsCount) || 0,
                deposit_id: depositId,
                doing_business_as: b.doingBusinessAs,
                raw: b as unknown as Record<string, unknown>,
                last_seen_at: new Date().toISOString(),
            }
        })

        const { data: upserted, error: upsertErr } = await supabase
            .from('luqra_batches')
            .upsert(upsertRows, { onConflict: 'id', ignoreDuplicates: false })
            .select('id, created_at, updated_at')

        if (upsertErr) {
            if (!firstError) firstError = upsertErr.message
            break
        }
        for (const row of upserted ?? []) {
            if (row.created_at === row.updated_at) ingested++
            else updated++
        }

        if (rows.length < pageSize) break
    }

    await supabase.from('luqra_sync_runs').insert({
        id: runId,
        merchant_id: merchantId,
        location_id: target.locationId,
        mid: target.mid,
        resource: 'batches',
        date_from: range.dateFrom ?? null,
        date_to: range.dateTo ?? null,
        pages_fetched: pagesFetched,
        rows_ingested: ingested,
        rows_updated: updated,
        rows_reconciled: linkedToDeposits,
        status: firstError ? 'error' : 'ok',
        error_code: firstError ?? null,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
    })

    return { ingested, updated, linkedToDeposits, error: firstError }
}

// ----------------------------------------------------------------------------
// Public entry — sync both resources for one merchant
// ----------------------------------------------------------------------------

export async function syncLuqraForMerchant(
    merchantId: string,
    opts: {
        locationId?: string | null
        range?: LuqraSyncRange
        /** When set (and no range), caps the sync to roughly this many rows per (mid × resource). */
        maxRows?: number | null
    } = {}
): Promise<LuqraSyncResult> {
    try {
        await assertHQPermission('hq.merchant.update')

        const targets = await listMidTargets(merchantId, opts.locationId)
        if (!targets.length) {
            return {
                success: true,
                error: null,
                perMid: {},
            }
        }

        const range = opts.range ?? {}
        const hasRange = !!(range.dateFrom || range.dateTo)
        // Refuse to fan-out a full-history pull. Either a range or an explicit
        // maxRows must be provided.
        if (!hasRange && !(opts.maxRows && opts.maxRows > 0)) {
            return {
                success: false,
                error: 'range_or_count_required',
                perMid: {},
            }
        }
        const perMid: LuqraSyncResult['perMid'] = {}
        let aggregateError: string | null = null

        for (const target of targets) {
            // Order matters:
            //   1. transactions  (so deposit-linking has txn rows)
            //   2. deposits      (links txns; populates depositIndex for batches)
            //   3. batches       (links to deposits via merchantReferenceNumber)
            //   4. chargebacks
            const t = await syncTransactionsForMid(merchantId, target, range, opts.maxRows)
            const d = await syncDepositsForMid(merchantId, target, range, opts.maxRows)
            const b = await syncBatchesForMid(merchantId, target, range, opts.maxRows)
            const c = await syncChargebacksForMid(merchantId, target, range, opts.maxRows)
            perMid[target.mid] = {
                transactionsIngested: t.ingested,
                transactionsUpdated: t.updated,
                transactionsReconciled: t.reconciled,
                chargebacksIngested: c.ingested,
                chargebacksUpdated: c.updated,
                depositsIngested: d.ingested,
                depositsUpdated: d.updated,
                depositsLinked: d.linked,
                batchesIngested: b.ingested,
                batchesUpdated: b.updated,
                batchesLinkedToDeposits: b.linkedToDeposits,
                error: t.error || d.error || b.error || c.error,
            }
            const e = t.error || d.error || b.error || c.error
            if (e && !aggregateError) {
                aggregateError = e
            }
        }

        return {
            success: !aggregateError,
            error: aggregateError,
            perMid,
        }
    } catch (err) {
        console.error('[syncLuqraForMerchant] Error:', err)
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Sync failed',
            perMid: {},
        }
    }
}

// ----------------------------------------------------------------------------
// Cache readers (used by UI now that data is persisted)
// ----------------------------------------------------------------------------

export interface CachedTxnFilters {
    locationId?: string | null
    dateFrom?: string | null
    dateTo?: string | null
    page?: number
    count?: number
    /** Drill-down: only rows whose deposit_id matches. */
    depositId?: string | null
    /** Drill-down: only rows whose batch_id matches. */
    batchId?: string | null
}

export interface CachedTxnRow {
    id: string
    location_id: string | null
    location_name: string | null
    mid: string
    batch_id: string
    authorization_number: string
    original_transaction_date: string
    transaction_date: string | null
    terminal_id: string | null
    pos_entry_mode: string | null
    card_type: string | null
    account_last4: string | null
    amount_dollars: number
    reconciled_payment_id: string | null
    reconciled_order_id: string | null
    reconciled_at: string | null
    reconciled_order_number: string | null
}

export async function getCachedLuqraTransactions(
    merchantId: string,
    filters: CachedTxnFilters = {}
) {
    try {
        await assertHQPermission('hq.merchant.transactions')
        const supabase = createServiceRoleClient()

        const page = filters.page ?? 1
        const count = Math.min(filters.count ?? 50, 200)
        const fromIdx = (page - 1) * count

        let q = supabase
            .from('luqra_transactions')
            .select(
                `
        id, location_id, mid, batch_id, authorization_number,
        original_transaction_date, transaction_date,
        terminal_id, pos_entry_mode, card_type, account_last4, amount_dollars,
        reconciled_payment_id, reconciled_order_id, reconciled_at,
        location:locations(id, name),
        order:orders!luqra_transactions_reconciled_order_id_fkey(order_number)
      `,
                { count: 'exact' }
            )
            .eq('merchant_id', merchantId)
            .order('original_transaction_date', { ascending: false })
            .range(fromIdx, fromIdx + count - 1)

        if (filters.locationId) q = q.eq('location_id', filters.locationId)
        if (filters.dateFrom) q = q.gte('original_transaction_date', filters.dateFrom)
        if (filters.dateTo) q = q.lte('original_transaction_date', filters.dateTo)
        if (filters.depositId) q = q.eq('deposit_id', filters.depositId)
        if (filters.batchId) q = q.eq('batch_id', filters.batchId)

        const { data, error, count: total } = await q
        if (error) {
            // Fallback if the FK alias above isn't generated yet — rerun without `order` join.
            let fallbackQ = supabase
                .from('luqra_transactions')
                .select(
                    `
            id, location_id, mid, batch_id, authorization_number,
            original_transaction_date, transaction_date,
            terminal_id, pos_entry_mode, card_type, account_last4, amount_dollars,
            reconciled_payment_id, reconciled_order_id, reconciled_at,
            location:locations(id, name)
          `,
                    { count: 'exact' }
                )
                .eq('merchant_id', merchantId)
                .order('original_transaction_date', { ascending: false })
                .range(fromIdx, fromIdx + count - 1)
            if (filters.locationId) fallbackQ = fallbackQ.eq('location_id', filters.locationId)
            if (filters.dateFrom) fallbackQ = fallbackQ.gte('original_transaction_date', filters.dateFrom)
            if (filters.dateTo) fallbackQ = fallbackQ.lte('original_transaction_date', filters.dateTo)
            if (filters.depositId) fallbackQ = fallbackQ.eq('deposit_id', filters.depositId)
            if (filters.batchId) fallbackQ = fallbackQ.eq('batch_id', filters.batchId)

            const fallback = await fallbackQ
            if (fallback.error) {
                return { success: false as const, error: fallback.error.message, data: null }
            }
            const rows = (fallback.data ?? []).map((r) => mapCachedRow(r as Record<string, unknown>))
            return {
                success: true as const,
                error: null,
                data: { rows, total: fallback.count ?? rows.length },
            }
        }

        const rows = (data ?? []).map((r) => mapCachedRow(r as Record<string, unknown>))
        return {
            success: true as const,
            error: null,
            data: { rows, total: total ?? rows.length },
        }
    } catch (err) {
        console.error('[getCachedLuqraTransactions] Error:', err)
        return {
            success: false as const,
            error: err instanceof Error ? err.message : 'Failed',
            data: null,
        }
    }
}

function mapCachedRow(r: Record<string, unknown>): CachedTxnRow {
    const loc = r.location as { id: string; name: string } | null | undefined
    const ord = r.order as { order_number: string | null } | null | undefined
    return {
        id: r.id as string,
        location_id: (r.location_id as string) ?? null,
        location_name: loc?.name ?? null,
        mid: r.mid as string,
        batch_id: r.batch_id as string,
        authorization_number: r.authorization_number as string,
        original_transaction_date: r.original_transaction_date as string,
        transaction_date: (r.transaction_date as string) ?? null,
        terminal_id: (r.terminal_id as string) ?? null,
        pos_entry_mode: (r.pos_entry_mode as string) ?? null,
        card_type: (r.card_type as string) ?? null,
        account_last4: (r.account_last4 as string) ?? null,
        amount_dollars: Number(r.amount_dollars ?? 0),
        reconciled_payment_id: (r.reconciled_payment_id as string) ?? null,
        reconciled_order_id: (r.reconciled_order_id as string) ?? null,
        reconciled_at: (r.reconciled_at as string) ?? null,
        reconciled_order_number: ord?.order_number ?? null,
    }
}

// ----------------------------------------------------------------------------
// Cached batches
// ----------------------------------------------------------------------------

export interface CachedBatchRow {
    id: string
    location_id: string | null
    location_name: string | null
    mid: string
    batch_date: string | null
    statement_date: string | null
    merchant_reference_number: string | null
    transactions_count: number
    net_deposit: number
    batched_amount: number
    approved_batches: number
    credits_amount: number
    rejects_amount: number
    visa_sales: number
    visa_count: number
    mastercard_sales: number
    mastercard_count: number
    amex_sales: number
    amex_count: number
    discover_sales: number
    discover_count: number
    deposit_id: string | null
    /** Local count of luqra_transactions.batch_id == this id. */
    local_txn_count: number
}

export async function getCachedLuqraBatches(
    merchantId: string,
    filters: CachedTxnFilters = {}
) {
    try {
        await assertHQPermission('hq.merchant.transactions')
        const supabase = createServiceRoleClient()

        let q = supabase
            .from('luqra_batches')
            .select(
                `
        id, location_id, mid, batch_date, statement_date, merchant_reference_number,
        transactions_count, net_deposit, batched_amount, approved_batches,
        credits_amount, rejects_amount,
        visa_sales, visa_count, mastercard_sales, mastercard_count,
        amex_sales, amex_count, discover_sales, discover_count,
        deposit_id,
        location:locations(id, name)
      `
            )
            .eq('merchant_id', merchantId)
            .order('statement_date', { ascending: false })

        if (filters.locationId) q = q.eq('location_id', filters.locationId)
        if (filters.dateFrom) q = q.gte('statement_date', filters.dateFrom)
        if (filters.dateTo) q = q.lte('statement_date', filters.dateTo)

        const { data, error } = await q
        if (error) {
            return { success: false as const, error: error.message, data: null }
        }

        const batches = data ?? []
        const ids = batches.map((b) => b.id as string)

        // Local txn counts per batch (since transactions can land before batches
        // sync, and we want to spot orphans).
        const localCounts = new Map<string, number>()
        if (ids.length > 0) {
            const { data: txns } = await supabase
                .from('luqra_transactions')
                .select('batch_id')
                .eq('merchant_id', merchantId)
                .in('batch_id', ids)
            for (const t of txns ?? []) {
                const id = (t.batch_id as string) ?? ''
                if (!id) continue
                localCounts.set(id, (localCounts.get(id) ?? 0) + 1)
            }
        }

        const rows: CachedBatchRow[] = batches.map((b) => {
            const rawLoc = (b as unknown as {
                location?: { id: string; name: string } | { id: string; name: string }[] | null
            }).location
            const loc = Array.isArray(rawLoc) ? rawLoc[0] ?? null : rawLoc ?? null
            return {
                id: b.id as string,
                location_id: (b.location_id as string) ?? null,
                location_name: loc?.name ?? null,
                mid: b.mid as string,
                batch_date: (b.batch_date as string) ?? null,
                statement_date: (b.statement_date as string) ?? null,
                merchant_reference_number: (b.merchant_reference_number as string) ?? null,
                transactions_count: Number(b.transactions_count ?? 0),
                net_deposit: Number(b.net_deposit ?? 0),
                batched_amount: Number(b.batched_amount ?? 0),
                approved_batches: Number(b.approved_batches ?? 0),
                credits_amount: Number(b.credits_amount ?? 0),
                rejects_amount: Number(b.rejects_amount ?? 0),
                visa_sales: Number(b.visa_sales ?? 0),
                visa_count: Number(b.visa_count ?? 0),
                mastercard_sales: Number(b.mastercard_sales ?? 0),
                mastercard_count: Number(b.mastercard_count ?? 0),
                amex_sales: Number(b.amex_sales ?? 0),
                amex_count: Number(b.amex_count ?? 0),
                discover_sales: Number(b.discover_sales ?? 0),
                discover_count: Number(b.discover_count ?? 0),
                deposit_id: (b.deposit_id as string) ?? null,
                local_txn_count: localCounts.get(b.id as string) ?? 0,
            }
        })

        return { success: true as const, error: null, data: { rows } }
    } catch (err) {
        console.error('[getCachedLuqraBatches] Error:', err)
        return {
            success: false as const,
            error: err instanceof Error ? err.message : 'Failed',
            data: null,
        }
    }
}

// ----------------------------------------------------------------------------
// Cached deposits
// ----------------------------------------------------------------------------

export interface CachedDepositRow {
    id: string
    location_id: string | null
    location_name: string | null
    mid: string
    deposit_date: string
    reference_number: string | null
    routing_number: string | null
    dda_number: string | null
    batch_total: number
    daily_fees: number
    chargeback_amount: number
    reserved_funds: number
    adjustment_amount: number
    net_batches: number
    net_deposit: number
    txn_count: number
    batch_count: number
}

export async function getCachedLuqraDeposits(
    merchantId: string,
    filters: CachedTxnFilters = {}
) {
    try {
        await assertHQPermission('hq.merchant.transactions')
        const supabase = createServiceRoleClient()

        let q = supabase
            .from('luqra_deposits')
            .select(
                `
        id, location_id, mid, deposit_date, reference_number, routing_number, dda_number,
        batch_total, daily_fees, chargeback_amount, reserved_funds, adjustment_amount,
        net_batches, net_deposit,
        location:locations(id, name)
      `
            )
            .eq('merchant_id', merchantId)
            .order('deposit_date', { ascending: false })

        if (filters.locationId) q = q.eq('location_id', filters.locationId)
        if (filters.dateFrom) q = q.gte('deposit_date', filters.dateFrom)
        if (filters.dateTo) q = q.lte('deposit_date', filters.dateTo)

        const { data, error } = await q
        if (error) {
            return { success: false as const, error: error.message, data: null }
        }

        const deposits = data ?? []
        const ids = deposits.map((d) => d.id as string)

        // Fetch txn + batch counts per deposit in one round-trip.
        const counts = new Map<string, { txns: number; batches: Set<string> }>()
        if (ids.length > 0) {
            const { data: txns } = await supabase
                .from('luqra_transactions')
                .select('deposit_id, batch_id')
                .in('deposit_id', ids)

            for (const t of txns ?? []) {
                const id = (t.deposit_id as string) ?? ''
                if (!id) continue
                let entry = counts.get(id)
                if (!entry) {
                    entry = { txns: 0, batches: new Set() }
                    counts.set(id, entry)
                }
                entry.txns += 1
                if (t.batch_id) entry.batches.add(t.batch_id as string)
            }
        }

        const rows: CachedDepositRow[] = deposits.map((d) => {
            const rawLoc = (d as unknown as { location?: { id: string; name: string } | { id: string; name: string }[] | null }).location
            const loc = Array.isArray(rawLoc) ? rawLoc[0] ?? null : rawLoc ?? null
            const c = counts.get(d.id as string)
            return {
                id: d.id as string,
                location_id: (d.location_id as string) ?? null,
                location_name: loc?.name ?? null,
                mid: d.mid as string,
                deposit_date: d.deposit_date as string,
                reference_number: (d.reference_number as string) ?? null,
                routing_number: (d.routing_number as string) ?? null,
                dda_number: (d.dda_number as string) ?? null,
                batch_total: Number(d.batch_total ?? 0),
                daily_fees: Number(d.daily_fees ?? 0),
                chargeback_amount: Number(d.chargeback_amount ?? 0),
                reserved_funds: Number(d.reserved_funds ?? 0),
                adjustment_amount: Number(d.adjustment_amount ?? 0),
                net_batches: Number(d.net_batches ?? 0),
                net_deposit: Number(d.net_deposit ?? 0),
                txn_count: c?.txns ?? 0,
                batch_count: c?.batches.size ?? 0,
            }
        })

        return { success: true as const, error: null, data: { rows } }
    } catch (err) {
        console.error('[getCachedLuqraDeposits] Error:', err)
        return {
            success: false as const,
            error: err instanceof Error ? err.message : 'Failed',
            data: null,
        }
    }
}

export interface CachedCbRow {
    id: number
    location_id: string | null
    location_name: string | null
    mid: string
    case_number: string
    date_loaded: string | null
    merch_amount: number
    case_amount: number
    reason_code: string | null
    reason_description: string | null
    cardholder_account_number: string | null
    auth_code: string | null
    current_status: string | null
    dispute_type: string | null
    is_reversal: string | null
    history: unknown
    trans_id: string | null
    acquirer_reference_number: string | null
    date_transaction: string | null
    resolution_to: string | null
}

export async function getCachedLuqraChargebacks(
    merchantId: string,
    filters: CachedTxnFilters = {}
) {
    try {
        await assertHQPermission('hq.merchant.transactions')
        const supabase = createServiceRoleClient()

        let q = supabase
            .from('luqra_chargebacks')
            .select(
                `
        *,
        location:locations(id, name)
      `
            )
            .eq('merchant_id', merchantId)
            .order('date_loaded', { ascending: false })

        if (filters.locationId) q = q.eq('location_id', filters.locationId)
        if (filters.dateFrom) q = q.gte('date_loaded', filters.dateFrom)
        if (filters.dateTo) q = q.lte('date_loaded', filters.dateTo)

        const { data, error } = await q
        if (error) {
            return { success: false as const, error: error.message, data: null }
        }

        // Aggregate locally — same shape the live fetcher used to provide.
        const rows: (CachedCbRow & { location: unknown })[] = (data ?? []).map((r) => {
            const loc = (r as { location?: { id: string; name: string } }).location ?? null
            return {
                ...(r as unknown as CachedCbRow),
                location_name: loc?.name ?? null,
                location: loc,
            }
        })

        const cbAmount = rows.reduce((s, r) => s + (Number(r.merch_amount) || 0), 0)
        const cbCount = rows.length

        return {
            success: true as const,
            error: null,
            data: {
                rows,
                totals: {
                    cbAmount,
                    cbCount,
                    totalCbAmountRatio: 0,
                    totalCbCountRatio: 0,
                    allTransactionAmount: 0,
                    allTransactionCount: 0,
                },
            },
        }
    } catch (err) {
        console.error('[getCachedLuqraChargebacks] Error:', err)
        return {
            success: false as const,
            error: err instanceof Error ? err.message : 'Failed',
            data: null,
        }
    }
}
