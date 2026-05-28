'use client'

import { useQuery } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'

// Analytics actions
import {
  getAdminOrderAnalytics,
  getAdminFinancialKPIs,
  getAdminSalesByDate,
  getAdminBestSellingItems,
  type AdminOrderAnalytics,
  type AdminFinancialKPIs,
  type AdminSalesByDate,
  type AdminBestSellingItem,
} from '@/app/manage/actions/admin-merchant/analytics'

import {
  getMerchantDetails,
  updateMerchantSettings,
  updateMerchantOnboardingStatus,
} from '@/app/manage/actions/merchants'

import type {
  MerchantDetails,
  MerchantSettingsUpdate,
  MerchantOnboardingStatus,
  UpdateMerchantResult,
  UpdateMerchantStatusResult,
} from '@/types/merchant'
import type { Location } from '@/types/merchant_locations'
import { adminGetMerchantLocationById } from '@/app/manage/actions/admin-merchant/locations'

// Orders actions
import {
  getAdminOrders,
  getAdminOrderDetails,
  getAdminOrderStats,
  getAdminRecentOrders,
  type AdminOrderFilters,
  type AdminOrdersResponse,
  type AdminOrderDetails,
  type AdminOrderStats,
  type AdminOrder,
} from '@/app/manage/actions/admin-merchant/orders'

// Transactions actions
import {
  getAdminTransactions,
  getAdminTransactionSummary,
  getAdminPaymentMethodsBreakdown,
  getAdminDailyRevenue,
  type AdminTransactionFilters,
  type AdminTransactionsResponse,
  type AdminTransactionSummary,
  type PaymentMethodBreakdown,
  type DailyRevenue,
} from '@/app/manage/actions/admin-merchant/transactions'

// ============================================================================
// DATE HELPERS
// ============================================================================

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getDefaultDateRange() {
  const now = new Date()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  return {
    from: toDateString(thirtyDaysAgo),
    to: toDateString(now),
  }
}

// ============================================================================
// MERCHANT DETAILS HOOK
// ============================================================================

export function useAdminMerchantDetails(merchantId: string) {
  return useQuery<MerchantDetails | null>({
    queryKey: adminKeys.merchantDetail(merchantId),
    queryFn: () => getMerchantDetails(merchantId),
    enabled: !!merchantId,
    // Longer stale time since merchant details don't change often
    staleTime: 10 * 60 * 1000, 
  })
}

export function useAdminMerchantLocationDetails(
  merchantId: string,
  locationId: string | null,
  enabled: boolean = true
) {
  return useQuery<Location | null>({
    queryKey: adminKeys.merchantLocationDetail(merchantId, locationId || ''),
    queryFn: async () => {
      if (!locationId) return null

      const result = await adminGetMerchantLocationById(merchantId, locationId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch location details')
      }

      return result.data
    },
    enabled: enabled && !!merchantId && !!locationId,
    staleTime: 5 * 60 * 1000,
  })
}

import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useAdminUpdateMerchant() {
  const queryClient = useQueryClient()

  return useMutation<UpdateMerchantResult, Error, { merchantId: string; updates: MerchantSettingsUpdate }>({
    mutationFn: ({ merchantId, updates }) => updateMerchantSettings(merchantId, updates),
    onSuccess: (result, variables) => {
      if (result.success) {
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantDetail(variables.merchantId),
        })
      }
    },
  })
}

export function useAdminUpdateMerchantStatus() {
  const queryClient = useQueryClient()

  return useMutation<
    UpdateMerchantStatusResult,
    Error,
    { merchantId: string; newStatus: Extract<MerchantOnboardingStatus, 'active' | 'suspended' | 'cancelled'>; reason?: string }
  >({
    mutationFn: ({ merchantId, newStatus, reason }) =>
      updateMerchantOnboardingStatus({ merchantId, newStatus, reason }),
    onSuccess: (result, variables) => {
      if (result.success) {
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantDetail(variables.merchantId),
        })
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchants(),
        })
      }
    },
  })
}

// ============================================================================
// ANALYTICS HOOKS
// ============================================================================

export function useAdminOrderAnalytics(
  merchantId: string,
  dateFrom?: Date,
  dateTo?: Date,
  locationId?: string | null
) {
  const now = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  const from = dateFrom || defaultFrom
  const to = dateTo || now

  return useQuery<AdminOrderAnalytics>({
    queryKey: adminKeys.merchantOrderAnalytics(
      merchantId,
      { from: toDateString(from), to: toDateString(to) },
      locationId
    ),
    queryFn: () => getAdminOrderAnalytics(merchantId, from, to, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useAdminFinancialKPIs(
  merchantId: string,
  dateFrom?: Date,
  dateTo?: Date,
  locationId?: string | null
) {
  const now = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  const from = dateFrom || defaultFrom
  const to = dateTo || now

  return useQuery<AdminFinancialKPIs | null>({
    queryKey: adminKeys.merchantFinancialKPIs(
      merchantId,
      { from: toDateString(from), to: toDateString(to) },
      locationId
    ),
    queryFn: () => getAdminFinancialKPIs(merchantId, from, to, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdminSalesByDate(
  merchantId: string,
  dateFrom?: Date,
  dateTo?: Date,
  locationId?: string | null
) {
  const now = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  const from = dateFrom || defaultFrom
  const to = dateTo || now

  return useQuery<AdminSalesByDate[]>({
    queryKey: adminKeys.merchantSalesByDate(
      merchantId,
      { from: toDateString(from), to: toDateString(to) },
      locationId
    ),
    queryFn: () => getAdminSalesByDate(merchantId, from, to, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdminBestSellingItems(
  merchantId: string,
  dateFrom?: Date,
  dateTo?: Date,
  locationId?: string | null,
  limit: number = 10
) {
  const now = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  const from = dateFrom || defaultFrom
  const to = dateTo || now

  return useQuery<AdminBestSellingItem[]>({
    queryKey: adminKeys.merchantBestSellingItems(
      merchantId,
      { from: toDateString(from), to: toDateString(to) },
      locationId,
      limit
    ),
    queryFn: () =>
      getAdminBestSellingItems(merchantId, from, to, locationId, limit),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

// ============================================================================
// ORDERS HOOKS
// ============================================================================

export function useAdminOrders(
  merchantId: string,
  filters: AdminOrderFilters = {},
  page: number = 1,
  pageSize: number = 20
) {
  return useQuery<AdminOrdersResponse>({
    queryKey: adminKeys.merchantOrdersList(merchantId, filters, page, pageSize),
    queryFn: () => getAdminOrders(merchantId, filters, page, pageSize),
    enabled: !!merchantId,
    staleTime: 2 * 60 * 1000, // 2 minutes - orders change more frequently
  })
}

export function useAdminOrderDetails(
  merchantId: string,
  orderId: string | null
) {
  return useQuery<AdminOrderDetails | null>({
    queryKey: adminKeys.merchantOrderDetails(merchantId, orderId || ''),
    queryFn: () =>
      orderId ? getAdminOrderDetails(merchantId, orderId) : null,
    enabled: !!merchantId && !!orderId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useAdminOrderStats(
  merchantId: string,
  dateFrom?: Date,
  dateTo?: Date,
  locationId?: string
) {
  const dateRange =
    dateFrom && dateTo
      ? { from: toDateString(dateFrom), to: toDateString(dateTo) }
      : undefined

  return useQuery<AdminOrderStats>({
    queryKey: adminKeys.merchantOrderStats(merchantId, dateRange, locationId),
    queryFn: () => getAdminOrderStats(merchantId, dateFrom, dateTo, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdminRecentOrders(merchantId: string, limit: number = 5) {
  return useQuery<AdminOrder[]>({
    queryKey: adminKeys.merchantRecentOrders(merchantId, limit),
    queryFn: () => getAdminRecentOrders(merchantId, limit),
    enabled: !!merchantId,
    staleTime: 1 * 60 * 1000, // 1 minute - recent orders need to be fresh
  })
}

// ============================================================================
// TRANSACTIONS HOOKS
// ============================================================================

export function useAdminTransactions(
  merchantId: string,
  filters: AdminTransactionFilters = {},
  page: number = 1,
  pageSize: number = 20
) {
  return useQuery<AdminTransactionsResponse>({
    queryKey: adminKeys.merchantTransactions(
      merchantId,
      filters,
      page,
      pageSize
    ),
    queryFn: () => getAdminTransactions(merchantId, filters, page, pageSize),
    enabled: !!merchantId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useAdminTransactionSummary(
  merchantId: string,
  dateFrom?: Date,
  dateTo?: Date,
  locationId?: string | null
) {
  const now = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  const from = dateFrom || defaultFrom
  const to = dateTo || now

  return useQuery<AdminTransactionSummary>({
    queryKey: adminKeys.merchantTransactionSummary(
      merchantId,
      { from: toDateString(from), to: toDateString(to) },
      locationId
    ),
    queryFn: () =>
      getAdminTransactionSummary(merchantId, from, to, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdminPaymentMethodsBreakdown(
  merchantId: string,
  dateFrom?: Date,
  dateTo?: Date,
  locationId?: string | null
) {
  const now = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  const from = dateFrom || defaultFrom
  const to = dateTo || now

  return useQuery<PaymentMethodBreakdown[]>({
    queryKey: adminKeys.merchantPaymentMethodsBreakdown(
      merchantId,
      { from: toDateString(from), to: toDateString(to) },
      locationId
    ),
    queryFn: () =>
      getAdminPaymentMethodsBreakdown(merchantId, from, to, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdminDailyRevenue(
  merchantId: string,
  dateFrom?: Date,
  dateTo?: Date,
  locationId?: string | null
) {
  const now = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  const from = dateFrom || defaultFrom
  const to = dateTo || now

  return useQuery<DailyRevenue[]>({
    queryKey: adminKeys.merchantDailyRevenue(
      merchantId,
      { from: toDateString(from), to: toDateString(to) },
      locationId
    ),
    queryFn: () => getAdminDailyRevenue(merchantId, from, to, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

// ============================================================================
// MENU HOOKS
// ============================================================================

// Menu actions
import {
  getAdminMenus,
  getAdminMenuWithCategories,
  getAdminMenuItems,
  getAdminMenuItemDetails,
  getAdminCategories,
  getAdminCategoryWithItems,
  getAdminModifierGroups,
  getAdminModifierGroupDetails,
  getAdminMenuStats,
  getItemModifierGroups,
  type AdminMenu,
  type AdminMenuWithCategories,
  type AdminMenuItem,
  type AdminMenuItemsFilters,
  type AdminMenuItemsResponse,
  type AdminCategory,
  type AdminCategoryWithItems,
  type AdminModifierGroup,
  type AdminModifierGroupWithItems,
  type AdminMenuStats,
  type AdminMenuItemModifierGroup,
  type PriceSource,
} from '@/app/manage/actions/admin-merchant/menus'

// Schedule actions
import {
  getAdminSchedules,
  getMenuSchedules,
  getCategorySchedules,
  type AdminSchedule,
} from '@/app/manage/actions/admin-merchant/schedules'

export function useAdminMenus(merchantId: string, locationId?: string | null) {
  return useQuery<AdminMenu[]>({
    queryKey: adminKeys.merchantMenus(merchantId, locationId),
    queryFn: () => getAdminMenus(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdminMenuWithCategories(
  merchantId: string,
  menuId: string | null,
  locationId?: string | null
) {
  return useQuery<AdminMenuWithCategories | null>({
    queryKey: adminKeys.merchantMenuWithCategories(
      merchantId,
      menuId || '',
      locationId
    ),
    queryFn: () =>
      menuId ? getAdminMenuWithCategories(merchantId, menuId, locationId) : null,
    enabled: !!merchantId && !!menuId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useAdminMenuItems(
  merchantId: string,
  locationId?: string | null,
  filters?: AdminMenuItemsFilters
) {
  return useQuery<AdminMenuItemsResponse>({
    queryKey: adminKeys.merchantMenuItems(merchantId, locationId, filters),
    queryFn: () => getAdminMenuItems(merchantId, locationId, filters),
    enabled: !!merchantId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useAdminMenuItemDetails(
  merchantId: string,
  itemId: string | null,
  locationId?: string | null
) {
  return useQuery<AdminMenuItem | null>({
    queryKey: adminKeys.merchantMenuItemDetail(
      merchantId,
      itemId || '',
      locationId
    ),
    queryFn: () =>
      itemId ? getAdminMenuItemDetails(merchantId, itemId, locationId) : null,
    enabled: !!merchantId && !!itemId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useAdminCategories(
  merchantId: string,
  locationId?: string | null
) {
  return useQuery<AdminCategory[]>({
    queryKey: adminKeys.merchantCategories(merchantId, locationId),
    queryFn: () => getAdminCategories(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdminCategoryWithItems(
  merchantId: string,
  categoryId: string | null,
  locationId?: string | null
) {
  return useQuery<AdminCategoryWithItems | null>({
    queryKey: adminKeys.merchantCategoryWithItems(
      merchantId,
      categoryId || '',
      locationId
    ),
    queryFn: () =>
      categoryId
        ? getAdminCategoryWithItems(merchantId, categoryId, locationId)
        : null,
    enabled: !!merchantId && !!categoryId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useAdminModifierGroups(
  merchantId: string,
  locationId?: string | null
) {
  return useQuery<AdminModifierGroup[]>({
    queryKey: adminKeys.merchantModifiers(merchantId, locationId),
    queryFn: () => getAdminModifierGroups(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdminModifierGroupDetails(
  merchantId: string,
  groupId: string | null,
  locationId?: string | null
) {
  return useQuery<AdminModifierGroupWithItems | null>({
    queryKey: adminKeys.merchantModifierDetail(
      merchantId,
      groupId || '',
      locationId
    ),
    queryFn: () =>
      groupId
        ? getAdminModifierGroupDetails(merchantId, groupId, locationId)
        : null,
    enabled: !!merchantId && !!groupId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useAdminItemModifierGroups(
  merchantId: string,
  itemId: string | null
) {
  return useQuery<AdminMenuItemModifierGroup[]>({
    queryKey: adminKeys.merchantItemModifiers(merchantId, itemId || ''),
    queryFn: () => (itemId ? getItemModifierGroups(merchantId, itemId) : []),
    enabled: !!merchantId && !!itemId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useAdminMenuStats(
  merchantId: string,
  locationId?: string | null
) {
  return useQuery<AdminMenuStats>({
    queryKey: adminKeys.merchantMenuStats(merchantId, locationId),
    queryFn: () => getAdminMenuStats(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

// ============================================================================
// SCHEDULES HOOKS
// ============================================================================

export function useAdminSchedules(
  merchantId: string,
  locationId: string | null
) {
  return useQuery<AdminSchedule[]>({
    queryKey: adminKeys.merchantSchedules(merchantId, locationId),
    queryFn: () => getAdminSchedules(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdminMenuSchedules(
  merchantId: string,
  menuId: string | null
) {
  return useQuery<AdminSchedule[]>({
    queryKey: adminKeys.merchantMenuSchedules(merchantId, menuId || ''),
    queryFn: () => (menuId ? getMenuSchedules(merchantId, menuId) : []),
    enabled: !!merchantId && !!menuId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdminCategorySchedules(
  merchantId: string,
  categoryId: string | null
) {
  return useQuery<AdminSchedule[]>({
    queryKey: adminKeys.merchantCategorySchedules(merchantId, categoryId || ''),
    queryFn: () => (categoryId ? getCategorySchedules(merchantId, categoryId) : []),
    enabled: !!merchantId && !!categoryId,
    staleTime: 5 * 60 * 1000,
  })
}

// ============================================================================
// TYPE EXPORTS (Re-export for convenience)
// ============================================================================

export type {
  // Analytics
  AdminOrderAnalytics,
  AdminFinancialKPIs,
  AdminSalesByDate,
  AdminBestSellingItem,
  // Orders
  AdminOrderFilters,
  AdminOrdersResponse,
  AdminOrderDetails,
  AdminOrderStats,
  AdminOrder,
  // Transactions
  AdminTransactionFilters,
  AdminTransactionsResponse,
  AdminTransactionSummary,
  PaymentMethodBreakdown,
  DailyRevenue,
  // Menu
  AdminMenu,
  AdminMenuWithCategories,
  AdminMenuItem,
  AdminMenuItemsFilters,
  AdminMenuItemsResponse,
  AdminCategory,
  AdminCategoryWithItems,
  AdminModifierGroup,
  AdminModifierGroupWithItems,
  AdminMenuItemModifierGroup,
  AdminMenuStats,
  PriceSource,
  // Schedules
  AdminSchedule,
  // Merchant
  MerchantDetails,
}
