import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  getPlatformKPIs,
  getPlatformSalesTrend,
  getTopMerchants,
  getGPVConcentration,
  getChurnWarnings,
  getDeviceStabilityIndex,
  getVersionDrillDown,
  getTerminalUtilization,
  getFleetHealth,
  getMerchantOnboardingFunnel,
  getMerchantActivationTimeline,
  getPaymentMethodMix,
  getVoidRefundIntelligence,
  getDiscountUsageAnalysis,
  getStaffLaborAnalytics,
  getPaymentTerminalHealth,
  getKDSThroughputAnalytics,
  getAuditLogAnalytics,
  getLocationDensity,
  type PlatformAuditLogFilters,
  type PlatformAuditLogsResult,
} from '@/app/manage/actions/hq-platform/analytics'
import {
  getPlatformChargebacks,
  getPlatformMerchantBreakdown,
  getPlatformPaymentAuditLogs,
  getPlatformSettlementBatchPayments,
  getPlatformSettlementBatches,
  getPlatformTransactionDetails,
  getPlatformTransactionSummary,
  getPlatformTransactionStats,
  getPlatformTransactions,
  PlatformChargebackFilters,
  PlatformPaymentAuditLogFilters,
  PlatformMerchantBreakdownFilters,
  PlatformSettlementBatchFilters,
  PlatformTransactionFilters
} from '@/app/manage/actions/hq-platform/transactions'

export const platformKeys = {
  all: ['platform'] as const,
  kpis: () => [...platformKeys.all, 'kpis'] as const,
  salesTrend: () => [...platformKeys.all, 'sales-trend'] as const,
  topMerchants: () => [...platformKeys.all, 'top-merchants'] as const,
  gpvConcentration: (days: number) => [...platformKeys.all, 'gpv-concentration', days] as const,
  churnWarnings: () => [...platformKeys.all, 'churn-warnings'] as const,
  deviceStability: (days: number) => [...platformKeys.all, 'device-stability', days] as const,
  versionDrillDown: (version: string, days: number) => [...platformKeys.all, 'version-drilldown', version, days] as const,
  terminalUtilization: (days: number) => [...platformKeys.all, 'terminal-utilization', days] as const,
  fleetHealth: () => [...platformKeys.all, 'fleet-health'] as const,
  onboardingFunnel: () => [...platformKeys.all, 'onboarding-funnel'] as const,
  activationTimeline: () => [...platformKeys.all, 'activation-timeline'] as const,
  paymentMethodMix: (days: number) => [...platformKeys.all, 'payment-method-mix', days] as const,
  voidRefundIntelligence: (days: number) => [...platformKeys.all, 'void-refund', days] as const,
  discountUsageAnalysis: (days: number) => [...platformKeys.all, 'discount-abuse', days] as const,
  staffLaborAnalytics: (days: number) => [...platformKeys.all, 'staff-labor', days] as const,
  orderTypeIntelligence: (days: number) => [...platformKeys.all, 'order-type', days] as const,
  multiLocationComparison: (days: number) => [...platformKeys.all, 'multi-location', days] as const,
  paymentTerminalHealth: () => [...platformKeys.all, 'payment-terminal-health'] as const,
  kdsThroughput: (days: number) => [...platformKeys.all, 'kds-throughput', days] as const,
  auditLogAnalytics: (days: number) => [...platformKeys.all, 'audit-log-analytics', days] as const,
  locationDensity: () => [...platformKeys.all, 'location-density'] as const,
  transactions: (limit: number, offset: number, filters?: PlatformTransactionFilters) => [...platformKeys.all, 'transactions', { limit, offset, ...filters }] as const,
  transactionStats: (filters?: PlatformTransactionFilters) => [...platformKeys.all, 'transaction-stats', filters] as const,
  transactionSummary: (filters?: PlatformTransactionFilters) => [...platformKeys.all, 'transaction-summary', filters] as const,
  merchantBreakdown: (filters?: PlatformMerchantBreakdownFilters) => [...platformKeys.all, 'merchant-breakdown', filters] as const,
  settlementBatches: (filters?: PlatformSettlementBatchFilters) => [...platformKeys.all, 'settlement-batches', filters] as const,
  settlementBatchPayments: (batchId: string | null, merchantId?: string) =>
    [...platformKeys.all, 'settlement-batch-payments', batchId, merchantId] as const,
  chargebacks: (filters?: PlatformChargebackFilters, limit: number = 50, offset: number = 0) =>
    [...platformKeys.all, 'chargebacks', filters, limit, offset] as const,
  paymentAuditLogs: (filters?: PlatformPaymentAuditLogFilters, limit: number = 50, offset: number = 0) =>
    [...platformKeys.all, 'payment-audit-logs', filters, limit, offset] as const,
  transactionDetails: (transactionId: string | null) => [...platformKeys.all, 'transaction-details', transactionId] as const,
  auditLogs: (filters?: PlatformAuditLogFilters, limit: number = 50, offset: number = 0) =>
    [...platformKeys.all, 'audit-logs', filters, limit, offset] as const,
}

export function usePlatformKPIs() {
  return useQuery({
    queryKey: platformKeys.kpis(),
    queryFn: () => getPlatformKPIs(),
    refetchInterval: 60 * 1000, // auto-refresh every 60 seconds per TICKET-005
  })
}

export function usePlatformSalesTrend() {
  return useQuery({
    queryKey: platformKeys.salesTrend(),
    queryFn: () => getPlatformSalesTrend(),
    staleTime: 30_000,
    refetchOnMount: 'always',
  })
}

export function useTopMerchants(limit: number = 5) {
  return useQuery({
    queryKey: [...platformKeys.topMerchants(), limit],
    queryFn: () => getTopMerchants(limit),
  })
}

export function useGPVConcentration(days: number = 30) {
  return useQuery({
    queryKey: platformKeys.gpvConcentration(days),
    queryFn: () => getGPVConcentration(days),
  })
}

export function usePlatformTransactions(limit: number = 50, offset: number = 0, filters?: PlatformTransactionFilters) {
  return useQuery({
    queryKey: platformKeys.transactions(limit, offset, filters),
    queryFn: () => getPlatformTransactions(limit, offset, filters),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnMount: 'always',
  })
}

export function usePlatformTransactionStats(filters?: PlatformTransactionFilters) {
  return useQuery({
    queryKey: platformKeys.transactionStats(filters),
    queryFn: () => getPlatformTransactionStats(filters),
  })
}

export function usePlatformTransactionSummary(filters?: PlatformTransactionFilters) {
  return useQuery({
    queryKey: platformKeys.transactionSummary(filters),
    queryFn: () => getPlatformTransactionSummary(filters),
    staleTime: 30_000,
    refetchOnMount: 'always',
  })
}

export function usePlatformMerchantBreakdown(filters?: PlatformMerchantBreakdownFilters) {
  return useQuery({
    queryKey: platformKeys.merchantBreakdown(filters),
    queryFn: () => getPlatformMerchantBreakdown(filters),
  })
}

export function usePlatformSettlementBatches(filters?: PlatformSettlementBatchFilters) {
  return useQuery({
    queryKey: platformKeys.settlementBatches(filters),
    queryFn: () => getPlatformSettlementBatches(filters),
  })
}

export function usePlatformSettlementBatchPayments(
  batchId: string | null,
  merchantId?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: platformKeys.settlementBatchPayments(batchId, merchantId),
    queryFn: () => getPlatformSettlementBatchPayments(batchId!, merchantId),
    enabled: enabled && !!batchId,
    staleTime: 30_000,
  })
}

export function usePlatformChargebacks(
  filters?: PlatformChargebackFilters,
  limit: number = 50,
  offset: number = 0
) {
  return useQuery({
    queryKey: platformKeys.chargebacks(filters, limit, offset),
    queryFn: () => getPlatformChargebacks(filters, limit, offset),
    placeholderData: keepPreviousData,
  })
}

export function usePlatformPaymentAuditLogs(
  filters?: PlatformPaymentAuditLogFilters,
  limit: number = 50,
  offset: number = 0
) {
  return useQuery({
    queryKey: platformKeys.paymentAuditLogs(filters, limit, offset),
    queryFn: () => getPlatformPaymentAuditLogs(filters, limit, offset),
    placeholderData: keepPreviousData,
  })
}

export function usePlatformTransactionDetails(transactionId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: platformKeys.transactionDetails(transactionId),
    queryFn: () => getPlatformTransactionDetails(transactionId!),
    enabled: enabled && !!transactionId,
    staleTime: 30_000,
  })
}

export function usePlatformAuditLogs(filters?: PlatformAuditLogFilters, limit: number = 50, offset: number = 0) {
  return useQuery({
    queryKey: platformKeys.auditLogs(filters, limit, offset),
    queryFn: async (): Promise<PlatformAuditLogsResult> =>
      import('@/app/manage/actions/hq-platform/analytics').then((m) =>
        m.getPlatformAuditLogs(filters, limit, offset)
      ),
    placeholderData: keepPreviousData,
  })
}

export function useChurnWarnings() {
  return useQuery({
    queryKey: platformKeys.churnWarnings(),
    queryFn: () => getChurnWarnings(),
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  })
}

export function useDeviceStability(days: number = 30) {
  return useQuery({
    queryKey: platformKeys.deviceStability(days),
    queryFn: () => getDeviceStabilityIndex(days),
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useVersionDrillDown(version: string | null, days: number = 30) {
  return useQuery({
    queryKey: platformKeys.versionDrillDown(version || '', days),
    queryFn: () => getVersionDrillDown(version!, days),
    enabled: !!version,
  })
}

export function useTerminalUtilization(days: number = 30) {
  return useQuery({
    queryKey: platformKeys.terminalUtilization(days),
    queryFn: () => getTerminalUtilization(days),
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  })
}

export function useFleetHealth() {
  return useQuery({
    queryKey: platformKeys.fleetHealth(),
    queryFn: () => getFleetHealth(),
    refetchInterval: 60 * 1000, // Refresh every minute — real-time feel
  })
}

export function useMerchantOnboardingFunnel() {
  return useQuery({
    queryKey: platformKeys.onboardingFunnel(),
    queryFn: () => getMerchantOnboardingFunnel(),
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useMerchantActivationTimeline() {
  return useQuery({
    queryKey: platformKeys.activationTimeline(),
    queryFn: () => getMerchantActivationTimeline(),
    refetchInterval: 5 * 60 * 1000,
  })
}

export function usePaymentMethodMix(days: number = 30) {
  return useQuery({
    queryKey: platformKeys.paymentMethodMix(days),
    queryFn: () => getPaymentMethodMix(days),
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useVoidRefundIntelligence(days: number = 30) {
  return useQuery({
    queryKey: platformKeys.voidRefundIntelligence(days),
    queryFn: () => getVoidRefundIntelligence(days),
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useDiscountUsageAnalysis(days: number = 30) {
  return useQuery({
    queryKey: platformKeys.discountUsageAnalysis(days),
    queryFn: () => getDiscountUsageAnalysis(days),
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useStaffLaborAnalytics(days: number = 30) {
  return useQuery({
    queryKey: platformKeys.staffLaborAnalytics(days),
    queryFn: () => getStaffLaborAnalytics(days),
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useOrderTypeIntelligence(days: number = 30) {
  return useQuery({
    queryKey: platformKeys.orderTypeIntelligence(days),
    queryFn: () => import('@/app/manage/actions/hq-platform/analytics').then(m => m.getOrderTypeIntelligence(days)),
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useMultiLocationComparison(days: number = 30) {
  return useQuery({
    queryKey: platformKeys.multiLocationComparison(days),
    queryFn: () => import('@/app/manage/actions/hq-platform/analytics').then(m => m.getMultiLocationComparison(days)),
    refetchInterval: 5 * 60 * 1000,
  })
}

export function usePaymentTerminalHealth() {
  return useQuery({
    queryKey: platformKeys.paymentTerminalHealth(),
    queryFn: () => getPaymentTerminalHealth(),
    refetchInterval: 60 * 1000, // Refresh every minute — real-time hardware monitor
  })
}

export function useKDSThroughput(days: number = 7) {
  return useQuery({
    queryKey: platformKeys.kdsThroughput(days),
    queryFn: () => getKDSThroughputAnalytics(days),
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useAuditLogAnalytics(days: number = 30) {
  return useQuery({
    queryKey: platformKeys.auditLogAnalytics(days),
    queryFn: () => getAuditLogAnalytics(days),
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useLocationDensity() {
  return useQuery({
    queryKey: platformKeys.locationDensity(),
    queryFn: () => getLocationDensity(),
    refetchInterval: 5 * 60 * 1000,
  })
}
