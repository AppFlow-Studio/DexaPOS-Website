'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'
import {
  getAdminOnlineOrderingSettings,
  getAdminMerchantOnlineOrderingOverview,
  adminSaveOnlineOrderingSettings,
  adminToggleOnlineStore,
  adminRetriggerDomainWhitelist,
  adminApproveOnlineStoreRequest,
  adminRejectOnlineStoreRequest,
  adminUploadMerchantW9Pdf,
  getAdminOnlineStoreRequestRequirements,
  adminSaveOnlineStoreRequestRequirements,
} from '@/app/manage/actions/admin-merchant/online-ordering'

// ============================================================================
// Types (matching server action types)
// ============================================================================

interface DaySchedule {
  enabled: boolean
  from: string
  to: string
  is24Hours: boolean
}

interface WeeklySchedule {
  monday: DaySchedule
  tuesday: DaySchedule
  wednesday: DaySchedule
  thursday: DaySchedule
  friday: DaySchedule
  saturday: DaySchedule
  sunday: DaySchedule
}

interface TipConfig {
  calculationMethod: 'subtotal' | 'total'
  presetPercentages: number[]
  smartTipEnabled: boolean
  smartTipThreshold: number
  smartTipAmounts: number[]
  allowCustomTip: boolean
}

export interface MerchantOnlineStoreReviewPacket {
  legalBusinessName: string | null
  dbaName: string | null
  einTaxId: string | null
  w9FormUrl: string | null
  ownerFullName: string | null
  ownerSsn: string | null
  ownerDob: string | null
  ownerGovernmentIdUrl: string | null
}

export interface LocationOnlineStoreReviewPacket {
  bankName: string | null
  accountHolderName: string | null
  ddaAccountNumber: string | null
  routingNumber: string | null
  bankSupportDocumentUrl: string | null
}

export interface OnlineStoreReviewChecklist {
  legalBusinessName: boolean
  dbaName: boolean
  einTaxId: boolean
  w9Form: boolean
  ownerIdentity: boolean
  ownerGovernmentId: boolean
  bankingInfo: boolean
  bankSupportDocument: boolean
}

export interface OnlineOrderingSettings {
  id?: string
  locationId: string
  setupRequestStatus?: 'not_requested' | 'pending_review' | 'approved' | 'rejected' | 'setup_completed'
  setupRequestedAt?: string | null
  setupRequestedBy?: string | null
  setupReviewedAt?: string | null
  setupReviewedBy?: string | null
  setupApprovedAt?: string | null
  setupCompletedAt?: string | null
  setupRejectionReason?: string | null
  merchantReviewPacket?: MerchantOnlineStoreReviewPacket
  locationReviewPacket?: LocationOnlineStoreReviewPacket
  reviewChecklist?: OnlineStoreReviewChecklist
  enabled: boolean
  storeName: string
  storeSlug: string
  storeUrl?: string
  phone: string
  email: string
  address: string
  hideFromLocationPicker?: boolean
  dontMarkClosedOutsideHours?: boolean
  sendEmailOnNewOrder?: boolean
  notificationEmail?: string
  autoAcceptOrders?: boolean
  autoClosePaidOrders?: boolean
  operatingHours?: WeeklySchedule
  useCustomDeliveryHours?: boolean
  deliveryHours?: WeeklySchedule
  logoUrl?: string | null
  heroImageUrl?: string | null
  faviconUrl?: string | null
  bannerText?: string | null
  primaryColor?: string
  secondaryColor?: string
  headerStyle?: 'primary' | 'dark' | 'light'
  pickupEnabled?: boolean
  deliveryEnabled?: boolean
  preparationLeadTime?: number
  acceptFutureOrdersOnly?: boolean
  futureOrderMinDays?: number
  futureOrderMaxDays?: number
  minimumOrderAmount?: number
  acceptOnlinePayments?: boolean
  acceptCashOnDelivery?: boolean
  acceptCardOnDelivery?: boolean
  ipospaysDeviceId?: string | null
  ipospaysDeviceLabel?: string | null
  ipospaysTpn?: string
  ipospaysFtdEcomKey?: string
  ipospaysFtdEcomKeyConfigured?: boolean
  tippingEnabled?: boolean
  tipConfig?: TipConfig
  baseDeliveryFee?: number
  freeDeliveryThreshold?: number
  convenienceFeeEnabled?: boolean
  convenienceFeePercent?: number
  convenienceFeeFlat?: number
}

export interface LocationOnlineStoreOverview {
  locationId: string
  locationName: string
  hasOnlineStore: boolean
  setupRequestStatus: 'not_requested' | 'pending_review' | 'approved' | 'rejected' | 'setup_completed'
  setupRequestedAt: string | null
  setupReviewedAt: string | null
  setupCompletedAt: string | null
  setupRejectionReason: string | null
  isEnabled: boolean
  storeName: string
  storeSlug: string | null
}

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Get online ordering overview for all locations of a merchant
 */
export function useAdminOnlineOrderingOverview(merchantId: string) {
  return useQuery({
    queryKey: [...adminKeys.merchants(), merchantId, 'online-ordering-overview'],
    queryFn: () => getAdminMerchantOnlineOrderingOverview(merchantId),
    enabled: !!merchantId,
    staleTime: 30 * 1000,
  })
}

/**
 * Get online ordering settings for a specific location
 */
export function useAdminOnlineOrderingSettings(merchantId: string, locationId: string) {
  return useQuery({
    queryKey: [...adminKeys.merchants(), merchantId, 'online-ordering', locationId],
    queryFn: () => getAdminOnlineOrderingSettings(merchantId, locationId),
    enabled: !!merchantId && !!locationId,
    staleTime: 30 * 1000,
  })
}

export function useAdminOnlineStoreRequestRequirements(merchantId: string, locationId: string) {
  return useQuery({
    queryKey: [...adminKeys.merchants(), merchantId, 'online-ordering-requirements', locationId],
    queryFn: () => getAdminOnlineStoreRequestRequirements(merchantId, locationId),
    enabled: !!merchantId && !!locationId,
    staleTime: 10 * 1000,
  })
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Save online ordering settings for a location
 */
export function useAdminSaveOnlineOrderingSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      locationId,
      settings,
    }: {
      merchantId: string
      locationId: string
      settings: Partial<OnlineOrderingSettings>
    }) => adminSaveOnlineOrderingSettings(merchantId, locationId, settings),
    onSuccess: (_, variables) => {
      // Invalidate both the specific location and the overview
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'online-ordering'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'online-ordering-overview'],
      })
    },
  })
}

/**
 * Toggle online store enabled/disabled
 */
export function useAdminToggleOnlineStore() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      locationId,
      enabled,
    }: {
      merchantId: string
      locationId: string
      enabled: boolean
    }) => adminToggleOnlineStore(merchantId, locationId, enabled),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'online-ordering'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'online-ordering-overview'],
      })
    },
  })
}

export function useAdminRetriggerDomainWhitelist() {
  return useMutation({
    mutationFn: ({
      merchantId,
      locationId,
    }: {
      merchantId: string
      locationId: string
    }) => adminRetriggerDomainWhitelist(merchantId, locationId),
  })
}

export function useAdminSaveOnlineStoreRequestRequirements() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (formData: FormData) => adminSaveOnlineStoreRequestRequirements(formData),
    onSuccess: (_result, _variables, _context) => {
      // Caller should also refetch online-ordering settings, but this at least refreshes requirements.
      // We don't know merchantId/locationId here without duplicating formData parsing, so callers should invalidate explicitly if needed.
      queryClient.invalidateQueries({ queryKey: [...adminKeys.merchants()] })
    },
  })
}

export function useAdminApproveOnlineStoreRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      locationId,
    }: {
      merchantId: string
      locationId: string
    }) => adminApproveOnlineStoreRequest(merchantId, locationId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'online-ordering'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'online-ordering-overview'],
      })
    },
  })
}

export function useAdminRejectOnlineStoreRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      locationId,
      reason,
    }: {
      merchantId: string
      locationId: string
      reason: string
    }) => adminRejectOnlineStoreRequest(merchantId, locationId, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'online-ordering'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'online-ordering-overview'],
      })
    },
  })
}

export function useAdminUploadMerchantW9Pdf() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      file,
    }: {
      merchantId: string
      file: File
    }) => adminUploadMerchantW9Pdf(merchantId, file),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'online-ordering'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'online-ordering-overview'],
      })
    },
  })
}
