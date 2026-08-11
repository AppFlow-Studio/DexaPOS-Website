'use client'

import { useQuery } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'
import { getMerchantValorBoardingStatus } from '@/app/manage/actions/admin-merchant/valor'

/** Per-location Valor boarding status for a merchant (HQ admin view). */
export function useMerchantValorBoardingStatus(merchantId: string) {
  return useQuery({
    queryKey: adminKeys.merchantValorBoarding(merchantId),
    queryFn: () => getMerchantValorBoardingStatus(merchantId),
    enabled: !!merchantId,
    staleTime: 30 * 1000,
  })
}
