'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'
import {
  getAdminOrderOutStatus,
  adminOnboardOrderOut,
  getAdminOrderOutMenuSyncStatus,
  adminCheckMenuPayloadDiff,
  adminPushMenuToOrderOut,
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

/**
 * Get OrderOut menu sync status for a specific menu (admin)
 */
export function useAdminOrderOutMenuSync(merchantId: string, locationId: string, menuId?: string) {
  return useQuery({
    queryKey: adminKeys.merchantOrderOutMenuSync(merchantId, locationId, menuId || ''),
    queryFn: () => getAdminOrderOutMenuSyncStatus(merchantId, locationId, menuId),
    enabled: !!merchantId && !!locationId,
    staleTime: 30 * 1000,
  })
}

/**
 * Check menu payload diff (admin)
 */
export function useAdminMenuPayloadDiff(merchantId: string, locationId: string, menuId: string) {
  return useQuery({
    queryKey: adminKeys.merchantOrderOutPayloadDiff(merchantId, locationId, menuId),
    queryFn: () => adminCheckMenuPayloadDiff(merchantId, locationId, menuId),
    enabled: !!merchantId && !!locationId && !!menuId,
    staleTime: 30 * 1000,
  })
}

/**
 * Push menu to OrderOut (admin mutation)
 */
export function useAdminPushMenuToOrderOut(merchantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { merchantId: string; menuId: string; locationId: string }) =>
      adminPushMenuToOrderOut(params),
    onSuccess: (result, variables) => {
      if (result.success) {
        toast.success(
          `Menu ${result.data?.isUpdate ? 'synced' : 'uploaded'} to OrderOut (${result.data?.itemsSynced} items)`
        )
        // Invalidate sync status, diff, and orderout status
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantOrderOutMenuSync(merchantId, variables.locationId, variables.menuId),
        })
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantOrderOutPayloadDiff(merchantId, variables.locationId, variables.menuId),
        })
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantOrderOutStatus(merchantId),
        })
      } else {
        toast.error(result.error || 'Failed to push menu to OrderOut')
      }
    },
    onError: () => {
      toast.error('Failed to push menu to OrderOut')
    },
  })
}
