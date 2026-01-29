import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CustomerListItem, CustomerActivity } from '@/types/customer'

export function useAdminCustomers(clerkOrgId: string) {
    return useQuery<CustomerListItem[]>({
        queryKey: ['admin', 'customers', clerkOrgId],
        queryFn: async () => {
             // Placeholder: Replace with actual server action call
             return []
        },
        enabled: !!clerkOrgId,
    })
}

interface AdminCustomerProfileData {
    customer: CustomerListItem & {
        tags?: string[];
        notes?: string | null;
        last_order_date?: string;
        lifetime_spend?: number;
        avg_spend?: number;
        avg_tip_percent?: number;
        total_orders?: number;
        visits?: number;
    };
    order_channels?: any[];
    most_ordered_items?: { item_id: string; item_name: string; total_quantity: number }[];
    recent_activity?: CustomerActivity[];
}

export function useAdminCustomerProfile(customerId: string | null) {
    return useQuery<AdminCustomerProfileData | null>({
        queryKey: ['admin', 'customer', 'profile', customerId],
        queryFn: async () => {
             // Placeholder: Replace with actual server action call
             if (!customerId) return null;
             return null
        },
        enabled: !!customerId,
    })
}

export function useAdminAddCustomerTag() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ customerId, tag }: { customerId: string; tag: string }) => {
            // Placeholder
            return { success: true }
        },
        onSuccess: (_, { customerId }) => {
            queryClient.invalidateQueries({
                queryKey: ['admin', 'customer', 'profile', customerId]
            })
        }
    })
}

export function useAdminUpdateCustomerNotes() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ customerId, notes }: { customerId: string; notes: string }) => {
            // Placeholder
            return { success: true }
        },
        onSuccess: (_, { customerId }) => {
            queryClient.invalidateQueries({
                queryKey: ['admin', 'customer', 'profile', customerId]
            })
        }
    })
}
