'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'
import {
  getAdminOrderOutStatus,
  adminOnboardOrderOut,
  getAdminOrderOutMenuSyncStatus,
  adminCheckMenuPayloadDiff,
  adminPushMenuToOrderOut,
  adminPushMenuToConnectedChannels,
  getAdminPushChannelsHistory,
  getAdminPushChannelsLiveStatus,
  getAdminOrderOutSyncedMenusForLocation,
  type AdminOnboardOrderOutParams,
  type AdminPushMenuToChannelsParams,
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

// ============================================================================
// Admin: Push Menu to Connected Channels
// ============================================================================

/**
 * HQ admin variant of usePushMenuToChannels.
 */
export function useAdminPushMenuToChannels(merchantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: AdminPushMenuToChannelsParams) =>
      adminPushMenuToConnectedChannels(params),
    onSuccess: (result, variables) => {
      if (result.success) {
        const expected = result.data?.expectedChannels.length ?? 0
        toast.success(
          `Menu push started — waiting on ${expected} channel${expected === 1 ? '' : 's'}…`
        )
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantOrderOutPushChannelsHistory(
            merchantId,
            variables.locationId,
            variables.menuId || 'all'
          ),
        })
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantOrderOutPushChannelsHistory(
            merchantId,
            variables.locationId,
            'all'
          ),
        })
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantOrderOutStatus(merchantId),
        })
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantOrderOutMenuSync(
            merchantId,
            variables.locationId,
            variables.menuId
          ),
        })
      } else {
        toast.error(result.error || 'Failed to push menu to channels')
      }
    },
    onError: () => {
      toast.error('Failed to push menu to channels')
    },
  })
}

export function useAdminPushChannelsHistory(
  merchantId: string,
  locationId: string,
  opts?: { menuId?: string; limit?: number }
) {
  return useQuery({
    queryKey: adminKeys.merchantOrderOutPushChannelsHistory(
      merchantId,
      locationId,
      opts?.menuId ?? 'all'
    ),
    queryFn: () => getAdminPushChannelsHistory(merchantId, locationId, opts),
    enabled: !!merchantId && !!locationId,
    staleTime: 10 * 1000,
    refetchInterval: (query) => {
      const rows = query.state.data?.data ?? []
      const hasActive = rows.some(
        (r) => r.syncStatus === 'pending' || r.syncStatus === 'syncing'
      )
      return hasActive ? 4000 : false
    },
  })
}

export function useAdminOrderOutSyncedMenusForLocation(
  merchantId: string,
  locationId: string
) {
  return useQuery({
    queryKey: adminKeys.merchantOrderOutSyncedMenusForLocation(
      merchantId,
      locationId
    ),
    queryFn: () =>
      getAdminOrderOutSyncedMenusForLocation(merchantId, locationId),
    enabled: !!merchantId && !!locationId,
    staleTime: 30 * 1000,
  })
}

export function useAdminPushChannelsLiveStatus(
  merchantId: string,
  syncId: string | null
) {
  return useQuery({
    queryKey: adminKeys.merchantOrderOutPushChannelsLive(
      merchantId,
      syncId ?? 'none'
    ),
    queryFn: () =>
      syncId
        ? getAdminPushChannelsLiveStatus(merchantId, syncId)
        : Promise.resolve({ success: true, data: null, error: null }),
    enabled: !!merchantId && !!syncId,
    staleTime: 2 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data?.data
      if (!data) return false
      const active =
        data.syncStatus === 'pending' || data.syncStatus === 'syncing'
      return active ? 3000 : false
    },
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
