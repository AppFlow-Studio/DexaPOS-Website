import { useQuery } from '@tanstack/react-query'
import { 
  getPlatformKPIs, 
  getPlatformSalesTrend, 
  getTopMerchants 
} from '@/app/manage/actions/hq-platform/analytics'
import { getPlatformTransactions } from '@/app/manage/actions/hq-platform/transactions'

export const platformKeys = {
  all: ['platform'] as const,
  kpis: () => [...platformKeys.all, 'kpis'] as const,
  salesTrend: () => [...platformKeys.all, 'sales-trend'] as const,
  topMerchants: () => [...platformKeys.all, 'top-merchants'] as const,
  transactions: (limit: number, offset: number) => [...platformKeys.all, 'transactions', { limit, offset }] as const,
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

export function usePlatformTransactions(limit: number = 50, offset: number = 0) {
  return useQuery({
    queryKey: platformKeys.transactions(limit, offset),
    queryFn: () => getPlatformTransactions(limit, offset),
  })
}

export function usePlatformAuditLogs(filters?: any, limit: number = 50, offset: number = 0) {
  return useQuery({
    queryKey: [...platformKeys.all, 'audit-logs', filters, limit, offset],
    queryFn: () => import('@/app/manage/actions/hq-platform/analytics').then(m => m.getPlatformAuditLogs(filters, limit, offset)),
  })
}
