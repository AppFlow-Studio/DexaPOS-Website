'use client'

import { useQuery } from '@tanstack/react-query'
import {
    getMerchantPayments,
    type MerchantPaymentFilters,
} from '@/app/manage/actions/admin-merchant/payments'

export function useMerchantPayments(merchantId: string, filters: MerchantPaymentFilters = {}) {
    return useQuery({
        queryKey: [
            'admin-merchant-payments',
            merchantId,
            filters.locationId ?? 'all',
            filters.dateFrom ?? '',
            filters.dateTo ?? '',
            filters.status ?? '',
            filters.batchId ?? '',
            filters.unsettledOnly ?? false,
            filters.unmatchedOnly ?? false,
            filters.page ?? 1,
            filters.count ?? 50,
        ],
        queryFn: () => getMerchantPayments(merchantId, filters),
        enabled: !!merchantId,
        staleTime: 30_000,
    })
}
