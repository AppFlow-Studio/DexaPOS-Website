'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getMerchantPayments,
  getMerchantPlatformFees,
  getPlatformFeesOverview,
  type GetMerchantPaymentsParams,
} from '@/app/manage/actions/hq-platform/platform-fees'

export function usePlatformFeesOverview(from: string, to: string) {
  return useQuery({
    queryKey: ['hq-platform-fees-overview', from, to],
    queryFn: () => getPlatformFeesOverview({ from, to }),
    staleTime: 60_000,
    enabled: !!from && !!to,
  })
}

export function useMerchantPlatformFees(merchantId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ['hq-platform-fees-merchant', merchantId, from, to],
    queryFn: () =>
      merchantId ? getMerchantPlatformFees({ merchantId, from, to }) : null,
    staleTime: 60_000,
    enabled: !!merchantId && !!from && !!to,
  })
}

export function useMerchantPayments(
  merchantId: string | null,
  args: Omit<GetMerchantPaymentsParams, 'merchantId'>
) {
  return useQuery({
    queryKey: [
      'hq-platform-fees-payments',
      merchantId,
      args.from,
      args.to,
      args.status ?? 'all',
      args.locationId ?? null,
      args.limit ?? 25,
      args.offset ?? 0,
    ],
    queryFn: () =>
      merchantId
        ? getMerchantPayments({ merchantId, ...args })
        : { rows: [], totalCount: 0 },
    staleTime: 30_000,
    enabled: !!merchantId && !!args.from && !!args.to,
  })
}
