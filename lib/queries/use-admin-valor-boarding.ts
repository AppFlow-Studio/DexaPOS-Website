'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'
import { getMerchantValorBoardingStatus } from '@/app/manage/actions/admin-merchant/valor'
import {
  boardMerchantOnValor,
  setValorAccountPrimary,
} from '@/app/manage/actions/admin-merchant/valor-board'

/** Per-location Valor boarding status for a merchant (HQ admin view). */
export function useMerchantValorBoardingStatus(merchantId: string) {
  return useQuery({
    queryKey: adminKeys.merchantValorBoarding(merchantId),
    queryFn: () => getMerchantValorBoardingStatus(merchantId),
    enabled: !!merchantId,
    staleTime: 30 * 1000,
  })
}

/**
 * Board a merchant on Valor (HQ admin). Runs a server-side preflight first —
 * `ok: false` with `blockers` means nothing was sent to Valor. Refreshes the
 * boarding status on any success so newly-provisioned locations appear.
 */
export function useBoardMerchantOnValor(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (opts?: { makePrimary?: boolean }) =>
      boardMerchantOnValor(merchantId, opts),
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantValorBoarding(merchantId),
        })
      }
    },
  })
}

/**
 * Cut a boarded location's Valor account over to the primary (live) online-order
 * rail. Refreshes boarding status so the "Live" state reflects immediately.
 */
export function useSetValorAccountPrimary(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (locationId: string) => setValorAccountPrimary(merchantId, locationId),
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantValorBoarding(merchantId),
        })
      }
    },
  })
}
