'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  bulkUpdateMerchantLocationFees,
  getMerchantPlatformFees,
  getPlatformFeesOverview,
  updateLocationFeeConfig,
  type UpdateLocationFeeConfigParams,
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

export function useUpdateLocationFeeConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: UpdateLocationFeeConfigParams) => updateLocationFeeConfig(params),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to update fee configuration')
        return
      }
      toast.success('Fee configuration updated')
      qc.invalidateQueries({ queryKey: ['hq-platform-fees-overview'] })
      qc.invalidateQueries({ queryKey: ['hq-platform-fees-merchant'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update fee configuration')
    },
  })
}

export function useBulkUpdateMerchantFees() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: {
      merchantId: string
      tipSurchargePercentage?: number
      dualPricingPercentage?: number
    }) => bulkUpdateMerchantLocationFees(args),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to apply rates to all locations')
        return
      }
      toast.success(`Updated ${result.updated} location${result.updated === 1 ? '' : 's'}`)
      qc.invalidateQueries({ queryKey: ['hq-platform-fees-overview'] })
      qc.invalidateQueries({ queryKey: ['hq-platform-fees-merchant'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to apply rates to all locations')
    },
  })
}
