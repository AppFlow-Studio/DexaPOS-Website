'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'
import {
  getAdminMerchantStaff,
  adminResetStaffPin,
  adminBulkResetPins,
  adminResetStaffPassword,
  adminBulkResetPasswords,
  adminToggleStaffStatus,
  adminCreateStaff,
  adminCreateClerkStaff,
  getMerchantLocationsForStaff,
  getMerchantStaffRoles,
  getAdminMerchantStaffStats,
  adminBulkDeactivateStaff,
} from '@/app/manage/actions/admin-merchant/staff'
import type { AdminCreateStaffData, AdminCreateClerkStaffData } from '@/types/staff'

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Get unified staff view for a merchant
 */
export function useAdminMerchantStaff(merchantId: string, locationId?: string | null) {
  return useQuery({
    queryKey: adminKeys.merchantStaff(merchantId),
    queryFn: () => getAdminMerchantStaff(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 30 * 1000, // 30 seconds
  })
}

/**
 * Get staff statistics for a merchant
 */
export function useAdminMerchantStaffStats(merchantId: string) {
  return useQuery({
    queryKey: [...adminKeys.merchantStaff(merchantId), 'stats'],
    queryFn: () => getAdminMerchantStaffStats(merchantId),
    enabled: !!merchantId,
    staleTime: 30 * 1000,
  })
}

/**
 * Get locations for staff assignment dropdown
 */
export function useMerchantLocationsForStaff(merchantId: string) {
  return useQuery({
    queryKey: [...adminKeys.merchantDetail(merchantId), 'locations-for-staff'],
    queryFn: () => getMerchantLocationsForStaff(merchantId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Get available staff roles for assignment
 */
export function useMerchantStaffRoles() {
  return useQuery({
    queryKey: ['staff-roles'],
    queryFn: getMerchantStaffRoles,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Reset PIN for a single staff member
 */
export function useAdminResetStaffPin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      staffProfileId,
      locationId,
      customPin,
    }: {
      merchantId: string
      staffProfileId: string
      locationId: string
      customPin?: string
    }) => adminResetStaffPin(merchantId, staffProfileId, locationId, customPin),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantStaff(variables.merchantId),
      })
    },
  })
}

/**
 * Bulk reset PINs for all staff at a merchant/location
 */
export function useAdminBulkResetPins() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      locationId,
      customPin,
    }: {
      merchantId: string
      locationId?: string | null
      customPin?: string
    }) => adminBulkResetPins(merchantId, locationId, customPin),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantStaff(variables.merchantId),
      })
    },
  })
}

/**
 * Toggle staff active status
 */
export function useAdminToggleStaffStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      staffProfileId,
      locationId,
      newStatus,
    }: {
      merchantId: string
      staffProfileId: string
      locationId: string
      newStatus: boolean
    }) => adminToggleStaffStatus(merchantId, staffProfileId, locationId, newStatus),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantStaff(variables.merchantId),
      })
    },
  })
}

/**
 * Create a Clerk dashboard user for a merchant (admin)
 */
export function useAdminCreateClerkStaff() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      data,
    }: {
      merchantId: string
      data: AdminCreateClerkStaffData
    }) => adminCreateClerkStaff(merchantId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantStaff(variables.merchantId),
      })
    },
  })
}

/**
 * Bulk deactivate staff members by staff_profile_ids
 */
export function useAdminBulkDeactivateStaff() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      staffProfileIds,
    }: {
      merchantId: string
      staffProfileIds: string[]
    }) => adminBulkDeactivateStaff(merchantId, staffProfileIds),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantStaff(variables.merchantId),
      })
    },
  })
}

/**
 * Reset dashboard password for a single Clerk staff member (HQ)
 */
export function useAdminResetStaffPassword() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      clerkUserId,
      customPassword,
    }: {
      merchantId: string
      clerkUserId: string
      customPassword?: string
    }) => adminResetStaffPassword(merchantId, clerkUserId, customPassword),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantStaff(variables.merchantId),
      })
    },
  })
}

/**
 * Bulk reset dashboard passwords for all active Clerk staff at a merchant/location (HQ)
 */
export function useAdminBulkResetPasswords() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      locationId,
    }: {
      merchantId: string
      locationId?: string | null
    }) => adminBulkResetPasswords(merchantId, locationId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantStaff(variables.merchantId),
      })
    },
  })
}

/**
 * Create a new staff member
 */
export function useAdminCreateStaff() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      data,
    }: {
      merchantId: string
      data: AdminCreateStaffData
    }) => adminCreateStaff(merchantId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantStaff(variables.merchantId),
      })
    },
  })
}
