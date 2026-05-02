import { useQuery } from '@tanstack/react-query'
import { GetMerchantSpotlight } from '../actions/get-merchant-spotlight'

export const merchantSpotlightKey = (limit: number) =>
  ['admin', 'merchant-spotlight', limit] as const

export function useMerchantSpotlight(limit: number = 10) {
  return useQuery({
    queryKey: merchantSpotlightKey(limit),
    queryFn: () => GetMerchantSpotlight(limit),
    staleTime: 60_000, // 1 minute — operational dashboard, not realtime
    refetchOnWindowFocus: false,
  })
}
