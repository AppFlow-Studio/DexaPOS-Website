import { useQuery } from '@tanstack/react-query'
import {
  getPlatformKPIs,
  getPlatformSalesTrend,
  getTopMerchants,
  getGPVConcentration,
  getChurnWarnings,
  getDeviceStabilityIndex,
  getVersionDrillDown
} from '@/app/manage/actions/hq-platform/analytics'
import { getPlatformTransactions } from '@/app/manage/actions/hq-platform/transactions'

export const platformKeys = {
  all: ['platform'] as const,
  kpis: () => [...platformKeys.all, 'kpis'] as const,
  salesTrend: () => [...platformKeys.all, 'sales-trend'] as const,
  topMerchants: () => [...platformKeys.all, 'top-merchants'] as const,
  gpvConcentration: (days: number) => [...platformKeys.all, 'gpv-concentration', days] as const,
  transactions: (limit: number, offset: number) => [...platformKeys.all, 'transactions', { limit, offset }] as const,
  churnWarnings: () => [...platformKeys.all, 'churn-warnings'] as const,
  deviceStability: (days: number) => [...platformKeys.all, 'device-stability', days] as const,
  versionDrillDown: (version: string, days: number) => [...platformKeys.all, 'version-drilldown', version, days] as const,
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

export function useGPVConcentration(days: number = 30) {
  return useQuery({
    queryKey: platformKeys.gpvConcentration(days),
    queryFn: () => getGPVConcentration(days),
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
