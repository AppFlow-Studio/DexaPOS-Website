// lib/queries/admin-keys.ts
// Query key factory for admin data caching with TanStack Query

import type { MerchantFilters } from '@/types/merchant'
import type { AdminOrderFilters } from '@/app/manage/actions/admin-merchant/orders'
import type { AdminTransactionFilters } from '@/app/manage/actions/admin-merchant/transactions'

export const adminKeys = {
  // Root key for all admin queries
  all: ['admin'] as const,

  // ============================================================================
  // MERCHANTS
  // ============================================================================

  merchants: () => [...adminKeys.all, 'merchants'] as const,

  merchantList: (filters: MerchantFilters, page: number) =>
    [...adminKeys.merchants(), 'list', filters, page] as const,

  merchantDetail: (id: string) =>
    [...adminKeys.merchants(), 'detail', id] as const,

  merchantLocationDetail: (merchantId: string, locationId: string) =>
    [...adminKeys.merchants(), merchantId, 'location-detail', locationId] as const,

  merchantStaff: (id: string) =>
    [...adminKeys.merchants(), id, 'staff'] as const,

  merchantOrders: (id: string, dateRange?: { from: string; to: string }) =>
    [...adminKeys.merchants(), id, 'orders', dateRange] as const,

  merchantAnalytics: (id: string, dateRange: { from: string; to: string }) =>
    [...adminKeys.merchants(), id, 'analytics', dateRange] as const,

  merchantHealthGrid: () => [...adminKeys.merchants(), 'health-grid'] as const,

  // ============================================================================
  // MERCHANT ANALYTICS (Admin View)
  // ============================================================================

  merchantOrderAnalytics: (
    merchantId: string,
    dateRange: { from: string; to: string },
    locationId?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'order-analytics',
      dateRange,
      locationId,
    ] as const,

  merchantFinancialKPIs: (
    merchantId: string,
    dateRange: { from: string; to: string },
    locationId?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'financial-kpis',
      dateRange,
      locationId,
    ] as const,

  merchantSalesByDate: (
    merchantId: string,
    dateRange: { from: string; to: string },
    locationId?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'sales-by-date',
      dateRange,
      locationId,
    ] as const,

  merchantBestSellingItems: (
    merchantId: string,
    dateRange: { from: string; to: string },
    locationId?: string | null,
    limit?: number
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'best-selling-items',
      dateRange,
      locationId,
      limit,
    ] as const,

  // ============================================================================
  // MERCHANT ORDERS (Admin View)
  // ============================================================================

  merchantOrdersList: (
    merchantId: string,
    filters: AdminOrderFilters,
    page: number,
    pageSize?: number
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'orders-list',
      filters,
      page,
      pageSize,
    ] as const,

  merchantOrderDetails: (merchantId: string, orderId: string) =>
    [...adminKeys.merchants(), merchantId, 'order-details', orderId] as const,

  merchantOrderStats: (
    merchantId: string,
    dateRange?: { from: string; to: string },
    locationId?: string
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'order-stats',
      dateRange,
      locationId,
    ] as const,

  merchantRecentOrders: (merchantId: string, limit?: number) =>
    [...adminKeys.merchants(), merchantId, 'recent-orders', limit] as const,

  // ============================================================================
  // MERCHANT TRANSACTIONS (Admin View)
  // ============================================================================

  merchantTransactions: (
    merchantId: string,
    filters: AdminTransactionFilters,
    page: number,
    pageSize?: number
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'transactions',
      filters,
      page,
      pageSize,
    ] as const,

  merchantTransactionSummary: (
    merchantId: string,
    dateRange: { from: string; to: string },
    locationId?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'transaction-summary',
      dateRange,
      locationId,
    ] as const,

  merchantPaymentMethodsBreakdown: (
    merchantId: string,
    dateRange: { from: string; to: string },
    locationId?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'payment-methods-breakdown',
      dateRange,
      locationId,
    ] as const,

  merchantDailyRevenue: (
    merchantId: string,
    dateRange: { from: string; to: string },
    locationId?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'daily-revenue',
      dateRange,
      locationId,
    ] as const,

  // ============================================================================
  // MERCHANT MENU (Admin View)
  // ============================================================================

  merchantMenus: (merchantId: string, locationId?: string | null) =>
    [...adminKeys.merchants(), merchantId, 'menus', locationId ?? 'all'] as const,

  merchantMenuWithCategories: (
    merchantId: string,
    menuId: string,
    locationId?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'menu-with-categories',
      menuId,
      locationId ?? 'all',
    ] as const,

  merchantMenuItems: (
    merchantId: string,
    locationId?: string | null,
    filters?: { categoryId?: string; search?: string; page?: number }
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'menu-items',
      locationId ?? 'all',
      filters,
    ] as const,

  merchantMenuItemDetail: (
    merchantId: string,
    itemId: string,
    locationId?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'menu-item-detail',
      itemId,
      locationId ?? 'all',
    ] as const,

  merchantCategories: (merchantId: string, locationId?: string | null) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'categories',
      locationId ?? 'all',
    ] as const,

  merchantCategoryWithItems: (
    merchantId: string,
    categoryId: string,
    locationId?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'category-with-items',
      categoryId,
      locationId ?? 'all',
    ] as const,

  merchantModifiers: (merchantId: string, locationId?: string | null) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'modifiers',
      locationId ?? 'all',
    ] as const,

  merchantModifierDetail: (
    merchantId: string,
    groupId: string,
    locationId?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'modifier-detail',
      groupId,
      locationId ?? 'all',
    ] as const,

  merchantItemModifiers: (merchantId: string, itemId: string) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'item',
      itemId,
      'modifiers',
    ] as const,

  merchantMenuStats: (merchantId: string, locationId?: string | null) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'menu-stats',
      locationId ?? 'all',
    ] as const,

  // Schedules
  merchantSchedules: (merchantId: string, locationId: string | null) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'schedules',
      locationId ?? 'all',
    ] as const,

  merchantScheduleDetail: (merchantId: string, scheduleId: string) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'schedule',
      scheduleId,
    ] as const,

  merchantMenuSchedules: (merchantId: string, menuId: string) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'menu',
      menuId,
      'schedules',
    ] as const,

  merchantCategorySchedules: (merchantId: string, categoryId: string) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'category',
      categoryId,
      'schedules',
    ] as const,

  merchantPrepStations: (merchantId: string, locationId?: string | null) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'prep-stations',
      locationId ?? 'all',
    ] as const,

  merchantCategoryPrepDefaults: (
    merchantId: string,
    locationId?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'category-prep-defaults',
      locationId ?? 'all',
    ] as const,

  // Timesheets
  merchantTimesheets: (merchantId: string, filters: any) =>
    [...adminKeys.merchants(), merchantId, 'timesheets', filters] as const,

  merchantTimesheetResources: (merchantId: string) =>
    [...adminKeys.merchants(), merchantId, 'timesheet-resources'] as const,

  // ============================================================================
  // MERCHANT CUSTOMERS (Admin View)
  // ============================================================================

  merchantCustomers: (
    merchantId: string,
    filters?: { search?: string; page?: number; pageSize?: number }
  ) => [...adminKeys.merchants(), merchantId, 'customers', filters] as const,

  merchantCustomerDetail: (merchantId: string, customerId: string) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'customer-detail',
      customerId,
    ] as const,

  // ============================================================================
  // MERCHANT INVENTORY (Admin View)
  // ============================================================================

  merchantInventory: (merchantId: string, locationId?: string | null) =>
    [...adminKeys.merchants(), merchantId, 'inventory', locationId] as const,

  // ============================================================================
  // MERCHANT FINANCIALS (Admin View)
  // ============================================================================

  merchantPayments: (
    merchantId: string,
    locationId?: string | null,
    filters?: Record<string, unknown>
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'payments',
      locationId ?? 'all',
      filters,
    ] as const,

  merchantInvoices: (
    merchantId: string,
    locationId?: string | null,
    status?: string | null
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'invoices',
      locationId ?? 'all',
      status ?? 'all',
    ] as const,

  merchantPlatformInvoices: (merchantId: string) =>
    [...adminKeys.merchants(), merchantId, 'platform-invoices'] as const,

  merchantTipSession: (
    merchantId: string,
    locationId: string,
    sessionDate: string,
    shiftPeriod: string
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'tips',
      'session',
      locationId,
      sessionDate,
      shiftPeriod,
    ] as const,

  merchantTipHistory: (merchantId: string, locationId: string) =>
    [...adminKeys.merchants(), merchantId, 'tips', 'history', locationId] as const,

  merchantVendors: (merchantId: string) =>
    [...adminKeys.merchants(), merchantId, 'vendors'] as const,

  // ============================================================================
  // MERCHANT DEVICES & STATIONS (Admin View)
  // ============================================================================

  merchantDevices: (merchantId: string, locationId?: string | null) =>
    [...adminKeys.merchants(), merchantId, 'devices', locationId] as const,

  merchantStations: (merchantId: string, locationId?: string | null) =>
    [...adminKeys.merchants(), merchantId, 'stations', locationId] as const,

  merchantStationStats: (merchantId: string, locationId?: string | null) =>
    [...adminKeys.merchants(), merchantId, 'station-stats', locationId] as const,

  merchantPaymentTerminals: (merchantId: string, locationId?: string | null) =>
    [...adminKeys.merchants(), merchantId, 'payment-terminals', locationId] as const,

  merchantTerminalStats: (merchantId: string, locationId?: string | null) =>
    [...adminKeys.merchants(), merchantId, 'terminal-stats', locationId] as const,

  merchantConnectedTerminals: (merchantId: string, locationId?: string | null) =>
    [...adminKeys.merchants(), merchantId, 'connected-terminals', locationId] as const,

  merchantTaxRates: (merchantId: string, locationId?: string | null) =>
    [...adminKeys.merchants(), merchantId, 'tax-rates', locationId] as const,

  // ============================================================================
  // MERCHANT AUDIT LOGS (Admin View)
  // ============================================================================

  merchantAuditLogs: (
    merchantId: string,
    filters?: {
      dateFrom?: string
      dateTo?: string
      severity?: string
      category?: string
      staffId?: string
      page?: number
      pageSize?: number
    }
  ) =>
    [...adminKeys.merchants(), merchantId, 'audit-logs', filters] as const,

  // ============================================================================
  // ORGANIZATIONS
  // ============================================================================

  organizations: () => [...adminKeys.all, 'organizations'] as const,

  organizationList: () => [...adminKeys.organizations(), 'list'] as const,

  organizationDetail: (id: string) =>
    [...adminKeys.organizations(), 'detail', id] as const,

  // ============================================================================
  // USERS
  // ============================================================================

  users: () => [...adminKeys.all, 'users'] as const,

  userList: () => [...adminKeys.users(), 'list'] as const,

  userDetail: (id: string) => [...adminKeys.users(), 'detail', id] as const,

  // ============================================================================
  // DASHBOARD
  // ============================================================================

  dashboardStats: () => [...adminKeys.all, 'dashboard-stats'] as const,

  // ============================================================================
  // AUDIT LOGS
  // ============================================================================

  auditLogs: () => [...adminKeys.all, 'audit-logs'] as const,

  auditLogList: (filters?: Record<string, unknown>) =>
    [...adminKeys.auditLogs(), 'list', filters] as const,

  // ============================================================================
  // PLATFORM CASH DRAWERS (HQ Cross-Merchant View)
  // ============================================================================

  platformCashDrawers: () => [...adminKeys.all, 'platform-cash-drawers'] as const,

  platformCashDrawerSessions: (
    filters: { merchantIds?: string[]; locationIds?: string[] },
    dateRange: { from: string; to: string }
  ) => [...adminKeys.platformCashDrawers(), 'sessions', filters, dateRange] as const,

  platformCashDrawerOperations: (sessionId: string) =>
    [...adminKeys.platformCashDrawers(), 'operations', sessionId] as const,

  platformCashDrawerNoSales: (
    filters: { merchantIds?: string[]; locationIds?: string[] },
    dateRange: { from: string; to: string }
  ) => [...adminKeys.platformCashDrawers(), 'no-sales', filters, dateRange] as const,

  platformCashDrawerStats: (
    filters: { merchantIds?: string[]; locationIds?: string[] },
    dateRange: { from: string; to: string }
  ) => [...adminKeys.platformCashDrawers(), 'stats', filters, dateRange] as const,

  platformCashDrawerVarianceTrend: (
    filters: { merchantIds?: string[]; locationIds?: string[] },
    dateRange: { from: string; to: string }
  ) => [...adminKeys.platformCashDrawers(), 'variance-trend', filters, dateRange] as const,

  // ============================================================================
  // MERCHANT ORDEROUT (Admin View)
  // ============================================================================

  merchantOrderOutStatus: (merchantId: string) =>
    [...adminKeys.merchants(), merchantId, 'orderout-status'] as const,

  merchantOrderOutMenuSync: (merchantId: string, locationId: string, menuId: string) =>
    [...adminKeys.merchants(), merchantId, 'orderout-menu-sync', locationId, menuId] as const,

  merchantOrderOutPayloadDiff: (merchantId: string, locationId: string, menuId: string) =>
    [...adminKeys.merchants(), merchantId, 'orderout-payload-diff', locationId, menuId] as const,

  merchantOrderOutPushChannelsHistory: (
    merchantId: string,
    locationId: string,
    menuId: string
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'orderout-push-channels-history',
      locationId,
      menuId,
    ] as const,

  merchantOrderOutPushChannelsLive: (merchantId: string, syncId: string) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'orderout-push-channels-live',
      syncId,
    ] as const,

  merchantOrderOutSyncedMenusForLocation: (
    merchantId: string,
    locationId: string
  ) =>
    [
      ...adminKeys.merchants(),
      merchantId,
      'orderout-synced-menus',
      locationId,
    ] as const,

  // ============================================================================
  // MERCHANT VALOR BOARDING (Admin View)
  // ============================================================================

  merchantValorBoarding: (merchantId: string) =>
    [...adminKeys.merchants(), merchantId, 'valor-boarding'] as const,
}
