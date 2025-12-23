'use client'

import { useQuery } from '@tanstack/react-query'
import { useLocationStore, useIsAllLocations } from '@/stores/location-store'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import {
    GetOrderAnalytics,
    GetSalesByDateRange,
    GetBestSellingItems,
    GetOrderTypeBreakdown,
    GetOrderStats,
    OrderAnalytics,
    SalesByDateRange,
    BestSellingItem,
    OrderTypeBreakdown,
    OrderStats,
} from '../actions/order-analytics'

/**
 * Get clerk organization ID from user info
 */
function useClerkOrgId() {
    const { data: userInfo } = useUserInfo()
    return userInfo?.members?.[0]?.organizations?.id || ''
}

/**
 * Main analytics hook
 */
export function useOrderAnalytics(
    dateFrom: Date,
    dateTo: Date
) {
    const clerkOrgId = useClerkOrgId()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    const effectiveLocationId = isAllLocations ? null : selectedLocationId

    return useQuery<OrderAnalytics>({
        queryKey: ['order-analytics', clerkOrgId, effectiveLocationId, dateFrom.toISOString(), dateTo.toISOString()],
        queryFn: () => GetOrderAnalytics(clerkOrgId, effectiveLocationId, dateFrom, dateTo),
        enabled: !!clerkOrgId,
        staleTime: 2 * 60 * 1000, // 2 minutes
        refetchOnWindowFocus: false,
    })
}

/**
 * Sales by date range hook
 */
export function useSalesByDateRange(
    dateFrom: Date,
    dateTo: Date
) {
    const clerkOrgId = useClerkOrgId()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    const effectiveLocationId = isAllLocations ? null : selectedLocationId

    return useQuery<SalesByDateRange[]>({
        queryKey: ['sales-by-date-range', clerkOrgId, effectiveLocationId, dateFrom.toISOString(), dateTo.toISOString()],
        queryFn: () => GetSalesByDateRange(clerkOrgId, effectiveLocationId, dateFrom, dateTo),
        enabled: !!clerkOrgId,
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: false,
    })
}

/**
 * Best selling items hook
 */
export function useBestSellingItems(
    dateFrom: Date,
    dateTo: Date,
    limit: number = 10
) {
    const clerkOrgId = useClerkOrgId()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    const effectiveLocationId = isAllLocations ? null : selectedLocationId

    return useQuery<BestSellingItem[]>({
        queryKey: ['best-selling-items', clerkOrgId, effectiveLocationId, dateFrom.toISOString(), dateTo.toISOString(), limit],
        queryFn: () => GetBestSellingItems(clerkOrgId, effectiveLocationId, dateFrom, dateTo, limit),
        enabled: !!clerkOrgId,
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: false,
    })
}

/**
 * Order type breakdown hook
 */
export function useOrderTypeBreakdown(
    dateFrom: Date,
    dateTo: Date
) {
    const clerkOrgId = useClerkOrgId()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    const effectiveLocationId = isAllLocations ? null : selectedLocationId

    return useQuery<OrderTypeBreakdown>({
        queryKey: ['order-type-breakdown', clerkOrgId, effectiveLocationId, dateFrom.toISOString(), dateTo.toISOString()],
        queryFn: () => GetOrderTypeBreakdown(clerkOrgId, effectiveLocationId, dateFrom, dateTo),
        enabled: !!clerkOrgId,
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: false,
    })
}

/**
 * Order stats hook
 */
export function useOrderStats(
    dateFrom: Date,
    dateTo: Date
) {
    const clerkOrgId = useClerkOrgId()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    const effectiveLocationId = isAllLocations ? null : selectedLocationId

    return useQuery<OrderStats>({
        queryKey: ['order-stats', clerkOrgId, effectiveLocationId, dateFrom.toISOString(), dateTo.toISOString()],
        queryFn: () => GetOrderStats(clerkOrgId, effectiveLocationId, dateFrom, dateTo),
        enabled: !!clerkOrgId,
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: false,
    })
}

