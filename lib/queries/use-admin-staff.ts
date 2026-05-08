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
  adminInviteClerkStaff,
  getMerchantLocationsForStaff,
  getMerchantStaffRoles,
  getAdminMerchantStaffStats,
  adminBulkDeactivateStaff,
  adminUpdateStaffProfile,
  adminUpdateStaffRole,
  adminUpdateStaffLocations,
  adminResendStaffInvite,
  getMerchantPendingStaffInvites,
  type AdminStaffLocationAssignmentInput,
} from '@/app/manage/actions/admin-merchant/staff'
import type { AdminCreateStaffData, AdminCreateClerkStaffData, AdminInviteClerkStaffData } from '@/types/staff'

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
 * Invite a Clerk dashboard user for a merchant via email (admin)
 */
export function useAdminInviteClerkStaff() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      data,
    }: {
      merchantId: string
      data: AdminInviteClerkStaffData
    }) => adminInviteClerkStaff(merchantId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantStaff(variables.merchantId),
      })
    },
  })
}

/**
 * Update a staff member's profile (name / email / phone)
 */
export function useAdminUpdateStaffProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      merchantId,
      staffProfileId,
      changes,
    }: {
      merchantId: string
      staffProfileId: string
      changes: {
        firstName?: string
        lastName?: string
        email?: string | null
        phone?: string | null
      }
    }) => adminUpdateStaffProfile(merchantId, staffProfileId, changes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.merchantStaff(variables.merchantId) })
    },
  })
}

/**
 * Update a staff member's role at a specific location
 */
export function useAdminUpdateStaffRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      merchantId,
      staffProfileId,
      locationId,
      newRoleCode,
    }: {
      merchantId: string
      staffProfileId: string
      locationId: string
      newRoleCode: string
    }) => adminUpdateStaffRole(merchantId, staffProfileId, locationId, newRoleCode),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.merchantStaff(variables.merchantId) })
    },
  })
}

/**
 * Replace a staff member's location assignments
 */
export function useAdminUpdateStaffLocations() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      merchantId,
      staffProfileId,
      assignments,
    }: {
      merchantId: string
      staffProfileId: string
      assignments: AdminStaffLocationAssignmentInput[]
    }) => adminUpdateStaffLocations(merchantId, staffProfileId, assignments),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.merchantStaff(variables.merchantId) })
    },
  })
}

/**
 * Pending invites for a merchant (for resend UI)
 */
export function useMerchantPendingStaffInvites(merchantId: string, enabled = true) {
  return useQuery({
    queryKey: [...adminKeys.merchantStaff(merchantId), 'pending-invites'],
    queryFn: () => getMerchantPendingStaffInvites(merchantId),
    enabled: !!merchantId && enabled,
    staleTime: 30 * 1000,
  })
}

/**
 * Resend a pending staff invite
 */
export function useAdminResendStaffInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ merchantId, inviteId }: { merchantId: string; inviteId: string }) =>
      adminResendStaffInvite(merchantId, inviteId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchantStaff(variables.merchantId), 'pending-invites'],
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
