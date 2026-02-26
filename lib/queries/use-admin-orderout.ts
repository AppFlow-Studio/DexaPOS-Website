'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'
import {
  getAdminOrderOutStatus,
  adminOnboardOrderOut,
  type AdminOnboardOrderOutParams,
} from '@/app/manage/actions/admin-merchant/orderout'
import { toast } from 'sonner'

/**
 * Get OrderOut status for a merchant (account + all restaurants)
 */
export function useAdminOrderOutStatus(merchantId: string) {
  return useQuery({
    queryKey: adminKeys.merchantOrderOutStatus(merchantId),
    queryFn: () => getAdminOrderOutStatus(merchantId),
    enabled: !!merchantId,
    staleTime: 30 * 1000,
  })
}

/**
 * Onboard a location to OrderOut (admin)
 */
export function useAdminOnboardOrderOut() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: AdminOnboardOrderOutParams) => adminOnboardOrderOut(params),
    onSuccess: (result, variables) => {
      if (result.success) {
        toast.success('Location connected to OrderOut successfully')
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantOrderOutStatus(variables.merchantId),
        })
      } else {
        toast.error(result.error || 'Failed to connect to OrderOut')
      }
    },
    onError: () => {
      toast.error('Failed to connect to OrderOut')
    },
  })
}
