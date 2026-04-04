'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CustomerListItem, CustomerProfile } from '@/types/customer'
import {
  adminAddCustomerTag,
  adminUpdateCustomerNotes,
  getAdminCustomerProfile,
  getAdminMerchantCustomers,
} from '@/app/manage/actions/admin-merchant/customers'

export function useAdminCustomers(clerkOrgId: string) {
  return useQuery<CustomerListItem[]>({
    queryKey: ['admin', 'customers', clerkOrgId],
    queryFn: () => getAdminMerchantCustomers(clerkOrgId),
    enabled: !!clerkOrgId,
    staleTime: 30 * 1000,
  })
}

export function useAdminCustomerProfile(customerId: string | null) {
  return useQuery<CustomerProfile | null>({
    queryKey: ['admin', 'customer', 'profile', customerId],
    queryFn: () => (customerId ? getAdminCustomerProfile(customerId) : null),
    enabled: !!customerId,
    staleTime: 15 * 1000,
  })
}

export function useAdminAddCustomerTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      customerId,
      tag,
    }: {
      customerId: string
      tag: string
    }) => adminAddCustomerTag(customerId, tag),
    onSuccess: (_, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'customer', 'profile', customerId],
      })
    },
  })
}

export function useAdminUpdateCustomerNotes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      customerId,
      notes,
    }: {
      customerId: string
      notes: string
    }) => adminUpdateCustomerNotes(customerId, notes),
    onSuccess: (_, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'customer', 'profile', customerId],
      })
    },
  })
}
