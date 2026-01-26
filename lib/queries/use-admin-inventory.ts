import { useQuery } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'

// Types
export interface AdminInventoryItem {
    id: string
    name: string
    sku?: string
    category?: string
    current_stock: number
    unit_type: string
    stock_mode: 'in_stock' | 'out_of_stock' | 'low_stock' | 'manual'
    reorder_point?: number
    cost_per_unit: number
    location_count?: number
}

export interface AdminVendor {
    id: string
    name: string
    location_id?: string
    contact_name?: string
    email?: string
    phone?: string
    city?: string
    state?: string
    total_spend?: number
    total_orders?: number
}

export interface AdminInventoryStats {
    totalItems: number
    lowStock: number
    outOfStock: number
    totalValue: number
}

// Hooks
export function useAdminInventoryItems(clerkOrgId: string, locationId: string | null) {
    return useQuery<AdminInventoryItem[]>({
        queryKey: ['admin', 'inventory', 'items', clerkOrgId, locationId],
        queryFn: async () => {
             // Placeholder: Replace with actual server action call
             // const response = await getAdminInventoryItems(clerkOrgId, locationId)
             return []
        },
        enabled: !!clerkOrgId,
    })
}

export function useAdminVendors(clerkOrgId: string, locationId: string | null) {
    return useQuery<AdminVendor[]>({
        queryKey: ['admin', 'inventory', 'vendors', clerkOrgId, locationId],
        queryFn: async () => {
             // Placeholder: Replace with actual server action call
             return []
        },
        enabled: !!clerkOrgId,
    })
}

export function useAdminInventoryStats(clerkOrgId: string, locationId: string | null) {
    return useQuery<AdminInventoryStats>({
        queryKey: ['admin', 'inventory', 'stats', clerkOrgId, locationId],
        queryFn: async () => {
             // Placeholder: Replace with actual server action call
             return {
                 totalItems: 0,
                 lowStock: 0,
                 outOfStock: 0,
                 totalValue: 0
             }
        },
        enabled: !!clerkOrgId,
    })
}
