'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    listDiscounts,
    getDiscountById,
    createDiscount,
    updateDiscount,
    toggleDiscountActive,
    deleteDiscount,
    bulkUpdateDiscountStatus,
    bulkDeleteDiscounts,
    getDiscountUsage,
    listCategoriesForMerchant,
    listMenuItemsForMerchant,
} from '@/app/dashboard/actions/discounts'
import { Discount, DiscountFormInput, DiscountListFilters } from '@/types/discount'
import { toast } from 'sonner'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import { useMerchantId } from '@/app/dashboard/hooks/useLocationScopedModifiers'

export function useDiscounts(filters: DiscountListFilters) {
    return useQuery({
        queryKey: ['discounts', filters],
        queryFn: () => listDiscounts(filters),
    })
}

export function useDiscount(discountId: string | null) {
    return useQuery({
        queryKey: ['discount', discountId],
        queryFn: () => (discountId ? getDiscountById(discountId) : Promise.resolve({ success: false, error: 'No id' })),
        enabled: !!discountId,
    })
}

export function useDiscountUsage(discountId: string | null) {
    return useQuery({
        queryKey: ['discount-usage', discountId],
        queryFn: () => (discountId ? getDiscountUsage(discountId) : Promise.resolve({ success: false, error: 'No id' })),
        enabled: !!discountId,
    })
}

export function useCreateDiscount() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: DiscountFormInput) => createDiscount(input),
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Discount created')
                queryClient.invalidateQueries({ queryKey: ['discounts'] })
            } else {
                toast.error(result.error || 'Failed to create discount')
            }
        },
        onError: () => {
            toast.error('Failed to create discount')
        },
    })
}

export function useUpdateDiscount(discountId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: DiscountFormInput) => updateDiscount(discountId, input),
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Discount updated')
                queryClient.invalidateQueries({ queryKey: ['discounts'] })
                queryClient.invalidateQueries({ queryKey: ['discount', discountId] })
            } else {
                toast.error(result.error || 'Failed to update discount')
            }
        },
        onError: () => {
            toast.error('Failed to update discount')
        },
    })
}

export function useToggleDiscount() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => toggleDiscountActive(id, isActive),
        onMutate: async ({ id, isActive }) => {
            await queryClient.cancelQueries({ queryKey: ['discounts'] })
            const previous = queryClient.getQueryData<{ success: boolean; data?: Discount[] }>(['discounts'])
            if (previous?.data) {
                const next: Discount[] = previous.data.map((d) => (d.id === id ? { ...d, is_active: isActive } : d))
                queryClient.setQueryData(['discounts'], { success: true, data: next })
            }
            return { previous }
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(['discounts'], context.previous)
            }
            toast.error('Failed to update status')
        },
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Status updated')
            } else {
                toast.error(result.error || 'Failed to update status')
            }
            queryClient.invalidateQueries({ queryKey: ['discounts'] })
        },
    })
}

export function useDeleteDiscount() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, mode }: { id: string; mode?: 'soft' | 'hard' }) => deleteDiscount(id, mode),
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Discount deleted')
                queryClient.invalidateQueries({ queryKey: ['discounts'] })
            } else {
                toast.error(result.error || 'Failed to delete discount')
            }
        },
        onError: () => {
            toast.error('Failed to delete discount')
        },
    })
}

export function useBulkStatusUpdate() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ ids, isActive }: { ids: string[]; isActive: boolean }) =>
            bulkUpdateDiscountStatus(ids, isActive),
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Discounts updated')
                queryClient.invalidateQueries({ queryKey: ['discounts'] })
            } else {
                toast.error(result.error || 'Failed to update discounts')
            }
        },
        onError: () => {
            toast.error('Failed to update discounts')
        },
    })
}

export function useBulkDelete() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ ids, mode }: { ids: string[]; mode?: 'soft' | 'hard' }) => bulkDeleteDiscounts(ids, mode),
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Discounts deleted')
                queryClient.invalidateQueries({ queryKey: ['discounts'] })
            } else {
                toast.error(result.error || 'Failed to delete discounts')
            }
        },
        onError: () => {
            toast.error('Failed to delete discounts')
        },
    })
}

export function useDiscountCategories() {
    const merchantId = useMerchantId()
    console.log('merchantId', merchantId)
    return useQuery({
        queryKey: ['discount-categories'],
        queryFn: () => listCategoriesForMerchant(merchantId),
    })
}

export function useDiscountMenuItems() {
    const merchantId = useMerchantId()
    console.log('merchantId', merchantId)
    return useQuery({
        queryKey: ['discount-menu-items'],
        queryFn: () => listMenuItemsForMerchant(merchantId),
    })
}

