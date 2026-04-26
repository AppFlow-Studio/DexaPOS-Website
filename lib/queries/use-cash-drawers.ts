'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  listCashDrawers,
  createCashDrawer,
  updateCashDrawer,
  openCashDrawerSession,
  closeCashDrawerSession,
  type CashDrawerListItem,
} from '@/app/dashboard/actions/cash-drawers'
import {
  adminListCashDrawers,
  adminCreateCashDrawer,
  adminUpdateCashDrawer,
  adminDeactivateCashDrawer,
  type AdminCashDrawerListItem,
} from '@/app/manage/actions/admin-merchant/cash-drawers'

export type { CashDrawerListItem, AdminCashDrawerListItem }

// ============================================================================
// MERCHANT HOOKS (read merchant scope from clerkOrgId)
// ============================================================================

export function useCashDrawers(
  clerkOrgId: string | null | undefined,
  locationId: string | 'all'
) {
  return useQuery<CashDrawerListItem[]>({
    queryKey: ['cash-drawers', clerkOrgId ?? null, locationId, 'merchant'],
    queryFn: async () => {
      if (!clerkOrgId) return []
      const result = await listCashDrawers(clerkOrgId, locationId)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    enabled: !!clerkOrgId,
    staleTime: 30 * 1000,
  })
}

function invalidateMerchant(queryClient: ReturnType<typeof useQueryClient>, clerkOrgId: string) {
  queryClient.invalidateQueries({ queryKey: ['cash-drawers', clerkOrgId] })
}

export function useCreateCashDrawer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      input,
    }: {
      clerkOrgId: string
      input: {
        locationId: string
        name: string
        drawer_number?: number | null
        station_id?: string | null
      }
    }) => createCashDrawer(clerkOrgId, input),
    onSuccess: (result, { clerkOrgId }) => {
      if (result.success) {
        invalidateMerchant(queryClient, clerkOrgId)
        toast.success('Cash drawer created')
      } else {
        toast.error(result.error || 'Failed to create cash drawer')
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create cash drawer')
    },
  })
}

export function useUpdateCashDrawer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      drawerId,
      input,
    }: {
      clerkOrgId: string
      drawerId: string
      input: {
        name?: string
        drawer_number?: number | null
        station_id?: string | null
        is_active?: boolean
      }
    }) => updateCashDrawer(clerkOrgId, drawerId, input),
    onSuccess: (result, { clerkOrgId, input }) => {
      if (result.success) {
        invalidateMerchant(queryClient, clerkOrgId)
        toast.success(input.is_active === false ? 'Cash drawer deactivated' : 'Cash drawer updated')
      } else {
        toast.error(result.error || 'Failed to update cash drawer')
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update cash drawer')
    },
  })
}

export function useOpenCashDrawerSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      input,
    }: {
      clerkOrgId: string
      input: {
        cashDrawerId: string
        openingAmount: number
        openingCountDetails?: Record<string, unknown> | null
        isBlindCount?: boolean
        businessDate?: string
      }
    }) => openCashDrawerSession(clerkOrgId, input),
    onSuccess: (result, { clerkOrgId }) => {
      if (result.success) {
        invalidateMerchant(queryClient, clerkOrgId)
        toast.success('Cash drawer session opened')
      } else {
        toast.error(result.error || 'Failed to open session')
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to open session')
    },
  })
}

export function useCloseCashDrawerSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      input,
    }: {
      clerkOrgId: string
      input: {
        sessionId: string
        closingAmount: number
        closingCountDetails?: Record<string, unknown> | null
        varianceNotes?: string | null
      }
    }) => closeCashDrawerSession(clerkOrgId, input),
    onSuccess: (result, { clerkOrgId }) => {
      if (result.success) {
        invalidateMerchant(queryClient, clerkOrgId)
        const sign = result.variance >= 0 ? '+' : ''
        toast.success(
          `Session closed. Variance ${sign}$${result.variance.toFixed(2)}`
        )
      } else {
        toast.error(result.error || 'Failed to close session')
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to close session')
    },
  })
}

// ============================================================================
// HQ ADMIN HOOKS (merchant scope from internal merchantId UUID)
// ============================================================================

export function useAdminCashDrawers(
  merchantId: string | null | undefined,
  locationId: string | 'all'
) {
  return useQuery<AdminCashDrawerListItem[]>({
    queryKey: ['cash-drawers', merchantId ?? null, locationId, 'admin'],
    queryFn: async () => {
      if (!merchantId) return []
      const result = await adminListCashDrawers(merchantId, locationId)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    enabled: !!merchantId,
    staleTime: 30 * 1000,
  })
}

function invalidateAdmin(
  queryClient: ReturnType<typeof useQueryClient>,
  merchantId: string
) {
  queryClient.invalidateQueries({ queryKey: ['cash-drawers', merchantId] })
}

export function useAdminCreateCashDrawer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      merchantId,
      input,
    }: {
      merchantId: string
      input: {
        locationId: string
        name: string
        drawer_number?: number | null
        station_id?: string | null
      }
    }) => adminCreateCashDrawer(merchantId, input),
    onSuccess: (result, { merchantId }) => {
      if (result.success) {
        invalidateAdmin(queryClient, merchantId)
        toast.success('Cash drawer created')
      } else {
        toast.error(result.error || 'Failed to create cash drawer')
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create cash drawer')
    },
  })
}

export function useAdminUpdateCashDrawer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      merchantId,
      drawerId,
      input,
    }: {
      merchantId: string
      drawerId: string
      input: {
        name?: string
        drawer_number?: number | null
        station_id?: string | null
        is_active?: boolean
      }
    }) => adminUpdateCashDrawer(merchantId, drawerId, input),
    onSuccess: (result, { merchantId, input }) => {
      if (result.success) {
        invalidateAdmin(queryClient, merchantId)
        toast.success(input.is_active === false ? 'Cash drawer deactivated' : 'Cash drawer updated')
      } else {
        toast.error(result.error || 'Failed to update cash drawer')
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update cash drawer')
    },
  })
}

export function useAdminDeactivateCashDrawer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      merchantId,
      drawerId,
    }: {
      merchantId: string
      drawerId: string
    }) => adminDeactivateCashDrawer(merchantId, drawerId),
    onSuccess: (result, { merchantId }) => {
      if (result.success) {
        invalidateAdmin(queryClient, merchantId)
        toast.success('Cash drawer deactivated')
      } else {
        toast.error(result.error || 'Failed to deactivate cash drawer')
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate cash drawer')
    },
  })
}
