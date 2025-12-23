'use client'

import { useQuery } from '@tanstack/react-query'
import { useLocationStore, useIsAllLocations } from '@/stores/location-store'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import { GetOrders } from '../actions/order'
import { Order, OrderResponse } from '@/types/order-management'

/**
 * Get clerk organization ID from user info
 */
function useClerkOrgId() {
    const { data: userInfo } = useUserInfo()
    return userInfo?.members?.[0]?.organizations?.id || ''
}

/**
 * Get orders scoped to the current location selection
 * - All Locations: returns all merchant orders
 * - Specific Location: returns orders for that location
 */
export function useOrders() {
    const clerkOrgId = useClerkOrgId()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    // Determine effective location ID
    const effectiveLocationId = isAllLocations ? 'all' : selectedLocationId

    return useQuery<OrderResponse[]>({
        queryKey: ['orders', clerkOrgId, effectiveLocationId],
        queryFn: () => GetOrders(clerkOrgId, effectiveLocationId === 'all' ? null : effectiveLocationId) as Promise<OrderResponse[]>,
        enabled: !!clerkOrgId,
        staleTime: 30000, // 30 seconds
    })
}

