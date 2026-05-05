'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    assignLuqraMid,
    clearLuqraMid,
    getMerchantLocationMids,
    getMerchantLuqraChargebacks,
    getMerchantLuqraTransactions,
    type AssignLuqraMidInput,
    type GetLuqraTransactionsParams,
} from '@/app/manage/actions/admin-merchant/luqra'
import {
    getCachedLuqraBatches,
    getCachedLuqraChargebacks,
    getCachedLuqraDeposits,
    getCachedLuqraTransactions,
    syncLuqraForMerchant,
    type CachedTxnFilters,
    type LuqraSyncRange,
} from '@/app/manage/actions/admin-merchant/luqra-sync'

const luqraKeys = {
    mids: (merchantId: string) => ['admin-luqra-mids', merchantId] as const,
    transactions: (merchantId: string, p: GetLuqraTransactionsParams) =>
        ['admin-luqra-transactions', merchantId, p.locationId ?? 'all', p.page ?? 1, p.count ?? 50] as const,
    chargebacks: (merchantId: string, p: GetLuqraTransactionsParams) =>
        ['admin-luqra-chargebacks', merchantId, p.locationId ?? 'all', p.page ?? 1, p.count ?? 20] as const,
}

export function useMerchantLocationMids(merchantId: string) {
    return useQuery({
        queryKey: luqraKeys.mids(merchantId),
        queryFn: () => getMerchantLocationMids(merchantId),
        enabled: !!merchantId,
        staleTime: 30_000,
    })
}

export function useMerchantLuqraTransactions(
    merchantId: string,
    params: GetLuqraTransactionsParams = {}
) {
    return useQuery({
        queryKey: luqraKeys.transactions(merchantId, params),
        queryFn: () => getMerchantLuqraTransactions(merchantId, params),
        enabled: !!merchantId,
        staleTime: 60_000,
    })
}

export function useMerchantLuqraChargebacks(
    merchantId: string,
    params: GetLuqraTransactionsParams = {}
) {
    return useQuery({
        queryKey: luqraKeys.chargebacks(merchantId, params),
        queryFn: () => getMerchantLuqraChargebacks(merchantId, params),
        enabled: !!merchantId,
        staleTime: 60_000,
    })
}

export function useAssignLuqraMid(merchantId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (vars: { locationId: string; input: AssignLuqraMidInput }) =>
            assignLuqraMid(merchantId, vars.locationId, vars.input),
        onSuccess: (res) => {
            if (res.success) {
                qc.invalidateQueries({ queryKey: luqraKeys.mids(merchantId) })
                qc.invalidateQueries({ queryKey: ['admin-merchant-details', merchantId] })
            }
        },
    })
}

// ----------------------------------------------------------------------------
// Cache-backed reads + sync
// ----------------------------------------------------------------------------

export function useCachedLuqraTransactions(
    merchantId: string,
    filters: CachedTxnFilters = {}
) {
    return useQuery({
        queryKey: [
            'admin-luqra-cache-transactions',
            merchantId,
            filters.locationId ?? 'all',
            filters.dateFrom ?? '',
            filters.dateTo ?? '',
            filters.page ?? 1,
            filters.count ?? 50,
        ],
        queryFn: () => getCachedLuqraTransactions(merchantId, filters),
        enabled: !!merchantId,
        staleTime: 30_000,
    })
}

export function useCachedLuqraBatches(
    merchantId: string,
    filters: CachedTxnFilters = {}
) {
    return useQuery({
        queryKey: [
            'admin-luqra-cache-batches',
            merchantId,
            filters.locationId ?? 'all',
            filters.dateFrom ?? '',
            filters.dateTo ?? '',
        ],
        queryFn: () => getCachedLuqraBatches(merchantId, filters),
        enabled: !!merchantId,
        staleTime: 30_000,
    })
}

export function useCachedLuqraDeposits(
    merchantId: string,
    filters: CachedTxnFilters = {}
) {
    return useQuery({
        queryKey: [
            'admin-luqra-cache-deposits',
            merchantId,
            filters.locationId ?? 'all',
            filters.dateFrom ?? '',
            filters.dateTo ?? '',
        ],
        queryFn: () => getCachedLuqraDeposits(merchantId, filters),
        enabled: !!merchantId,
        staleTime: 30_000,
    })
}

export function useCachedLuqraChargebacks(
    merchantId: string,
    filters: CachedTxnFilters = {}
) {
    return useQuery({
        queryKey: [
            'admin-luqra-cache-chargebacks',
            merchantId,
            filters.locationId ?? 'all',
            filters.dateFrom ?? '',
            filters.dateTo ?? '',
        ],
        queryFn: () => getCachedLuqraChargebacks(merchantId, filters),
        enabled: !!merchantId,
        staleTime: 30_000,
    })
}

export function useSyncLuqra(merchantId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (
            vars: {
                locationId?: string | null
                range?: LuqraSyncRange
                maxRows?: number | null
            } = {}
        ) => syncLuqraForMerchant(merchantId, vars),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin-luqra-cache-transactions', merchantId] })
            qc.invalidateQueries({ queryKey: ['admin-luqra-cache-chargebacks', merchantId] })
            qc.invalidateQueries({ queryKey: ['admin-luqra-cache-deposits', merchantId] })
            qc.invalidateQueries({ queryKey: ['admin-luqra-cache-batches', merchantId] })
        },
    })
}

export function useClearLuqraMid(merchantId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (locationId: string) => clearLuqraMid(merchantId, locationId),
        onSuccess: (res) => {
            if (res.success) {
                qc.invalidateQueries({ queryKey: luqraKeys.mids(merchantId) })
                qc.invalidateQueries({ queryKey: ['admin-merchant-details', merchantId] })
            }
        },
    })
}
