import { useQuery } from '@tanstack/react-query'
import {
  getPlatformGrowthMetrics,
  GrowthMetrics,
} from '@/app/manage/actions/hq-platform/analytics-growth'
import {
  getPlatformRevenueMetrics,
  RevenueMetrics,
} from '@/app/manage/actions/hq-platform/analytics-revenue'
import {
  getPlatformOperationalMetrics,
  OperationalMetrics,
} from '@/app/manage/actions/hq-platform/analytics-operations'
import {
  getPlatformPaymentMetrics,
  PaymentMetrics,
} from '@/app/manage/actions/hq-platform/analytics-payments'

// Query key factory
export const platformAnalyticsKeys = {
  all: ['platform-analytics'] as const,
  growth: (from: string, to: string) => [...platformAnalyticsKeys.all, 'growth', from, to] as const,
  revenue: (from: string, to: string) => [...platformAnalyticsKeys.all, 'revenue', from, to] as const,
  operations: (from: string, to: string) =>
    [...platformAnalyticsKeys.all, 'operations', from, to] as const,
  payments: (from: string, to: string) => [...platformAnalyticsKeys.all, 'payments', from, to] as const,
}

/**
 * Fetch platform growth metrics (merchant acquisition, retention, funnel, etc.)
 */
export function usePlatformGrowthMetrics(from: string, to: string) {
  return useQuery<GrowthMetrics>({
    queryKey: platformAnalyticsKeys.growth(from, to),
    queryFn: () => getPlatformGrowthMetrics(from, to),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: false,
  })
}

/**
 * Fetch platform revenue metrics (GMV, payment mix, tip rate, etc.)
 */
export function usePlatformRevenueMetrics(from: string, to: string) {
  return useQuery<RevenueMetrics>({
    queryKey: platformAnalyticsKeys.revenue(from, to),
    queryFn: () => getPlatformRevenueMetrics(from, to),
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
  })
}

/**
 * Fetch platform operational metrics (kitchen time, peak hours, adoption rates, etc.)
 */
export function usePlatformOperationalMetrics(from: string, to: string) {
  return useQuery<OperationalMetrics>({
    queryKey: platformAnalyticsKeys.operations(from, to),
    queryFn: () => getPlatformOperationalMetrics(from, to),
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
  })
}

/**
 * Fetch platform payment metrics (transaction volume, failure rate, chargebacks, etc.)
 */
export function usePlatformPaymentMetrics(from: string, to: string) {
  return useQuery<PaymentMetrics>({
    queryKey: platformAnalyticsKeys.payments(from, to),
    queryFn: () => getPlatformPaymentMetrics(from, to),
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
  })
}
