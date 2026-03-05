"use client";

import { useQuery } from "@tanstack/react-query";
import { GetCustomerOrders } from "@/app/dashboard/actions/order";
import type { OrderResponse } from "@/types/order-management";

/**
 * Fetch all orders for a specific customer, optionally filtered by location
 */
export function useCustomerOrders(customerId: string | null, locationId?: string) {
  return useQuery<OrderResponse[]>({
    queryKey: ["customer", "orders", customerId, locationId],
    queryFn: () => (customerId ? GetCustomerOrders(customerId, locationId) : Promise.resolve([])),
    enabled: !!customerId,
    staleTime: 30000, // 30 seconds
  });
}
