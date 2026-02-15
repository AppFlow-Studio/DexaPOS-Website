import { useQuery } from '@tanstack/react-query'
import {
  getPlatformKPIs,
  getPlatformSalesTrend,
  getTopMerchants
} from '@/app/manage/actions/hq-platform/analytics'
import {
  getPlatformTransactionDetails,
  getPlatformTransactions,
  PlatformTransactionFilters
} from '@/app/manage/actions/hq-platform/transactions'

export const platformKeys = {
  all: ['platform'] as const,
  kpis: () => [...platformKeys.all, 'kpis'] as const,
  salesTrend: () => [...platformKeys.all, 'sales-trend'] as const,
  topMerchants: () => [...platformKeys.all, 'top-merchants'] as const,
  transactions: (limit: number, offset: number, filters?: PlatformTransactionFilters) => [...platformKeys.all, 'transactions', { limit, offset, ...filters }] as const,
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
  })
}

export function usePlatformTransactionDetails(transactionId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: platformKeys.transactionDetails(transactionId),
    queryFn: () => getPlatformTransactionDetails(transactionId!),
    enabled: enabled && !!transactionId,
  })
}

export function usePlatformAuditLogs(filters?: any, limit: number = 50, offset: number = 0) {
  return useQuery({
    queryKey: [...platformKeys.all, 'audit-logs', filters, limit, offset],
    queryFn: () => import('@/app/manage/actions/hq-platform/analytics').then(m => m.getPlatformAuditLogs(filters, limit, offset)),
  })
}
