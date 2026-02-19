import { useQuery } from '@tanstack/react-query'
import {
  getPlatformDashboardKPIs,
  getPlatformStationFleet,
  getPlatformOrdersHeatmap,
  getPlatformAlerts,
  PlatformDashboardKPIs,
  MerchantStationGroup,
  HourlyOrderCount,
  PlatformAlert,
} from '@/app/manage/actions/hq-platform/dashboard'

// Query key factory
export const platformDashboardKeys = {
  all: ['platform', 'dashboard'] as const,
  kpis: () => [...platformDashboardKeys.all, 'kpis'] as const,
  stationFleet: () => [...platformDashboardKeys.all, 'station-fleet'] as const,
  ordersHeatmap: () => [...platformDashboardKeys.all, 'orders-heatmap'] as const,
  alerts: () => [...platformDashboardKeys.all, 'alerts'] as const,
}

/**
 * Fetch dashboard KPIs with 60-second auto-refresh
 */
export function usePlatformDashboardKPIs() {
  return useQuery<PlatformDashboardKPIs>({
    queryKey: platformDashboardKeys.kpis(),
    queryFn: () => getPlatformDashboardKPIs(),
    refetchInterval: 60_000, // Refresh every 60 seconds
    staleTime: 45_000, // Data is fresh for 45 seconds
  })
}

/**
 * Fetch station fleet with health status and 60-second auto-refresh
 */
export function usePlatformStationFleet() {
  return useQuery<MerchantStationGroup[]>({
    queryKey: platformDashboardKeys.stationFleet(),
    queryFn: () => getPlatformStationFleet(),
    refetchInterval: 60_000, // Refresh every 60 seconds
    staleTime: 45_000, // Data is fresh for 45 seconds
  })
}

/**
 * Fetch 24-hour order heatmap with 60-second auto-refresh
 */
export function usePlatformOrdersHeatmap() {
  return useQuery<HourlyOrderCount[]>({
    queryKey: platformDashboardKeys.ordersHeatmap(),
    queryFn: () => getPlatformOrdersHeatmap(),
    refetchInterval: 60_000, // Refresh every 60 seconds
    staleTime: 45_000, // Data is fresh for 45 seconds
  })
}

/**
 * Fetch computed alerts with 60-second auto-refresh
 */
export function usePlatformAlerts() {
  return useQuery<PlatformAlert[]>({
    queryKey: platformDashboardKeys.alerts(),
    queryFn: () => getPlatformAlerts(),
    refetchInterval: 60_000, // Refresh every 60 seconds
    staleTime: 45_000, // Data is fresh for 45 seconds
  })
}
