'use server'

// ============================================================================
// Admin Luqra Server Actions
// Description: MID assignment + read-through to Luqra Reports API for
// transactions and chargebacks. Reconciles Luqra rows back to our
// order_payments via (merchant_id, batchId, authorizationNumber).
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { assertHQPermission } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import {
    getLuqraChargebacks,
    getLuqraTransactions,
} from '@/lib/luqra/client'
import type {
    LuqraChargeback,
    LuqraChargebacksResponse,
    LuqraTransaction,
    LuqraTransactionsResponse,
} from '@/lib/luqra/types'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type LuqraMidStatus = 'pending' | 'review' | 'live' | 'offline'

export interface LocationMidRow {
    id: string
    name: string
    luqra_mid: string | null
    luqra_mid_descriptor: string | null
    luqra_mid_status: LuqraMidStatus
    luqra_mid_assigned_at: string | null
}

export interface AssignLuqraMidInput {
    mid: string
    descriptor?: string | null
    status?: LuqraMidStatus
}

export interface LuqraTransactionRow extends LuqraTransaction {
    /** Cents → dollars; pre-normalized so the UI doesn't have to. */
    transactionAmountDollars: number
    locationId: string | null
    locationName: string | null
}

export interface LuqraReconciliationMatch {
    payment_id: string
    order_id: string
    order_number: string | null
    total_amount: number
    status: string
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function normalizeMid(input: string): string {
    return input.replace(/\s+/g, '')
}

function isValidMid(input: string): boolean {
    return /^[0-9]{8,20}$/.test(input)
}

// ----------------------------------------------------------------------------
// MID assignment
// ----------------------------------------------------------------------------

export async function getMerchantLocationMids(merchantId: string) {
    try {
        await assertHQPermission('hq.merchant.view')
        const supabase = createServerSupabaseClient()

        const { data, error } = await supabase
            .from('locations')
            .select(
                'id, name, luqra_mid, luqra_mid_descriptor, luqra_mid_status, luqra_mid_assigned_at'
            )
            .eq('merchant_id', merchantId)
            .order('created_at', { ascending: true })

        if (error) {
            console.error('[getMerchantLocationMids] Error:', error)
            return { success: false as const, error: error.message, data: null }
        }
        return { success: true as const, error: null, data: data as LocationMidRow[] }
    } catch (err) {
        console.error('[getMerchantLocationMids] Error:', err)
        return {
            success: false as const,
            error: err instanceof Error ? err.message : 'Failed to fetch MIDs',
            data: null,
        }
    }
}

export async function assignLuqraMid(
    merchantId: string,
    locationId: string,
    input: AssignLuqraMidInput
) {
    try {
        await assertHQPermission('hq.merchant.update')
        const supabase = createServerSupabaseClient()

        const mid = normalizeMid(input.mid)
        if (!isValidMid(mid)) {
            return {
                success: false as const,
                error: 'invalid_mid_format',
                data: null,
            }
        }

        const { data: existing, error: fetchErr } = await supabase
            .from('locations')
            .select('id, name, merchant_id, luqra_mid, luqra_mid_descriptor, luqra_mid_status')
            .eq('id', locationId)
            .single()

        if (fetchErr || !existing) {
            return { success: false as const, error: 'location_not_found', data: null }
        }
        if (existing.merchant_id !== merchantId) {
            return { success: false as const, error: 'merchant_mismatch', data: null }
        }

        const status: LuqraMidStatus = input.status ?? 'pending'

        const { data: updated, error: updateErr } = await supabase
            .from('locations')
            .update({
                luqra_mid: mid,
                luqra_mid_descriptor: input.descriptor ?? null,
                luqra_mid_status: status,
                luqra_mid_assigned_at: new Date().toISOString(),
            })
            .eq('id', locationId)
            .select(
                'id, name, luqra_mid, luqra_mid_descriptor, luqra_mid_status, luqra_mid_assigned_at'
            )
            .single()

        if (updateErr) {
            console.error('[assignLuqraMid] Update error:', updateErr)
            // 23505 = unique_violation (MID already assigned to another location).
            if (updateErr.code === '23505') {
                return { success: false as const, error: 'mid_already_assigned', data: null }
            }
            return { success: false as const, error: updateErr.message, data: null }
        }

        await logAdminAction('LOCATION_LUQRA_MID_ASSIGNED', {
            merchantId,
            locationId,
            resourceType: 'location',
            resourceId: locationId,
            resourceName: existing.name,
            changes: {
                before: {
                    luqra_mid: existing.luqra_mid,
                    luqra_mid_descriptor: existing.luqra_mid_descriptor,
                    luqra_mid_status: existing.luqra_mid_status,
                },
                after: {
                    luqra_mid: mid,
                    luqra_mid_descriptor: input.descriptor ?? null,
                    luqra_mid_status: status,
                },
            },
        })

        return { success: true as const, error: null, data: updated as LocationMidRow }
    } catch (err) {
        console.error('[assignLuqraMid] Error:', err)
        return {
            success: false as const,
            error: err instanceof Error ? err.message : 'Failed to assign MID',
            data: null,
        }
    }
}

export async function clearLuqraMid(merchantId: string, locationId: string) {
    try {
        await assertHQPermission('hq.merchant.update')
        const supabase = createServerSupabaseClient()

        const { data: existing } = await supabase
            .from('locations')
            .select('id, name, merchant_id, luqra_mid, luqra_mid_descriptor, luqra_mid_status')
            .eq('id', locationId)
            .single()

        if (!existing || existing.merchant_id !== merchantId) {
            return { success: false as const, error: 'location_not_found', data: null }
        }

        const { error: updateErr } = await supabase
            .from('locations')
            .update({
                luqra_mid: null,
                luqra_mid_descriptor: null,
                luqra_mid_status: 'pending',
                luqra_mid_assigned_at: null,
            })
            .eq('id', locationId)

        if (updateErr) {
            return { success: false as const, error: updateErr.message, data: null }
        }

        await logAdminAction('LOCATION_LUQRA_MID_CLEARED', {
            merchantId,
            locationId,
            resourceType: 'location',
            resourceId: locationId,
            resourceName: existing.name,
            changes: {
                before: {
                    luqra_mid: existing.luqra_mid,
                    luqra_mid_descriptor: existing.luqra_mid_descriptor,
                    luqra_mid_status: existing.luqra_mid_status,
                },
                after: {
                    luqra_mid: null,
                    luqra_mid_descriptor: null,
                    luqra_mid_status: 'pending',
                },
            },
        })

        return { success: true as const, error: null, data: null }
    } catch (err) {
        console.error('[clearLuqraMid] Error:', err)
        return {
            success: false as const,
            error: err instanceof Error ? err.message : 'Failed to clear MID',
            data: null,
        }
    }
}

// ----------------------------------------------------------------------------
// Read-through: transactions
// ----------------------------------------------------------------------------

async function resolveMidsForMerchant(merchantId: string, locationId?: string | null) {
    const supabase = createServerSupabaseClient()
    let query = supabase
        .from('locations')
        .select('id, name, luqra_mid')
        .eq('merchant_id', merchantId)
        .not('luqra_mid', 'is', null)

    if (locationId) {
        query = query.eq('id', locationId)
    }

    const { data, error } = await query
    if (error) {
        return { error: error.message, mids: [] as { locationId: string; name: string; mid: string }[] }
    }
    return {
        mids: (data ?? [])
            .filter((r) => !!r.luqra_mid)
            .map((r) => ({ locationId: r.id, name: r.name, mid: r.luqra_mid as string })),
    }
}

export interface GetLuqraTransactionsParams {
    locationId?: string | null
    page?: number
    count?: number
}

export async function getMerchantLuqraTransactions(
    merchantId: string,
    params: GetLuqraTransactionsParams = {}
) {
    try {
        await assertHQPermission('hq.merchant.transactions')

        const resolved = await resolveMidsForMerchant(merchantId, params.locationId)
        if ('error' in resolved && resolved.error) {
            return { success: false as const, error: resolved.error, data: null }
        }
        if (!resolved.mids.length) {
            return {
                success: true as const,
                error: null,
                data: { rows: [], totalCount: 0, perMid: {} as Record<string, { totalCount: number }> },
            }
        }

        // Cap fan-out so admin reports stay snappy. If a merchant has more than
        // this many MIDs, the user must scope by location.
        const MAX_FANOUT = 5
        const targets = resolved.mids.slice(0, MAX_FANOUT)
        const rejected = resolved.mids.length - targets.length

        const results = await Promise.all(
            targets.map((target) =>
                getLuqraTransactions({
                    mid: target.mid,
                    page: params.page ?? 1,
                    count: params.count ?? 20,
                }).then((res) => ({ target, res }))
            )
        )

        const rows: LuqraTransactionRow[] = []
        let totalCount = 0
        const perMid: Record<string, { totalCount: number }> = {}
        let firstError: string | undefined

        for (const { target, res } of results) {
            if (res.error) {
                if (!firstError) firstError = res.error
                continue
            }
            const payload = res.data as LuqraTransactionsResponse
            const txns = payload?.data?.data ?? []
            const tc = Number(payload?.data?.totalCount ?? txns.length) || 0
            totalCount += tc
            perMid[target.mid] = { totalCount: tc }

            for (const t of txns) {
                rows.push({
                    ...t,
                    transactionAmountDollars: (Number(t.transactionAmount) || 0) / 100,
                    locationId: target.locationId,
                    locationName: target.name,
                })
            }
        }

        rows.sort((a, b) =>
            (b.originalTransactionDate || '').localeCompare(a.originalTransactionDate || '')
        )

        return {
            success: true as const,
            error: firstError ?? null,
            data: { rows, totalCount, perMid, fanoutTruncated: rejected > 0 },
        }
    } catch (err) {
        console.error('[getMerchantLuqraTransactions] Error:', err)
        return {
            success: false as const,
            error: err instanceof Error ? err.message : 'Failed to fetch Luqra transactions',
            data: null,
        }
    }
}

// ----------------------------------------------------------------------------
// Read-through: chargebacks
// ----------------------------------------------------------------------------

export interface MerchantLuqraChargebackTotals {
    cbAmount: number
    cbCount: number
    totalCbAmountRatio: number
    totalCbCountRatio: number
    allTransactionAmount: number
    allTransactionCount: number
}

export interface MerchantLuqraChargebacksResult {
    rows: (LuqraChargeback & { locationId: string | null; locationName: string | null })[]
    totals: MerchantLuqraChargebackTotals
}

export async function getMerchantLuqraChargebacks(
    merchantId: string,
    params: GetLuqraTransactionsParams = {}
) {
    try {
        await assertHQPermission('hq.merchant.transactions')

        const resolved = await resolveMidsForMerchant(merchantId, params.locationId)
        if ('error' in resolved && resolved.error) {
            return { success: false as const, error: resolved.error, data: null }
        }
        if (!resolved.mids.length) {
            return {
                success: true as const,
                error: null,
                data: {
                    rows: [],
                    totals: {
                        cbAmount: 0,
                        cbCount: 0,
                        totalCbAmountRatio: 0,
                        totalCbCountRatio: 0,
                        allTransactionAmount: 0,
                        allTransactionCount: 0,
                    },
                } as MerchantLuqraChargebacksResult,
            }
        }

        const targets = resolved.mids.slice(0, 5)

        const results = await Promise.all(
            targets.map((target) =>
                getLuqraChargebacks({
                    mid: target.mid,
                    page: params.page ?? 1,
                    count: params.count ?? 20,
                }).then((res) => ({ target, res }))
            )
        )

        const merged: MerchantLuqraChargebacksResult = {
            rows: [],
            totals: {
                cbAmount: 0,
                cbCount: 0,
                totalCbAmountRatio: 0,
                totalCbCountRatio: 0,
                allTransactionAmount: 0,
                allTransactionCount: 0,
            },
        }
        let firstError: string | undefined
        let allTxnAmountSum = 0
        let allTxnCountSum = 0

        for (const { target, res } of results) {
            if (res.error) {
                if (!firstError) firstError = res.error
                continue
            }
            const payload = res.data as LuqraChargebacksResponse
            const cases = payload?.data?.data ?? []
            for (const c of cases) {
                merged.rows.push({
                    ...c,
                    locationId: target.locationId,
                    locationName: target.name,
                })
            }
            merged.totals.cbAmount += Number(payload?.data?.cbAmount ?? 0)
            merged.totals.cbCount += Number(payload?.data?.cbCount ?? 0)
            allTxnAmountSum += Number(payload?.data?.allTransactionAmount ?? 0)
            allTxnCountSum += Number(payload?.data?.allTransactionCount ?? 0)
        }

        merged.totals.allTransactionAmount = allTxnAmountSum
        merged.totals.allTransactionCount = allTxnCountSum
        merged.totals.totalCbAmountRatio =
            allTxnAmountSum > 0 ? merged.totals.cbAmount / allTxnAmountSum : 0
        merged.totals.totalCbCountRatio =
            allTxnCountSum > 0 ? merged.totals.cbCount / allTxnCountSum : 0

        merged.rows.sort((a, b) => (b.dateLoaded || '').localeCompare(a.dateLoaded || ''))

        return { success: true as const, error: firstError ?? null, data: merged }
    } catch (err) {
        console.error('[getMerchantLuqraChargebacks] Error:', err)
        return {
            success: false as const,
            error: err instanceof Error ? err.message : 'Failed to fetch Luqra chargebacks',
            data: null,
        }
    }
}

// ----------------------------------------------------------------------------
// Reconciliation
// ----------------------------------------------------------------------------

export async function reconcileLuqraTransaction(
    merchantId: string,
    batchId: string,
    authCode: string
): Promise<LuqraReconciliationMatch | null> {
    try {
        await assertHQPermission('hq.merchant.transactions')
        const supabase = createServiceRoleClient()

        const { data, error } = await supabase
            .from('order_payments')
            .select(
                `
        id,
        order_id,
        total_amount,
        status,
        authorization_code,
        batch_number,
        dejavoo_batch_number,
        orders!inner(order_number, merchant_id)
      `
            )
            .eq('orders.merchant_id', merchantId)
            .eq('authorization_code', authCode)
            .or(`batch_number.eq.${batchId},dejavoo_batch_number.eq.${batchId}`)
            .limit(1)
            .maybeSingle()

        if (error || !data) return null

        const orders = (data as unknown as { orders: { order_number: string | null } }).orders
        return {
            payment_id: data.id as string,
            order_id: data.order_id as string,
            order_number: orders?.order_number ?? null,
            total_amount: Number(data.total_amount) || 0,
            status: (data.status as string) ?? 'unknown',
        }
    } catch (err) {
        console.error('[reconcileLuqraTransaction] Error:', err)
        return null
    }
}

export interface LuqraReconciliationKey {
    batchId: string
    authCode: string
}

/**
 * Bulk reconciliation — single round-trip lookup of (batchId, authCode) keys.
 * Used by the Settlements > Luqra transactions tab to mark each row matched/unmatched.
 */
export async function reconcileLuqraTransactionsBulk(
    merchantId: string,
    keys: LuqraReconciliationKey[]
): Promise<Record<string, LuqraReconciliationMatch>> {
    try {
        if (!keys.length) return {}
        await assertHQPermission('hq.merchant.transactions')
        const supabase = createServiceRoleClient()

        const authCodes = Array.from(new Set(keys.map((k) => k.authCode).filter(Boolean)))
        const batchIds = Array.from(new Set(keys.map((k) => k.batchId).filter(Boolean)))
        if (!authCodes.length || !batchIds.length) return {}

        const { data, error } = await supabase
            .from('order_payments')
            .select(
                `
        id,
        order_id,
        total_amount,
        status,
        authorization_code,
        batch_number,
        dejavoo_batch_number,
        orders!inner(order_number, merchant_id)
      `
            )
            .eq('orders.merchant_id', merchantId)
            .in('authorization_code', authCodes)

        if (error || !data) return {}

        const out: Record<string, LuqraReconciliationMatch> = {}
        for (const row of data) {
            const auth = row.authorization_code as string | null
            const candidates = [row.batch_number, row.dejavoo_batch_number].filter(
                Boolean
            ) as string[]
            for (const b of candidates) {
                if (auth && batchIds.includes(b)) {
                    const ordersRel = (row as unknown as { orders: { order_number: string | null } }).orders
                    out[`${b}::${auth}`] = {
                        payment_id: row.id as string,
                        order_id: row.order_id as string,
                        order_number: ordersRel?.order_number ?? null,
                        total_amount: Number(row.total_amount) || 0,
                        status: (row.status as string) ?? 'unknown',
                    }
                }
            }
        }
        return out
    } catch (err) {
        console.error('[reconcileLuqraTransactionsBulk] Error:', err)
        return {}
    }
}
