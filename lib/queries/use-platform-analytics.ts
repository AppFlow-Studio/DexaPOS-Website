import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  getPlatformKPIs,
  getPlatformSalesTrend,
  getTopMerchants
} from '@/app/manage/actions/hq-platform/analytics'
import {
  getPlatformMerchantBreakdown,
  getPlatformSettlementBatchPayments,
  getPlatformSettlementBatches,
  getPlatformTransactionDetails,
  getPlatformTransactionSummary,
  getPlatformTransactionStats,
  getPlatformTransactions,
  PlatformMerchantBreakdownFilters,
  PlatformSettlementBatchFilters,
  PlatformTransactionFilters
} from '@/app/manage/actions/hq-platform/transactions'

export const platformKeys = {
  all: ['platform'] as const,
  kpis: () => [...platformKeys.all, 'kpis'] as const,
  salesTrend: () => [...platformKeys.all, 'sales-trend'] as const,
  topMerchants: () => [...platformKeys.all, 'top-merchants'] as const,
  transactions: (limit: number, offset: number, filters?: PlatformTransactionFilters) => [...platformKeys.all, 'transactions', { limit, offset, ...filters }] as const,
  transactionStats: (filters?: PlatformTransactionFilters) => [...platformKeys.all, 'transaction-stats', filters] as const,
  transactionSummary: (filters?: PlatformTransactionFilters) => [...platformKeys.all, 'transaction-summary', filters] as const,
  merchantBreakdown: (filters?: PlatformMerchantBreakdownFilters) => [...platformKeys.all, 'merchant-breakdown', filters] as const,
  settlementBatches: (filters?: PlatformSettlementBatchFilters) => [...platformKeys.all, 'settlement-batches', filters] as const,
  settlementBatchPayments: (batchId: string | null, merchantId?: string) =>
    [...platformKeys.all, 'settlement-batch-payments', batchId, merchantId] as const,
  transactionDetails: (transactionId: string | null) => [...platformKeys.all, 'transaction-details', transactionId] as const,
}

export function usePlatformKPIs() {
  return useQuery({
    queryKey: platformKeys.kpis(),
    queryFn: () => getPlatformKPIs(),
  })
}

export function usePlatformSalesTrend() {
  return useQuery({
    queryKey: platformKeys.salesTrend(),
    queryFn: () => getPlatformSalesTrend(),
  })
}

export function useTopMerchants(limit: number = 5) {
  return useQuery({
    queryKey: [...platformKeys.topMerchants(), limit],
    queryFn: () => getTopMerchants(limit),
  })
}

export function usePlatformTransactions(limit: number = 50, offset: number = 0, filters?: PlatformTransactionFilters) {
  return useQuery({
    queryKey: platformKeys.transactions(limit, offset, filters),
    queryFn: () => getPlatformTransactions(limit, offset, filters),
    placeholderData: keepPreviousData,
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

export function usePlatformTransactionDetails(transactionId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: platformKeys.transactionDetails(transactionId),
    queryFn: () => getPlatformTransactionDetails(transactionId!),
    enabled: enabled && !!transactionId,
    staleTime: 30_000,
  })
}

export function usePlatformAuditLogs(filters?: any, limit: number = 50, offset: number = 0) {
  return useQuery({
    queryKey: [...platformKeys.all, 'audit-logs', filters, limit, offset],
    queryFn: () => import('@/app/manage/actions/hq-platform/analytics').then(m => m.getPlatformAuditLogs(filters, limit, offset)),
  })
}
