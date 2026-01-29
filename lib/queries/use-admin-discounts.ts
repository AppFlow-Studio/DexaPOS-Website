'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listAdminDiscounts,
  getAdminDiscountById,
  createAdminDiscount,
  updateAdminDiscount,
  toggleAdminDiscountActive,
  deleteAdminDiscount,
  bulkUpdateAdminDiscountStatus,
  bulkDeleteAdminDiscounts,
  getAdminDiscountUsage,
} from '@/app/manage/actions/admin-merchant/discounts'
import {
  listCategoriesForMerchant,
  listMenuItemsForMerchant,
} from '@/app/dashboard/actions/discounts'
import {
  Discount,
  DiscountFormInput,
  DiscountListFilters,
} from '@/types/discount'
import { toast } from 'sonner'

export function useAdminDiscounts(merchantId: string, filters: DiscountListFilters) {
  return useQuery({
    queryKey: ['admin-discounts', merchantId, filters],
    queryFn: () => listAdminDiscounts(merchantId, filters),
    enabled: !!merchantId,
  })
}

export function useAdminDiscount(merchantId: string, discountId: string | null) {
  return useQuery({
    queryKey: ['admin-discount', merchantId, discountId],
    queryFn: () =>
      discountId
        ? getAdminDiscountById(merchantId, discountId)
        : Promise.resolve({ success: false as const, error: 'No id' }),
    enabled: !!merchantId && !!discountId,
  })
}

export function useAdminDiscountUsage(merchantId: string, discountId: string | null) {
  return useQuery({
    queryKey: ['admin-discount-usage', merchantId, discountId],
    queryFn: () =>
      discountId
        ? getAdminDiscountUsage(merchantId, discountId)
        : Promise.resolve({ success: false as const, error: 'No id' }),
    enabled: !!merchantId && !!discountId,
  })
}

export function useAdminCreateDiscount(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DiscountFormInput) => createAdminDiscount(merchantId, input),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Discount created')
        queryClient.invalidateQueries({ queryKey: ['admin-discounts', merchantId] })
      } else {
        toast.error(result.error || 'Failed to create discount')
      }
    },
    onError: () => {
      toast.error('Failed to create discount')
    },
  })
}

export function useAdminUpdateDiscount(merchantId: string, discountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DiscountFormInput) => updateAdminDiscount(merchantId, discountId, input),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Discount updated')
        queryClient.invalidateQueries({ queryKey: ['admin-discounts', merchantId] })
        queryClient.invalidateQueries({ queryKey: ['admin-discount', merchantId, discountId] })
      } else {
        toast.error(result.error || 'Failed to update discount')
      }
    },
    onError: () => {
      toast.error('Failed to update discount')
    },
  })
}

export function useAdminToggleDiscount(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleAdminDiscountActive(merchantId, id, isActive),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Status updated')
      } else {
        toast.error(result.error || 'Failed to update status')
      }
      queryClient.invalidateQueries({ queryKey: ['admin-discounts', merchantId] })
    },
  })
}

export function useAdminDeleteDiscount(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode?: 'soft' | 'hard' }) =>
      deleteAdminDiscount(merchantId, id, mode),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Discount deleted')
        queryClient.invalidateQueries({ queryKey: ['admin-discounts', merchantId] })
      } else {
        toast.error(result.error || 'Failed to delete discount')
      }
    },
  })
}

export function useAdminBulkStatusUpdate(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, isActive }: { ids: string[]; isActive: boolean }) =>
      bulkUpdateAdminDiscountStatus(merchantId, ids, isActive),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Discounts updated')
        queryClient.invalidateQueries({ queryKey: ['admin-discounts', merchantId] })
      } else {
        toast.error(result.error || 'Failed to update discounts')
      }
    },
  })
}

export function useAdminBulkDelete(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, mode }: { ids: string[]; mode?: 'soft' | 'hard' }) =>
      bulkDeleteAdminDiscounts(merchantId, ids, mode),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Discounts deleted')
        queryClient.invalidateQueries({ queryKey: ['admin-discounts', merchantId] })
      } else {
        toast.error(result.error || 'Failed to delete discounts')
      }
    },
  })
}

export function useAdminDiscountCategories(merchantId: string) {
  return useQuery({
    queryKey: ['admin-discount-categories', merchantId],
    queryFn: () => listCategoriesForMerchant(merchantId),
    enabled: !!merchantId,
  })
}

export function useAdminDiscountMenuItems(merchantId: string) {
  return useQuery({
    queryKey: ['admin-discount-menu-items', merchantId],
    queryFn: () => listMenuItemsForMerchant(merchantId),
    enabled: !!merchantId,
  })
}
